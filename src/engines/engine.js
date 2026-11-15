// Common analysis-engine interface: Position -> Engine -> AnalysisResult.
// The GUI only ever talks to this interface.
//
// AnalysisResult:
// {
//   engine: string,
//   positionHash: string,
//   sideToMove: 0 | 1,
//   budget: number,            // the budget this result was computed with
//   simulations: number,       // amount of work done: MCTS simulations or search nodes
//   elapsedMs: number,
//   totalCandidates: number,   // how many root moves the engine considered at all
//   rootValue: number,         // value of the position for the side to move, 0..1
//   candidates: [{ rank, move: Move, visits, wins, winRate }]  // up to 5, best first
// }

export class EngineCancelled extends Error {
  constructor() {
    super("analysis cancelled");
    this.name = "EngineCancelled";
  }
}

export class Engine {
  getInfo() { throw new Error("not implemented"); }

  // getInfo(): { id, name, scoreLabel, sampling, units: { work, visits }, budgetLabel, budgets: [{ value, label }], defaultBudget, note }
  // options: { budget, onProgress(value 0..1) } — each engine defines what its budget means
  // Returns Promise<AnalysisResult>; rejects with EngineCancelled when stop() is called.
  analyze(position, options) { throw new Error("not implemented"); }

  stop() {}
}
