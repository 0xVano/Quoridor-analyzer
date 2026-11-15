import { Game } from "../core/game.js";
import { Rules } from "../core/rules.js";
import { WALLS_PER_PLAYER } from "../core/position.js";
import { sameMove } from "../core/move.js";
import { moveToNotation, describeMove, parseGameText, gameToText } from "../core/notation.js";
import { EngineCancelled } from "../engines/engine.js";
import { EngineManager } from "../engines/engine-manager.js";
import { QuoridorAiMctsEngine } from "../engines/quoridor-ai-engine.js";
import { PathAlphaBetaEngine } from "../engines/path-alphabeta-engine.js";
import { Analyzer } from "../analysis/analyzer.js";
import { whiteShare, moveLoss, classifyLoss, stability, LOSS_CLASSES } from "../analysis/evaluation.js";
import { BoardView } from "./board-view.js";

const $ = (id) => document.getElementById(id);
const NAMES = ["White", "Black"];
const fmt = (n) => n.toLocaleString("en-US");
const pct = (v) => (v * 100).toFixed(1) + "%";
const pp = (v) => (v * 100).toFixed(1) + " pp";
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable — not critical */ } },
};

const game = new Game();
// To plug in a new engine, register it here. Nothing else in the UI needs to change.
const engines = new EngineManager()
  .register(new QuoridorAiMctsEngine())
  .register(new PathAlphaBetaEngine());
engines.select(store.get("quoridor.engine"));
const analyzer = new Analyzer(engines);
const budgets = {}; // the budget chosen for each engine

let mode = "pawn";
let busy = null;          // null | { kind: "position", progress } | { kind: "game", done, total, progress }
let runId = 0;            // every start/cancel bumps the id so that stale replies are ignored
let errorText = null;
let topN = 5;
let showMode = "all";     // "all" | "selected"
let selectedRank = 1;
let auto = store.get("quoridor.auto") === "1";
let notice = null, noticeKind = "warn", noticeTimer = 0, resetArmed = 0;

const board = new BoardView($("board"), {
  onMove: play,
  onIllegal: (reason) => showNotice("Illegal: " + reason),
});

const budget = () => budgets[engines.currentId] ?? engines.info.defaultBudget;

function renderEngineControls() {
  const info = engines.info;
  $("engine").innerHTML = engines.list().map((e) => `<option value="${e.id}"${e.id === info.id ? " selected" : ""}>${e.name}</option>`).join("");
  $("budget-label").textContent = info.budgetLabel;
  $("budget").innerHTML = info.budgets.map((b) => `<option value="${b.value}"${b.value === budget() ? " selected" : ""}>${b.label}</option>`).join("");
}

// ---------- actions ----------

function play(move) {
  const res = game.applyMove(move);
  if (!res.ok) return showNotice("Illegal: " + res.reason);
  positionChanged(true);
}

function navigate(index) {
  if (game.goTo(index)) positionChanged(false);
}

// lineChanged: the game itself changed (new move, import, reset), not just the current position
function positionChanged(lineChanged) {
  // a game analysis survives navigation, but not a change to the game itself
  if (busy && (busy.kind === "position" || lineChanged)) stopBusy();
  selectedRank = 1;
  errorText = null;
  if (game.position.winner !== null || game.position.pawns[game.position.turn].walls === 0) mode = "pawn";
  render();
  if (auto) analyzeCurrent(false);
}

function showNotice(text, kind = "warn") {
  notice = text;
  noticeKind = kind;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice = null; renderStatus(); }, 2800);
  renderStatus();
}

function stopBusy() {
  runId++;
  analyzer.stop();
  busy = null;
}

function setBar(id, value) {
  $(id).firstElementChild.style.width = (value * 100).toFixed(1) + "%";
}

// force: recompute even if the cache already holds a result with this budget (manual run)
async function analyzeCurrent(force) {
  const position = game.position;
  if (position.winner !== null || busy) return;
  const cached = analyzer.getCached(position);
  if (!force && cached && cached.budget >= budget()) return;
  const id = ++runId;
  busy = { kind: "position", progress: 0 };
  errorText = null;
  renderAnalysis();
  try {
    await analyzer.analyzePosition(position, {
      budget: budget(), force,
      onProgress: (v) => { if (runId === id) { busy.progress = v; setBar("progress", v); } },
    });
  } catch (e) {
    if (runId !== id || e instanceof EngineCancelled) return;
    errorText = e.message;
  }
  if (runId !== id) return;
  busy = null;
  selectedRank = 1;
  render();
}

