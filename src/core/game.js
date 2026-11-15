// Game — a game as a history of positions. Every change goes through applyMove().

import { initialPosition } from "./position.js";
import { Rules } from "./rules.js";

export class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.positions = [initialPosition()]; // positions[i] is the position after i plies
    this.moves = [];                      // moves[i] takes positions[i] to positions[i+1]
    this.cursor = 0;                      // index of the current position
  }

  get position() { return this.positions[this.cursor]; }
  get lastMove() { return this.cursor > 0 ? this.moves[this.cursor - 1] : null; }
  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor < this.moves.length; }

  applyMove(move) {
    const reason = Rules.whyIllegal(this.position, move);
    if (reason) return { ok: false, reason };
    const next = Rules.applyMove(this.position, move);
    // a new move made from the middle of the history discards the "future" branch
    this.positions.length = this.cursor + 1;
    this.moves.length = this.cursor;
    this.positions.push(next);
    this.moves.push(move);
    this.cursor++;
    return { ok: true, position: next };
  }

  goTo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.positions.length || index === this.cursor) return false;
    this.cursor = index;
    return true;
  }

  // Replaces the game with a list of moves. Changes nothing if any move is illegal.
  load(moves) {
    const fresh = new Game();
    for (let i = 0; i < moves.length; i++) {
      const res = fresh.applyMove(moves[i]);
      if (!res.ok) return { ok: false, index: i, reason: res.reason };
    }
    this.positions = fresh.positions;
    this.moves = fresh.moves;
    this.cursor = 0;
    return { ok: true };
  }

  undo() { return this.goTo(this.cursor - 1); }
  redo() { return this.goTo(this.cursor + 1); }
}
