// Alpha-beta search over all legal moves (including every legal wall).
// A pure module: runs both in a worker and in Node (tests). It does not depend on quoridor-ai —
// it only uses core/Rules, so it is a genuinely different engine behind the same interface.

import { Rules } from "../../core/rules.js";
import { pawnMove, wallMove } from "../../core/move.js";

const WIN = 1000;
const WALL_VALUE = 0.6; // how many path steps one wall in hand is worth
const TEMPO = 0.5;      // value of having the move
const SCALE = 3;        // an advantage of this many steps maps to a score of ~73%
const MAX_CANDIDATES = 5;

// Evaluation of the position for the side to move.
function evaluate(pos) {
  const me = pos.turn, opp = 1 - me;
  return Rules.shortestPathLength(pos, opp) - Rules.shortestPathLength(pos, me)
    + TEMPO + WALL_VALUE * (pos.pawns[me].walls - pos.pawns[opp].walls);
}

function legalMoves(pos) {
  const walls = Rules.legalWalls(pos);
  return [
    ...Rules.legalPawnMoves(pos).map((t) => pawnMove(t.row, t.col)),
    ...walls.horizontal.map((w) => wallMove("horizontal", w.row, w.col)),
    ...walls.vertical.map((w) => wallMove("vertical", w.row, w.col)),
  ];
}

export const toShare = (score) => 1 / (1 + Math.exp(-score / SCALE));

// Returns the AnalysisResult fields; candidates are sorted by score.
export function searchPosition(position, depth, onProgress = () => {}) {
  const started = Date.now();
  if (position.winner !== null) return { simulations: 0, elapsedMs: 0, totalCandidates: 0, rootValue: 0, candidates: [] };
  let nodes = 0;

  function negamax(pos, d, alpha, beta) {
    nodes++;
    // the player who just moved has won; the sooner, the worse for the side to move
    if (pos.winner !== null) return -(WIN + d);
    if (d === 0) return evaluate(pos);
    let best = -Infinity;
    for (const move of legalMoves(pos)) {
      const v = -negamax(Rules.applyMove(pos, move), d - 1, -beta, -alpha);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // root: try the moves that look best on a shallow evaluation first, so cut-offs happen earlier
  const root = legalMoves(position)
    .map((move) => {
      const next = Rules.applyMove(position, move);
      return { move, next, guess: next.winner !== null ? WIN : -evaluate(next) };
    })
    .sort((a, b) => b.guess - a.guess);

  const scored = [];
  let floor = -Infinity; // score of the 5th best move so far: exact values below it are not needed
  root.forEach((r, i) => {
    const before = nodes;
    const score = -negamax(r.next, depth - 1, -Infinity, -floor);
    scored.push({ move: r.move, score, visits: nodes - before });
    if (score > floor) {
      const top = scored.map((s) => s.score).sort((a, b) => b - a);
      if (top.length >= MAX_CANDIDATES) floor = top[MAX_CANDIDATES - 1];
    }
    onProgress((i + 1) / root.length);
  });
  scored.sort((a, b) => b.score - a.score); // stable: ties keep the root ordering

  return {
    simulations: nodes, // amount of work: for this engine, the node count
    elapsedMs: Date.now() - started,
    totalCandidates: root.length,
    rootValue: toShare(scored[0].score),
    candidates: scored.slice(0, MAX_CANDIDATES).map((s, i) => ({
      rank: i + 1, move: s.move, visits: s.visits, wins: null, winRate: toShare(s.score), score: s.score,
    })),
  };
}
