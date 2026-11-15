// BoardView — renders a position as SVG and turns clicks into Moves.
// Legality comes only from Rules; nothing is re-derived here.

import { Rules } from "../core/rules.js";
import { GOAL_ROW } from "../core/position.js";
import { pawnMove, wallMove } from "../core/move.js";

const CELL = 10, GAP = 3, PITCH = CELL + GAP, WALL = 2, LEN = CELL * 2 + GAP;
const FILES = "abcdefghi";
const cx = (c) => c * PITCH + CELL / 2;

function wallRect(orientation, row, col) {
  return orientation === "horizontal"
    ? { x: col * PITCH, y: row * PITCH + CELL + (GAP - WALL) / 2, width: LEN, height: WALL }
    : { x: col * PITCH + CELL + (GAP - WALL) / 2, y: row * PITCH, width: WALL, height: LEN };
}
const rectAttrs = (r) => `x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx=".7"`;
const wallSvg = (o, w, cls) => `<rect class="${cls} deco" ${rectAttrs(wallRect(o, w.row, w.col))}/>`;

export class BoardView {
  constructor(svg, { onMove, onIllegal }) {
    this.svg = svg;
    this.onMove = onMove;
    this.onIllegal = onIllegal;
    this.state = null;
    this.legalWalls = { horizontal: new Set(), vertical: new Set() };
    svg.addEventListener("click", (e) => this.handleClick(e));
    svg.addEventListener("pointerover", (e) => this.handleHover(e));
    svg.addEventListener("pointerleave", () => this.showGhost(null));
  }

