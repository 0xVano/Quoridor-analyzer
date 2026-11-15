// Cross-checks Rules against the quoridor-ai rules model on random games, then smoke-tests the
// worker code, notation/import, move evaluation, the alpha-beta engine and the EngineManager.
// Run: node test/crosscheck.mjs
import fs from "node:fs";
import vm from "node:vm";
import { Game } from "../src/core/game.js";
import { Rules } from "../src/core/rules.js";
import { pawnMove, wallMove } from "../src/core/move.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const messages = [];
const ctx = vm.createContext({ console: { log() {} }, postMessage: (m) => messages.push(m), importScripts() {} });
vm.runInContext(read("../vendor/quoridor-ai/game.js") + read("../vendor/quoridor-ai/ai.js"), ctx);
vm.runInContext(read("../src/workers/analysis-worker.js").replace('"use strict";', ""), ctx);
const toEngineGame = vm.runInContext("toEngineGame", ctx);

const key = (a) => a.map((x) => x.row * 9 + x.col).sort((x, y) => x - y).join(",");
let checked = 0, finished = 0;
for (let g = 0; g < 300; g++) {
  const game = new Game();
  for (let ply = 0; ply < 400 && game.position.winner === null; ply++) {
    const pos = game.position;
    const eg = toEngineGame(JSON.parse(JSON.stringify(pos)));
    const pawns = Rules.legalPawnMoves(pos);
    const walls = Rules.legalWalls(pos);
    const ePawns = [], eWalls = { horizontal: [], vertical: [] };
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (eg.validNextPositions[r][c]) ePawns.push({ row: r, col: c });
    if (pos.pawns[pos.turn].walls > 0) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if (eg.validNextWalls.horizontal[r][c] && eg.isPossibleNextMove([null, [r, c], null])) eWalls.horizontal.push({ row: r, col: c });
        if (eg.validNextWalls.vertical[r][c] && eg.isPossibleNextMove([null, null, [r, c]])) eWalls.vertical.push({ row: r, col: c });
      }
    }
    if (key(pawns) !== key(ePawns) || key(walls.horizontal) !== key(eWalls.horizontal) || key(walls.vertical) !== key(eWalls.vertical)) {
      console.error("MISMATCH", JSON.stringify(pos), key(pawns), key(ePawns));
      process.exit(1);
    }
    checked++;
    const all = [
      ...pawns.map((t) => pawnMove(t.row, t.col)),
      ...walls.horizontal.map((w) => wallMove("horizontal", w.row, w.col)),
      ...walls.vertical.map((w) => wallMove("vertical", w.row, w.col)),
    ];
    // prefer pawn moves so that games actually finish and jumps occur
    const pool = Math.random() < 0.6 ? all.slice(0, pawns.length) : all;
    const res = game.applyMove(pool[Math.floor(Math.random() * pool.length)]);
    if (!res.ok) throw new Error("legal move rejected: " + res.reason);
  }
  if (game.position.winner !== null) finished++;
  // no move may be accepted once the game is over
  if (game.applyMove(pawnMove(4, 4)).ok && game.position.winner !== null) throw new Error("move accepted after the game ended");
}
console.log(`rules matched in ${checked} positions, games finished: ${finished}/300`);

// history
const h = new Game();
h.applyMove(pawnMove(7, 4)); h.applyMove(pawnMove(1, 4)); h.applyMove(wallMove("horizontal", 1, 4));
h.undo(); h.undo();
if (!h.canRedo || h.cursor !== 1) throw new Error("undo");
h.applyMove(wallMove("vertical", 0, 3));
if (h.canRedo || h.moves.length !== 2) throw new Error("future branch not discarded");
if (h.applyMove(wallMove("horizontal", 0, 3)).ok) throw new Error("crossing walls allowed");
console.log("history: ok");

// analysis
for (const pos of [new Game().position, h.position]) {
  messages.length = 0;
  ctx.onmessage({ data: { type: "analyze", position: pos, simulations: 3000, uctConst: 0.2 } });
  const out = messages.at(-1);
  if (out.type !== "analysis-result" || !Rules.isLegalMove(pos, out.result.candidates[0].move)) throw new Error("analysis: " + JSON.stringify(out));
  console.log("analysis:", out.result.candidates.map((c) => `${c.rank}:${c.visits}/${c.winRate.toFixed(2)}`).join(" "), "progress messages:", messages.length - 1);
}

// notation and import
const { parseGameText, gameToText } = await import("../src/core/notation.js");
const text = gameToText(h.moves);
const parsed = parseGameText(text);
const g2 = new Game();
if (!g2.load(parsed.moves).ok || gameToText(g2.moves) !== text) throw new Error("import: " + text);
if (g2.load(parseGameText("1. e2 e8 2. e5").moves).ok || g2.moves.length !== h.moves.length) throw new Error("illegal import accepted");
if (!parseGameText("e2 z9").error) throw new Error("garbage accepted");
console.log("import/export: ok —", text);

// move evaluation
const { moveLoss, classifyLoss } = await import("../src/analysis/evaluation.js");
const P = new Game().position;
const mk = (wr, move) => ({ rootValue: wr, candidates: [{ move, winRate: wr }] });
const best = pawnMove(7, 4), other = pawnMove(8, 3);
if (moveLoss(mk(0.6, best), best, { ...P, turn: 1 }, mk(0.9, best)) !== 0) throw new Error("the best move must lose nothing");
const loss = moveLoss(mk(0.6, best), other, { ...P, turn: 1 }, mk(0.55, best));
if (Math.abs(loss - 0.15) > 1e-9 || classifyLoss(loss).id !== "blunder" || classifyLoss(0.05).id !== "inaccuracy") throw new Error("loss: " + loss);
console.log("move evaluation: ok");

// second engine and the manager
const { searchPosition } = await import("../src/engines/minimax/search.js");
const { EngineManager } = await import("../src/engines/engine-manager.js");
const near = new Game();
for (const m of ["e2","e8","e3","e7","e4","e6","e5","d6","e6","d5","e7","d4","e8","d3"]) near.applyMove(parseGameText(m).moves[0]);
const win = searchPosition(near.position, 2).candidates[0]; // White is on e8, one step from winning
if (win.move.type !== "pawn" || win.move.to.row !== 0 || win.winRate < 0.99) throw new Error("alpha-beta missed the win: " + JSON.stringify(win));
for (const d of [1, 2, 3]) {
  const r = searchPosition(h.position, d);
  if (r.candidates.length !== 5 || !r.candidates.every((c) => Rules.isLegalMove(h.position, c.move))) throw new Error("alpha-beta: candidates");
  console.log(`alpha-beta, depth ${d}: ${r.totalCandidates} moves, ${r.simulations} nodes, ${r.elapsedMs} ms, best`, JSON.stringify(r.candidates[0].move));
}
const fake = (id) => ({ stopped: 0, getInfo: () => ({ id }), stop() { this.stopped++; } });
const a = fake("a"), bEng = fake("b");
const mgr = new EngineManager().register(a).register(bEng);
if (mgr.currentId !== "a" || mgr.select("zzz") || mgr.select(null) || !mgr.select("b") || mgr.current !== bEng || a.stopped !== 1) throw new Error("EngineManager");
console.log("EngineManager: ok");
