// Turns engine results into position and move evaluations.
// All values are engine scores in 0..1 (for MCTS: share of simulations won), not exact winning probabilities.

import { sameMove } from "../core/move.js";

// Value of the position for the side to move. null if the position has not been analyzed.
export function positionValue(position, result) {
  if (position.winner !== null) return position.winner === position.turn ? 1 : 0;
  if (!result || !result.candidates.length) return null;
  return result.candidates[0].winRate;
}

// The same from White's (player 0) point of view — used by the graph.
export function whiteShare(position, result) {
  const v = positionValue(position, result);
  if (v === null) return null;
  return position.turn === 0 ? v : 1 - v;
}

// Score lost by the move actually played (0..1), or null if analysis is missing.
//   before the move: winRate of the best candidate in `before` — the statistics of the node "after the best move";
//   after the move:  `after` is searched on its own (the played move is fixed as the first action),
//                    its root statistics (rootValue) are taken and flipped to the mover's point of view.
// Both numbers are node-level averages, so they are comparable, and the played move is judged with a
// full budget even if the search from `before` barely visited it.
export function moveLoss(beforeResult, playedMove, afterPosition, afterResult) {
  if (!beforeResult || !beforeResult.candidates.length) return null;
  const best = beforeResult.candidates[0];
  if (sameMove(best.move, playedMove)) return 0;
  let after;
  if (afterPosition.winner !== null) after = afterPosition.winner === afterPosition.turn ? 1 : 0;
  else if (afterResult && afterResult.candidates.length) after = afterResult.rootValue;
  else return null;
  return Math.max(0, best.winRate - (1 - after));
}

// Experimental thresholds, in percentage points.
export const LOSS_CLASSES = [
  { id: "ok", limit: 3, mark: "", label: "good move", plural: "good moves" },
  { id: "inaccuracy", limit: 8, mark: "?!", label: "inaccuracy", plural: "inaccuracies" },
  { id: "mistake", limit: 15, mark: "?", label: "mistake", plural: "mistakes" },
  { id: "blunder", limit: Infinity, mark: "??", label: "blunder", plural: "blunders" },
];

export function classifyLoss(loss) {
  // 1e-9: so that 0.6 - 0.45 = 0.1499999… still counts as 15 pp
  return LOSS_CLASSES.find((c) => loss * 100 + 1e-9 < c.limit);
}

// How confidently MCTS picked its first move.
export function stability(result) {
  const [a, b] = result.candidates;
  if (!a) return null;
  if (!b) return "high";
  const share = a.visits / result.simulations;
  const gap = Math.abs(a.winRate - b.winRate) * 100;
  if (share >= 0.6) return "high";
  if (share < 0.35 || gap < 2) return "low";
  return "medium";
}
