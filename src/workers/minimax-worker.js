// Module worker for the alpha-beta engine.
import { searchPosition } from "../engines/minimax/search.js";

onmessage = (event) => {
  if (event.data.type !== "analyze") return;
  try {
    let last = 0;
    const result = searchPosition(event.data.position, event.data.depth, (value) => {
      const now = Date.now();
      if (now - last < 50 && value < 1) return; // do not flood the main thread with messages
      last = now;
      postMessage({ type: "progress", value });
    });
    postMessage({ type: "analysis-result", result });
  } catch (e) {
    postMessage({ type: "error", message: String((e && e.message) || e) });
  }
};