  // state: { position, lastMove, mode: "pawn"|"horizontal"|"vertical", hints: [{ move, rank }] }
  render(state) {
    this.state = state;
    const { position: pos, lastMove, mode, hints } = state;
    const live = pos.winner === null;
    const legalPawn = Rules.legalPawnMoves(pos);
    const lw = Rules.legalWalls(pos);
    for (const o of ["horizontal", "vertical"]) this.legalWalls[o] = new Set(lw[o].map((w) => w.row * 8 + w.col));

    let s = "";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const goal = live && r === GOAL_ROW[pos.turn] ? " goal" : "";
        const last = lastMove && lastMove.type === "pawn" && lastMove.to.row === r && lastMove.to.col === c ? " last" : "";
        s += `<rect class="cell deco${goal}${last}" x="${c * PITCH}" y="${r * PITCH}" width="${CELL}" height="${CELL}" rx="1.3"/>`;
      }
      s += `<text class="label deco" x="-5" y="${cx(r)}">${9 - r}</text>`;
      s += `<text class="label deco" x="${cx(r)}" y="120.5">${FILES[r]}</text>`;
    }
    for (const o of ["horizontal", "vertical"]) {
      for (const w of pos.walls[o]) {
        const last = lastMove && lastMove.type === "wall" && lastMove.orientation === o && lastMove.row === w.row && lastMove.col === w.col;
        s += wallSvg(o, w, last ? "wall last" : "wall");
      }
    }
    if (live && mode === "pawn") {
      for (const t of legalPawn) {
        // no dot on a square that carries an engine hint — the rank number goes there
        const hinted = hints.some((h) => h.move.type === "pawn" && h.move.to.row === t.row && h.move.to.col === t.col);
        if (!hinted) s += `<circle class="legal deco" cx="${cx(t.col)}" cy="${cx(t.row)}" r="1.5"/>`;
      }
    }
    pos.pawns.forEach((p, i) => {
      const active = live && i === pos.turn ? " active" : "";
      s += `<circle class="pawn pawn-${i} deco${active}" cx="${cx(p.col)}" cy="${cx(p.row)}" r="3.7"/>`;
    });
    // higher ranks are drawn last so they end up on top when hints overlap
    for (const h of [...hints].sort((a, b) => b.rank - a.rank)) s += this.hintSvg(h);
    s += `<rect class="ghost deco" rx=".7" visibility="hidden"/>`;

    // click layer
    if (live && mode === "pawn") {
      for (const t of legalPawn) {
        s += `<rect class="hit ok" data-k="p" data-r="${t.row}" data-c="${t.col}" x="${t.col * PITCH}" y="${t.row * PITCH}" width="${CELL}" height="${CELL}"/>`;
      }
      // gaps between squares: a quick way to place a wall with the mouse without switching modes
      if (pos.pawns[pos.turn].walls > 0) {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (r < 8) s += this.hitSvg("horizontal", r, Math.min(c, 7), c * PITCH, r * PITCH + CELL, CELL, GAP);
            if (c < 8) s += this.hitSvg("vertical", Math.min(r, 7), c, c * PITCH + CELL, r * PITCH, GAP, CELL);
          }
        }
      }
    } else if (live) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const x = c * PITCH + CELL + GAP / 2, y = r * PITCH + CELL + GAP / 2;
          if (this.legalWalls[mode].has(r * 8 + c)) s += `<circle class="hit dot" cx="${x}" cy="${y}" r=".9"/>`;
          s += this.hitSvg(mode, r, c, x - PITCH / 2, y - PITCH / 2, PITCH, PITCH);
        }
      }
    }
    this.svg.innerHTML = s;
    this.ghost = this.svg.querySelector(".ghost");
  }

  hitSvg(o, r, c, x, y, w, h) {
    const ok = this.legalWalls[o].has(r * 8 + c) ? " ok" : "";
    return `<rect class="hit${ok}" data-k="${o[0]}" data-r="${r}" data-c="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  }

  hintSvg({ move, rank }) {
    const cls = `hint r${rank} deco`;
    if (move.type === "pawn") {
      const x = move.to.col * PITCH, y = move.to.row * PITCH;
      return `<rect class="${cls} ring" x="${x + .5}" y="${y + .5}" width="${CELL - 1}" height="${CELL - 1}" rx="1.3"/>`
        + `<text class="${cls} num" x="${x + CELL / 2}" y="${y + CELL / 2}">${rank}</text>`;
    }
    const r = wallRect(move.orientation, move.row, move.col);
    // the number sits over the wall's first square so that crossed candidates do not share a spot
    const horizontal = move.orientation === "horizontal";
    const mx = horizontal ? r.x + CELL / 2 : r.x + r.width / 2;
    const my = horizontal ? r.y + r.height / 2 : r.y + CELL / 2;
    return `<rect class="${cls} hwall" ${rectAttrs(r)}/>`
      + `<circle class="${cls} badge" cx="${mx}" cy="${my}" r="2.3"/>`
      + `<text class="deco badge-num" x="${mx}" y="${my}">${rank}</text>`;
  }

  moveFromTarget(el) {
    if (!el || !el.dataset || !el.dataset.k) return null;
    const r = +el.dataset.r, c = +el.dataset.c;
    if (el.dataset.k === "p") return pawnMove(r, c);
    return wallMove(el.dataset.k === "h" ? "horizontal" : "vertical", r, c);
  }

  showGhost(move) {
    if (!this.ghost) return;
    if (!move) return this.ghost.setAttribute("visibility", "hidden");
    const r = wallRect(move.orientation, move.row, move.col);
    for (const k in r) this.ghost.setAttribute(k, r[k]);
    this.ghost.setAttribute("visibility", "visible");
  }

  handleHover(e) {
    const move = this.moveFromTarget(e.target);
    const ok = move && move.type === "wall" && this.legalWalls[move.orientation].has(move.row * 8 + move.col);
    this.showGhost(ok ? move : null);
  }

  handleClick(e) {
    const move = this.moveFromTarget(e.target);
    if (!move) return;
    const reason = Rules.whyIllegal(this.state.position, move);
    if (reason) this.onIllegal(reason);
    else this.onMove(move);
  }
}