// Game review: analyzes every position in turn. Move ratings are then derived from the cache
// (see computeReview), so they appear as the analysis progresses.
async function analyzeGame() {
  if (busy) stopBusy();
  const id = ++runId;
  const positions = game.positions.slice();
  const gameBudget = budget();
  busy = { kind: "game", done: 0, total: positions.length, progress: 0 };
  errorText = null;
  render();
  try {
    for (let i = 0; i < positions.length; i++) {
      busy.done = i;
      await analyzer.analyzePosition(positions[i], {
        budget: gameBudget,
        onProgress: (v) => { if (runId === id) { busy.progress = (i + v) / positions.length; setBar("game-progress", busy.progress); } },
      });
      if (runId !== id) return;
      busy.done = i + 1;
      busy.progress = (i + 1) / positions.length;
      render();
    }
  } catch (e) {
    if (runId !== id || e instanceof EngineCancelled) return;
    errorText = e.message;
  }
  if (runId !== id) return;
  busy = null;
  render();
}

function cancel() {
  stopBusy();
  render();
}

// ---------- game review ----------

// For each move: { loss, cls }, or null if the neighbouring positions are not analyzed yet.
function computeReview() {
  return game.moves.map((move, k) => {
    const after = game.positions[k + 1];
    const loss = moveLoss(analyzer.getCached(game.positions[k]), move, after, analyzer.getCached(after));
    return loss === null ? null : { loss, cls: classifyLoss(loss) };
  });
}

// ---------- rendering ----------

function visibleCandidates() {
  const result = analyzer.getCached(game.position);
  return result ? result.candidates.slice(0, topN) : [];
}

function render() {
  const cands = visibleCandidates();
  if (selectedRank > cands.length) selectedRank = 1;
  const review = computeReview();
  board.render({
    position: game.position,
    lastMove: game.lastMove,
    mode,
    hints: (showMode === "all" ? cands : cands.filter((c) => c.rank === selectedRank)).map((c) => ({ move: c.move, rank: c.rank })),
  });
  renderPlayers();
  renderModes();
  renderStatus();
  renderAnalysis(review);
  renderHistory(review);
  renderReview(review);
}

function renderPlayers() {
  const pos = game.position;
  for (const i of [0, 1]) {
    const p = pos.pawns[i];
    const active = pos.winner === null && pos.turn === i;
    const pips = Array.from({ length: WALLS_PER_PLAYER }, (_, k) => `<i class="${k < p.walls ? "" : "off"}"></i>`).join("");
    const el = $("player-" + i);
    el.className = "player" + (active ? " active" : "");
    el.innerHTML =
      `<span class="disc" style="background:var(--${i ? "black" : "white"}-pawn)"></span>` +
      `<span class="name">${NAMES[i]}</span>` +
      (pos.winner === i ? `<span class="turn">won</span>` : active ? `<span class="turn">to move</span>` : "") +
      `<span class="meta"><span title="Shortest path to the goal">path ${Rules.shortestPathLength(pos, i)}</span>` +
      `<span class="pips" role="img" aria-label="Walls left: ${p.walls}">${pips}</span><span>${p.walls}</span></span>`;
  }
}

function renderModes() {
  const pos = game.position;
  const noWalls = pos.winner !== null || pos.pawns[pos.turn].walls === 0;
  for (const b of document.querySelectorAll(".modes button")) {
    b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    b.disabled = pos.winner !== null || (b.dataset.mode !== "pawn" && noWalls);
  }
}

function renderStatus() {
  const pos = game.position;
  const el = $("status");
  if (notice) {
    el.className = "status " + noticeKind;
    el.textContent = notice;
  } else if (pos.winner !== null) {
    el.className = "status win";
    el.textContent = `Game over — ${NAMES[pos.winner]} wins`;
  } else {
    el.className = "status";
    el.textContent = `Move ${Math.floor(pos.ply / 2) + 1} · ${NAMES[pos.turn]} to move`;
  }
}

