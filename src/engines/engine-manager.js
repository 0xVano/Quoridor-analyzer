// EngineManager — the engine registry. The GUI selects an engine by id and always receives
// the same AnalysisResult format.

export class EngineManager {
  constructor() {
    this.engines = new Map();
    this.currentId = null;
  }

  register(engine) {
    const { id } = engine.getInfo();
    this.engines.set(id, engine);
    if (this.currentId === null) this.currentId = id;
    return this;
  }

  list() { return [...this.engines.values()].map((e) => e.getInfo()); }
  get current() { return this.engines.get(this.currentId); }
  get info() { return this.current.getInfo(); }

  // Switching stops the analysis in progress. Returns false if no engine has this id.
  select(id) {
    if (!this.engines.has(id)) return false;
    if (id !== this.currentId) {
      this.current.stop();
      this.currentId = id;
    }
    return true;
  }
}
