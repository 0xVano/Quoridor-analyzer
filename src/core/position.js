// Position — an engine-independent description of a Quoridor position.
//
//  Squares: row 0..8 (0 is the top of the board), col 0..8 (0 is the left).
//  Player 0 (White) starts on row 8 and heads for row 0; moves first.
//  Player 1 (Black) starts on row 0 and heads for row 8.
//
//  Walls: anchor (row, col), row/col 0..7 — the crossing between the squares
//  (row,col) (row,col+1) (row+1,col) (row+1,col+1).
//   horizontal (r,c): blocks movement between rows r and r+1 in columns c and c+1
//   vertical   (r,c): blocks movement between columns c and c+1 in rows r and r+1

export const SIZE = 9;
export const WALLS_PER_PLAYER = 10;
export const GOAL_ROW = [0, 8];

export function initialPosition() {
  return {
    pawns: [
      { row: 8, col: 4, walls: WALLS_PER_PLAYER },
      { row: 0, col: 4, walls: WALLS_PER_PLAYER },
    ],
    walls: { horizontal: [], vertical: [] },
    turn: 0,      // side to move: 0 or 1
    ply: 0,       // number of plies (half-moves) played
    winner: null, // null | 0 | 1
  };
}

export function clonePosition(p) {
  return {
    pawns: p.pawns.map((x) => ({ ...x })),
    walls: {
      horizontal: p.walls.horizontal.map((w) => ({ ...w })),
      vertical: p.walls.vertical.map((w) => ({ ...w })),
    },
    turn: p.turn,
    ply: p.ply,
    winner: p.winner,
  };
}

// String key of a position — used to match engine replies to the position they belong to.
export function positionHash(p) {
  const ws = (a) => a.map((w) => w.row * 8 + w.col).sort((x, y) => x - y).join(".");
  return [
    p.turn,
    p.pawns.map((x) => `${x.row}${x.col}w${x.walls}`).join("-"),
    "h" + ws(p.walls.horizontal),
    "v" + ws(p.walls.vertical),
  ].join("|");
}
