// Standard Quoridor notation: files a–i from left to right, ranks 1–9 from bottom to top
// (rank 1 is White's starting rank).
//   e2   — pawn to square e2
//   e3h  — horizontal wall whose crossing has e3 as its lower-left square
//   e3v  — vertical wall at the same crossing

const FILES = "abcdefghi";

export const squareName = (row, col) => FILES[col] + (9 - row);

export function moveToNotation(move) {
  if (move.type === "pawn") return squareName(move.to.row, move.to.col);
  return FILES[move.col] + (8 - move.row) + (move.orientation === "horizontal" ? "h" : "v");
}

export function describeMove(move) {
  if (move.type === "pawn") return `pawn to ${squareName(move.to.row, move.to.col)}`;
  const kind = move.orientation === "horizontal" ? "horizontal" : "vertical";
  return `${kind} wall ${moveToNotation(move)}`;
}

// "e2" | "e3h" | "e3v" -> Move, or null.
export function parseMove(token) {
  const m = /^([a-i])([1-9])([hv]?)$/i.exec(token);
  if (!m) return null;
  const col = FILES.indexOf(m[1].toLowerCase());
  const rank = +m[2];
  if (!m[3]) return { type: "pawn", to: { row: 9 - rank, col } };
  if (col > 7 || rank > 8) return null;
  return { type: "wall", orientation: m[3].toLowerCase() === "h" ? "horizontal" : "vertical", row: 8 - rank, col };
}

// Game text ("1. e2 e8 2. d8h ...") -> { moves } | { error }.
export function parseGameText(text) {
  const moves = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/^\d+\.+/, "");
    if (!token) continue;
    const move = parseMove(token);
    if (!move) return { error: `could not parse "${raw}"` };
    moves.push(move);
  }
  return moves.length ? { moves } : { error: "the text contains no moves" };
}

export function gameToText(moves) {
  let out = "";
  moves.forEach((m, i) => { out += (i % 2 ? " " : `${i ? " " : ""}${i / 2 + 1}. `) + moveToNotation(m); });
  return out;
}