function playedMoveHtml(result, review) {
  const played = game.moves[game.cursor];
  if (!played) return "";
  const cand = result.candidates.find((c) => sameMove(c.move, played));
  const where = cand ? `the engine's #${cand.rank}` : "outside the engine's top 5";
  const r = review[game.cursor];
  let verdict = "it will be rated once the next position is analyzed";
  if (r) {
    verdict = r.loss === 0 ? "no loss" : `loss ${pp(r.loss)}`;
    if (r.cls.id !== "ok") verdict += ` — <span class="c-${r.cls.id}">${r.cls.label}</span>`;
  }
  return `<p class="played">Played in the game: <b>${moveToNotation(played)}</b> (${where}) — ${verdict}.</p>`;
}

function renderAnalysis(review = computeReview()) {
  const pos = game.position;
  const running = busy && busy.kind === "position";
  const btn = $("analyze");
  btn.textContent = running ? "Cancel analysis" : "Analyze";
  btn.classList.toggle("running", !!running);
  btn.disabled = !running && (pos.winner !== null || !!busy);
  $("budget").disabled = $("engine").disabled = !!busy;
  const info = engines.info;
  $("progress").hidden = !running;
  if (running) setBar("progress", busy.progress);
  $("auto").checked = auto;
  for (const b of document.querySelectorAll(".seg button")) b.setAttribute("aria-checked", String(b.dataset.show === showMode));

  const out = $("result");
  const result = analyzer.getCached(pos);
  const cands = visibleCandidates();
  if (errorText) {
    out.innerHTML = `<p class="error">Analysis failed: ${errorText}. Please try again.</p>`;
  } else if (pos.winner !== null) {
    out.innerHTML = `<p class="hintline">The game is over, so there is nothing to analyze. Step back through the moves to analyze an earlier position.</p>`;
  } else if (cands.length) {
    const best = result.candidates[0];
    const white = pos.turn === 0 ? best.winRate : 1 - best.winRate;
    const lowVisits = info.sampling ? result.simulations * 0.02 : 0;
    const rows = cands.map((c) =>
      `<li><button type="button" class="cand r${c.rank}" data-rank="${c.rank}" aria-pressed="${c.rank === selectedRank}">` +
      `<span class="chip">${c.rank}</span>` +
      `<span class="mv"><b>${moveToNotation(c.move)}</b>${describeMove(c.move)}</span>` +
      `<span class="pct">${pct(c.winRate)}</span>` +
      `<span class="sub">${fmt(c.visits)} ${info.units.visits}${c.visits < lowVisits ? ` · <span class="tag">few visits — score unreliable</span>` : ""}</span>` +
      `</button></li>`).join("");
    const sel = cands.find((c) => c.rank === selectedRank) || cands[0];
    out.innerHTML =
      `<div class="evalbar" role="img" aria-label="${info.scoreLabel}: White ${pct(white)}, Black ${pct(1 - white)}">` +
      `<span class="w" style="width:${Math.max(16, Math.min(84, white * 100))}%">${pct(white)}</span><span class="b">${pct(1 - white)}</span></div>` +
      `<ol class="cands" aria-label="Engine candidates">${rows}</ol>` +
      playedMoveHtml(result, review) +
      `<button type="button" class="btn" id="play-best">Play ${moveToNotation(sel.move)}</button>` +
      `<dl><dt>${info.scoreLabel} is for</dt><dd>${NAMES[pos.turn]}</dd>` +
      `<dt>${info.units.work}</dt><dd>${fmt(result.simulations)}</dd>` +
      `<dt>Time</dt><dd>${(result.elapsedMs / 1000).toFixed(1)} s</dd>` +
      (info.sampling ? `<dt>Choice stability</dt><dd>${stability(result)}</dd>` : "") + `</dl>` +
      `<p class="hintline">Top ${cands.length} of ${result.totalCandidates} moves considered. ${info.note}</p>`;
    $("play-best").onclick = () => play(sel.move);
  } else if (running) {
    out.innerHTML = `<p class="hintline">Searching… You can keep using the board — making a move cancels the analysis.</p>`;
  } else {
    out.innerHTML = "";
  }
}

