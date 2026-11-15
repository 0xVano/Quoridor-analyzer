"use strict";
// Analysis worker: Position -> raw quoridor-ai MCTS -> top root candidates.
// The playing bot's AI.chooseNextMove() is deliberately not used, so no opening-book or
// other move overrides are applied: the result is exactly what the search found.

importScripts("../../vendor/quoridor-ai/game.js", "../../vendor/quoridor-ai/ai.js");

const PROGRESS_STEPS = 50;

// Position -> the engine's Game. The engine's pawns[0] is the "human side": starts on row 8, goal row 0.
function toEngineGame(position) {
  const game = new Game(true);
  for (const w of position.walls.horizontal) game.placeHorizontalWall(w.row, w.col);
  for (const w of position.walls.vertical) game.placeVerticalWall(w.row, w.col);
  position.pawns.forEach((p, i) => {
    const pawn = game.board.pawns[i];
    pawn.position.row = p.row;
    pawn.position.col = p.col;
    pawn.numberOfLeftWalls = p.walls;
  });
  game.turn = position.ply; // the setter invalidates the engine's caches
  return game;
}

// Engine move [[r,c],null,null] | [null,[r,c],null] | [null,null,[r,c]] -> Move
function fromEngineMove(m) {
  if (m[0]) return { type: "pawn", to: { row: m[0][0], col: m[0][1] } };
  if (m[1]) return { type: "wall", orientation: "horizontal", row: m[1][0], col: m[1][1] };
  return { type: "wall", orientation: "vertical", row: m[2][0], col: m[2][1] };
}

const MAX_CANDIDATES = 5;

// analyzePosition: raw MCTS. Candidates are the root's children sorted by visit count (the same
// criterion the engine uses to pick its move); winRate is the share of simulations won by the side to move.
function analyzePosition({ position, simulations, uctConst }) {
  const started = Date.now();
  if (position.winner !== null) {
    return { simulations: 0, elapsedMs: 0, candidates: [], totalCandidates: 0 };
  }
  const mcts = new MonteCarloTreeSearch(toEngineGame(position), uctConst);
  const batch = Math.ceil(simulations / PROGRESS_STEPS);
  postMessage({ type: "progress", value: 0 });
  while (mcts.totalNumOfSimulations < simulations) {
    mcts.search(Math.min(batch, simulations - mcts.totalNumOfSimulations));
    postMessage({ type: "progress", value: mcts.totalNumOfSimulations / simulations });
  }
  const visited = mcts.root.children.filter((n) => n.numSims > 0).sort((x, y) => y.numSims - x.numSims);
  return {
    simulations: mcts.totalNumOfSimulations,
    elapsedMs: Date.now() - started,
    totalCandidates: mcts.root.children.length,
    // share of all root simulations won by the side to move: the position's value averaged over the tree
    rootValue: visited.reduce((a, n) => a + n.numWins, 0) / Math.max(1, visited.reduce((a, n) => a + n.numSims, 0)),
    candidates: visited.slice(0, MAX_CANDIDATES).map((n, i) => ({
      rank: i + 1,
      move: fromEngineMove(n.move),
      visits: n.numSims,
      wins: n.numWins,
      winRate: n.numWins / n.numSims,
    })),
  };
}

onmessage = (event) => {
  if (event.data.type !== "analyze") return;
  try {
    postMessage({ type: "analysis-result", result: analyzePosition(event.data) });
  } catch (e) {
    postMessage({ type: "error", message: String((e && e.message) || e) });
  }
};
