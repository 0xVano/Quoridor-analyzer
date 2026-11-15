// Rules — the single place that decides whether a move is legal.
// Pure functions over Position; no DOM and no engine code here.

import { SIZE, GOAL_ROW, clonePosition } from "./position.js";

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Grids of placed walls: h[r][c], v[r][c] (8×8, true = a wall is there).
function wallGrids(walls) {
  const h = Array.from({ length: 8 }, () => new Array(8).fill(false));
  const v = Array.from({ length: 8 }, () => new Array(8).fill(false));
  for (const w of walls.horizontal) h[w.row][w.col] = true;
  for (const w of walls.vertical) v[w.row][w.col] = true;
  return { h, v };
}

const at = (g, r, c) => r >= 0 && r < 8 && c >= 0 && c < 8 && g[r][c];

// Can a pawn step from (r,c) by (dr,dc), given the board edge and walls (pawns are ignored)?
function open(g, r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return false;
  if (dr !== 0) {
    const wr = dr === 1 ? r : r - 1; // a wall between rows wr and wr+1
    return !(at(g.h, wr, c) || at(g.h, wr, c - 1));
  }
  const wc = dc === 1 ? c : c - 1;   // a wall between columns wc and wc+1
  return !(at(g.v, r, wc) || at(g.v, r - 1, wc));
}

// Length of the shortest path to the goal row (ignoring the opponent's pawn); -1 if there is none.
function distanceToGoal(g, row, col, goalRow) {
  if (row === goalRow) return 0;
  const seen = new Uint8Array(SIZE * SIZE);
  let frontier = [[row, col]];
  seen[row * SIZE + col] = 1;
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const [r, c] of frontier) {
      for (const [dr, dc] of DIRS) {
        if (!open(g, r, c, dr, dc)) continue;
        const nr = r + dr, nc = c + dc;
        if (seen[nr * SIZE + nc]) continue;
        if (nr === goalRow) return d;
        seen[nr * SIZE + nc] = 1;
        next.push([nr, nc]);
      }
    }
    frontier = next;
  }
  return -1;
}

function pawnTargets(pos, g) {
  const me = pos.pawns[pos.turn];
  const opp = pos.pawns[1 - pos.turn];
  const out = [];
  for (const [dr, dc] of DIRS) {
    if (!open(g, me.row, me.col, dr, dc)) continue;
    const r = me.row + dr, c = me.col + dc;
    if (r !== opp.row || c !== opp.col) {
      out.push({ row: r, col: c });
    } else if (open(g, r, c, dr, dc)) {
      out.push({ row: r + dr, col: c + dc });            // straight jump
    } else {
      // a wall or the edge is behind the opponent — diagonal jumps
      for (const [sr, sc] of dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
        if (open(g, r, c, sr, sc)) out.push({ row: r + sr, col: c + sc });
      }
    }
  }
  return out;
}

// The reason a wall cannot be placed, or null.
function wallProblem(pos, g, orientation, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 7 || col < 0 || col > 7) {
    return "wall is off the board";
  }
  if (pos.pawns[pos.turn].walls <= 0) return "no walls left";
  const horizontal = orientation === "horizontal";
  if (horizontal) {
    if (g.h[row][col] || at(g.h, row, col - 1) || at(g.h, row, col + 1)) return "wall overlaps another wall";
    if (g.v[row][col]) return "wall crosses another wall";
  } else {
    if (g.v[row][col] || at(g.v, row - 1, col) || at(g.v, row + 1, col)) return "wall overlaps another wall";
    if (g.h[row][col]) return "wall crosses another wall";
  }
  const grid = horizontal ? g.h : g.v;
  grid[row][col] = true;
  const blocked = pos.pawns.some((p, i) => distanceToGoal(g, p.row, p.col, GOAL_ROW[i]) < 0);
  grid[row][col] = false;
  return blocked ? "wall would block every path to the goal" : null;
}

export const Rules = {
  legalPawnMoves(pos) {
    if (pos.winner !== null) return [];
    return pawnTargets(pos, wallGrids(pos.walls));
  },

  // All legal walls for the side to move.
  legalWalls(pos) {
    const res = { horizontal: [], vertical: [] };
    if (pos.winner !== null || pos.pawns[pos.turn].walls <= 0) return res;
    const g = wallGrids(pos.walls);
    for (const o of ["horizontal", "vertical"]) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (!wallProblem(pos, g, o, r, c)) res[o].push({ row: r, col: c });
        }
      }
    }
    return res;
  },

  // null if the move is legal; otherwise a human-readable reason.
  whyIllegal(pos, move) {
    if (pos.winner !== null) return "the game is over";
    if (!move) return "unknown move";
    const g = wallGrids(pos.walls);
    if (move.type === "pawn") {
      const ok = pawnTargets(pos, g).some((t) => t.row === move.to.row && t.col === move.to.col);
      return ok ? null : "the pawn cannot move to that square";
    }
    if (move.type === "wall" && (move.orientation === "horizontal" || move.orientation === "vertical")) {
      return wallProblem(pos, g, move.orientation, move.row, move.col);
    }
    return "unknown move";
  },

  isLegalMove(pos, move) {
    return Rules.whyIllegal(pos, move) === null;
  },

  // Returns a new position. Does NOT check legality — Game.applyMove does that.
  applyMove(pos, move) {
    const next = clonePosition(pos);
    const me = next.pawns[pos.turn];
    if (move.type === "pawn") {
      me.row = move.to.row;
      me.col = move.to.col;
      if (me.row === GOAL_ROW[pos.turn]) next.winner = pos.turn;
    } else {
      next.walls[move.orientation].push({ row: move.row, col: move.col });
      me.walls--;
    }
    next.turn = 1 - pos.turn;
    next.ply = pos.ply + 1;
    return next;
  },

  // Length of a player's shortest path to their goal row.
  shortestPathLength(pos, player) {
    const p = pos.pawns[player];
    return distanceToGoal(wallGrids(pos.walls), p.row, p.col, GOAL_ROW[player]);
  },
};
