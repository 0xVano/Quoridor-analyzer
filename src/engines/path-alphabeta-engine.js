// Second engine: alpha-beta search with a shortest-path heuristic. The budget is the search depth.

import { WorkerEngine } from "./worker-engine.js";

const WORKER_URL = new URL("../workers/minimax-worker.js", import.meta.url);

export class PathAlphaBetaEngine extends WorkerEngine {
  getInfo() {
    return {
      id: "path-alphabeta",
      name: "Alpha-beta search",
      scoreLabel: "Heuristic score",
      sampling: false,
      units: { work: "Nodes", visits: "nodes" },
      budgetLabel: "Depth",
      budgets: [
        { value: 1, label: "1 ply" },
        { value: 2, label: "2 plies" },
        { value: 3, label: "3 plies (slow)" },
      ],
      defaultBudget: 2,
      note: "Searches every legal move and wall to the chosen depth. The score is a heuristic based on the "
        + "shortest-path difference and walls in hand, mapped to 0–100%; it is not comparable to MCTS percentages.",
    };
  }

  createWorker() { return new Worker(WORKER_URL, { type: "module" }); }
  workerParams(budget) { return { depth: budget }; }
}
