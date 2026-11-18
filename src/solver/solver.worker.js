// Runs the Kociemba two-phase solver (cubejs) off the main thread. Building
// its lookup tables takes a few seconds, so it happens once per worker and
// can be started early with an 'init' message.
//
// cubejs is old CoffeeScript output that registers itself on the top-level
// `this` when it isn't loaded as a CommonJS module. Bundlers wrap it as an ES
// module, where top-level `this` is undefined, which breaks it. So its two
// files are loaded as text and run as plain scripts with `this` bound to the
// worker's global scope (which is how the library is meant to run in a
// browser); afterwards the solver is available as `self.Cube`.
import cubeSource from 'cubejs/lib/cube.js?raw';
import solveSource from 'cubejs/lib/solve.js?raw';

for (const source of [cubeSource, solveSource]) {
  new Function('module', 'require', source).call(self, undefined, undefined);
}
const Cube = self.Cube;

let ready = false;

self.onmessage = ({ data }) => {
  const { id, type, facelets } = data;
  try {
    if (!ready) {
      Cube.initSolver();
      ready = true;
    }
    if (type === 'init') {
      self.postMessage({ id, ok: true });
      return;
    }
    const solution = Cube.fromString(facelets).solve().trim();
    self.postMessage({ id, ok: true, solution });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
