// Explicit move types. The GUI and the history only work with these.

export const pawnMove = (row, col) => ({ type: "pawn", to: { row, col } });

export const wallMove = (orientation, row, col) => ({ type: "wall", orientation, row, col });

export function sameMove(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "pawn") return a.to.row === b.to.row && a.to.col === b.to.col;
  return a.orientation === b.orientation && a.row === b.row && a.col === b.col;
}
