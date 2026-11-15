// Analyzer — position analysis on top of the selected engine, plus a result cache.
// The cache means a position is not recomputed when you return to it, lets the game review be
// assembled from per-position results, and lets auto-analysis reuse earlier work.
// Results from different engines are kept apart.

import { positionHash } from "../core/position.js";

const TERMINAL = Object.freeze({ terminal: true, budget: Infinity, simulations: 0, elapsedMs: 0, totalCandidates: 0, rootValue: 0, candidates: [] });

export class Analyzer {
  constructor(engines) {
    this.engines = engines; // EngineManager
    this.cache = new Map();
  }

  // the ply number is part of the key: quoridor-ai's heuristics depend on it
  key(position) {
    return this.engines.currentId + "|" + positionHash(position) + "#" + position.ply;
  }

  getCached(position) {
    if (position.winner !== null) return TERMINAL;
    return this.cache.get(this.key(position)) || null;
  }

  // Returns an AnalysisResult. Without `force`, a cached result is used if its budget is at least the requested one.
  async analyzePosition(position, { budget, force = false, onProgress } = {}) {
    if (position.winner !== null) return TERMINAL;
    const key = this.key(position);
    const cached = this.cache.get(key);
    if (!force && cached && cached.budget >= budget) return cached;
    const result = await this.engines.current.analyze(position, { budget, onProgress });
    const current = this.cache.get(key);
    if (force || !current || result.budget >= current.budget) this.cache.set(key, result);
    return this.cache.get(key);
  }

  stop() {
    this.engines.current.stop();
  }
}