function renderHistory(review) {
  const list = $("moves");
  const { moves, cursor } = game;
  let html = "";
  for (let i = 0; i < moves.length; i += 2) {
    html += `<li><span class="n">${i / 2 + 1}.</span>`;
    for (const k of [i, i + 1]) {
      if (k >= moves.length) { html += "<span></span>"; continue; }
      const r = review[k];
      const mark = r && r.cls.mark ? `<span class="mark c-${r.cls.id}">${r.cls.mark}</span>` : "";
      const title = describeMove(moves[k]) + (r && r.cls.mark ? ` — ${r.cls.label}, loss ${pp(r.loss)}` : "");
      html += `<button type="button" data-index="${k + 1}" class="${k + 1 > cursor ? "future" : ""}"` +
        `${k + 1 === cursor ? ' aria-current="true"' : ""} title="${title}">${moveToNotation(moves[k])}${mark}</button>`;
    }
    html += "</li>";
  }
  list.innerHTML = html || `<li><span class="empty">No moves yet. Click a highlighted square or place a wall.</span></li>`;
  const current = list.querySelector('[aria-current="true"]');
  if (current) list.scrollTop = Math.max(0, current.offsetTop - list.offsetTop - list.clientHeight / 2);
  $("first").disabled = $("undo").disabled = !game.canUndo;
  $("last").disabled = $("redo").disabled = !game.canRedo;
  disarmReset();
}

function renderReview(review) {
  const gameRunning = busy && busy.kind === "game";
  const btn = $("analyze-game");
  btn.textContent = gameRunning ? `Cancel game analysis (${busy.done} of ${busy.total})` : "Analyze game";
  btn.disabled = !gameRunning && game.moves.length === 0;
  $("game-progress").hidden = !gameRunning;
  if (gameRunning) setBar("game-progress", busy.progress);

  const out = $("review");
  const n = game.positions.length;
  const shares = game.positions.map((p) => whiteShare(p, analyzer.getCached(p)));
  const known = shares.map((v, i) => [i, v]).filter(([, v]) => v !== null);
  const rated = review.filter(Boolean);
  if (n < 2 || known.length < 2 || !rated.length) { out.innerHTML = ""; return; }

  const x = (i) => (i / (n - 1)) * 100;
  const y = (v) => 40 * (1 - v);
  const line = known.map(([i, v]) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${x(known[0][0])},40 ${line} ${x(known[known.length - 1][0])},40`;
  const ticks = review.map((r, k) => (r && r.cls.mark
    ? `<line class="tick c-${r.cls.id}" x1="${x(k + 1)}" x2="${x(k + 1)}" y1="34" y2="40"/>` : "")).join("");
  const count = (player, id) => review.filter((r, k) => r && k % 2 === player && r.cls.id === id).length;
  const bad = LOSS_CLASSES.slice(1);
  const flagged = review.map((r, k) => (r && r.cls.mark ? k : -1)).filter((k) => k >= 0);
  const prev = flagged.filter((k) => k < game.cursor).pop();
  const next = flagged.find((k) => k > game.cursor);
  out.innerHTML =
    `<svg class="graph" id="graph" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Score by move: White's share">` +
    `<polygon class="area" points="${area}"/><line class="mid" x1="0" x2="100" y1="20" y2="20"/>${ticks}` +
    `<line class="cur" x1="${x(game.cursor)}" x2="${x(game.cursor)}" y1="0" y2="40"/></svg>` +
    `<table><tr><th></th>${bad.map((c) => `<th class="c-${c.id}">${c.mark} ${c.plural}</th>`).join("")}</tr>` +
    [0, 1].map((p) => `<tr><td>${NAMES[p]}</td>${bad.map((c) => `<td>${count(p, c.id)}</td>`).join("")}</tr>`).join("") +
    `</table>` +
    `<div class="jump"><button type="button" class="btn" id="prev-err" ${prev === undefined ? "disabled" : ""}>← Prev mistake</button>` +
    `<button type="button" class="btn" id="next-err" ${next === undefined ? "disabled" : ""}>Next mistake →</button></div>` +
    `<p class="hintline">Moves rated: ${rated.length} of ${review.length}. Jumping opens the position before the mistake, so the board shows what the engine suggested. ` +
    `The thresholds (3 / 8 / 15 pp) are experimental; marks are noisy at low budgets.</p>`;
  // position k is the one in which move k was played
  $("prev-err").onclick = () => navigate(prev);
  $("next-err").onclick = () => navigate(next);
  $("graph").onclick = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    navigate(Math.round(((e.clientX - box.left) / box.width) * (n - 1)));
  };
}

