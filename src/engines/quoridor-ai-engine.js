// Adapter for the gorisanson/quoridor-ai MCTS engine. The budget is the number of simulations.

import { WorkerEngine } from "./worker-engine.js";

const WORKER_URL = new URL("../workers/analysis-worker.js", import.meta.url);

export class QuoridorAiMctsEngine extends WorkerEngine {
  getInfo() {
    return {
      id: "quoridor-ai-mcts",
      name: "quoridor-ai · MCTS",
      scoreLabel: "MCTS score",
      sampling: true, // scores are statistical, so reliability hints are worth showing
      units: { work: "Simulations", visits: "visits" },
      budgetLabel: "Budget",
      budgets: [
        { value: 2500, label: "2,500 simulations" },
        { value: 7500, label: "7,500 simulations" },
        { value: 20000, label: "20,000 simulations" },
        { value: 60000, label: "60,000 simulations" },
      ],
      defaultBudget: 20000,
      note: "Candidates are sorted by visit count. The engine does not put every legal wall into its tree; "
        + "the score is the share of simulations won, not an exact winning probability.",
    };
  }

  createWorker() { return new Worker(WORKER_URL); }
  workerParams(budget) { return { simulations: budget, uctConst: 0.2 }; }
}
