import { parseSequence } from '../cube/notation.js';
import { SOLVED, validateFacelets } from './facelets.js';

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data);
      else p.reject(new Error(data.error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'Solver failed to load'));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function call(message) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id });
  });
}

/** Starts building the solver tables in the background (takes a few seconds once). */
export function warmUpSolver() {
  call({ type: 'init' }).catch(() => {});
}

/**
 * Solves a facelet string. Resolves to a list of moves ({ axis, layer, turns })
 * that take that state to solved; rejects with a user-facing message if the
 * cube is impossible.
 */
export async function solveFacelets(facelets) {
  const check = validateFacelets(facelets);
  if (!check.ok) throw new Error(check.error);
  if (facelets === SOLVED) return [];
  const { solution } = await call({ type: 'solve', facelets });
  return parseSequence(solution);
}