function disarmReset() {
  clearTimeout(resetArmed);
  resetArmed = 0;
  $("new-game").textContent = "New game";
}

// ---------- events ----------

function setMode(m) {
  const pos = game.position;
  if (pos.winner !== null) return;
  if (m !== "pawn" && pos.pawns[pos.turn].walls === 0) return showNotice("Illegal: no walls left");
  mode = m;
  render();
}

function ioMessage(text, bad = false) {
  const el = $("io-msg");
  el.textContent = text;
  el.classList.toggle("bad", bad);
}

document.querySelector(".modes").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setMode(b.dataset.mode);
});
$("analyze").addEventListener("click", () => (busy && busy.kind === "position" ? cancel() : analyzeCurrent(true)));
$("analyze-game").addEventListener("click", () => (busy && busy.kind === "game" ? cancel() : analyzeGame()));
$("auto").addEventListener("change", (e) => {
  auto = e.target.checked;
  store.set("quoridor.auto", auto ? "1" : "0");
  if (auto) analyzeCurrent(false);
  else if (busy && busy.kind === "position") cancel();
});
$("budget").addEventListener("change", (e) => {
  budgets[engines.currentId] = +e.target.value;
  if (auto) analyzeCurrent(false);
});
$("engine").addEventListener("change", (e) => {
  // each engine has its own cache: scores and marks switch together with the engine
  if (busy) stopBusy();
  engines.select(e.target.value);
  store.set("quoridor.engine", engines.currentId);
  selectedRank = 1;
  errorText = null;
  renderEngineControls();
  render();
  if (auto) analyzeCurrent(false);
});
$("topn").addEventListener("change", (e) => { topN = +e.target.value; render(); });
document.querySelector(".seg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) { showMode = b.dataset.show; render(); }
});
$("result").addEventListener("click", (e) => {
  const b = e.target.closest(".cand");
  if (b) { selectedRank = +b.dataset.rank; render(); }
});
$("first").addEventListener("click", () => navigate(0));
$("undo").addEventListener("click", () => navigate(game.cursor - 1));
$("redo").addEventListener("click", () => navigate(game.cursor + 1));
$("last").addEventListener("click", () => navigate(game.moves.length));
$("moves").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) navigate(+b.dataset.index);
});
$("io-load").addEventListener("click", () => {
  const parsed = parseGameText($("io-text").value);
  if (parsed.error) return ioMessage("Not loaded: " + parsed.error + ".", true);
  const res = game.load(parsed.moves);
  if (!res.ok) {
    return ioMessage(`Not loaded: ply ${res.index + 1} (${moveToNotation(parsed.moves[res.index])}) — ${res.reason}.`, true);
  }
  ioMessage(`Loaded ${parsed.moves.length} plies. Showing the starting position.`);
  mode = "pawn";
  positionChanged(true);
});
$("io-copy").addEventListener("click", async () => {
  if (!game.moves.length) return ioMessage("The game has no moves yet.", true);
  const text = gameToText(game.moves);
  $("io-text").value = text;
  try {
    await navigator.clipboard.writeText(text);
    ioMessage("Copied to the clipboard.");
  } catch {
    $("io-text").select();
    ioMessage("The game text is in the box above — copy it manually.");
  }
});
$("new-game").addEventListener("click", () => {
  // a game that already has moves is only reset on the second click
  if (game.moves.length && !resetArmed) {
    $("new-game").textContent = "Reset the game? Click again";
    resetArmed = setTimeout(disarmReset, 3000);
    return;
  }
  game.reset();
  mode = "pawn";
  positionChanged(true);
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest("select, textarea, input:not([type=checkbox])") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "ArrowLeft") navigate(game.cursor - 1);
  else if (e.key === "ArrowRight") navigate(game.cursor + 1);
  else if (e.key === "1") setMode("pawn");
  else if (e.key === "2") setMode("horizontal");
  else if (e.key === "3") setMode("vertical");
  else if (e.key === "Escape" && busy) cancel();
  else return;
  e.preventDefault();
});

renderEngineControls();
render();
if (auto) analyzeCurrent(false);
