// Shared base for engines that compute in a Web Worker: start-up, progress, cancellation.
// Worker protocol: receives { type: "analyze", position, ...params },
// replies with { type: "progress", value } and { type: "analysis-result", result } | { type: "error", message }.

import { Engine, EngineCancelled } from "./engine.js";
import { positionHash } from "../core/position.js";

export class WorkerEngine extends Engine {
  constructor() {
    super();
    this.worker = null;
    this.rejectCurrent = null;
  }

  // Overridden by concrete engines:
  createWorker() { throw new Error("not implemented"); }
  workerParams(budget) { return { budget }; }

  analyze(position, { budget = this.getInfo().defaultBudget, onProgress } = {}) {
    this.stop();
    const hash = positionHash(position);
    return new Promise((resolve, reject) => {
      const worker = this.createWorker();
      this.worker = worker;
      this.rejectCurrent = reject;
      const finish = (fn, value) => {
        if (this.worker === worker) {
          this.worker = null;
          this.rejectCurrent = null;
        }
        worker.terminate();
        fn(value);
      };
      worker.onmessage = ({ data }) => {
        if (data.type === "progress") {
          if (onProgress) onProgress(data.value);
        } else if (data.type === "analysis-result") {
          finish(resolve, { ...data.result, engine: this.getInfo().id, budget, positionHash: hash, sideToMove: position.turn });
        } else if (data.type === "error") {
          finish(reject, new Error(data.message));
        }
      };
      worker.onerror = (e) => finish(reject, new Error(e.message || "could not start the analysis worker"));
      worker.postMessage({ type: "analyze", position, ...this.workerParams(budget) });
    });
  }

  // Cancellation: the search is synchronous, so the worker is simply terminated.
  stop() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    const reject = this.rejectCurrent;
    this.rejectCurrent = null;
    if (reject) reject(new EngineCancelled());
  }
}
