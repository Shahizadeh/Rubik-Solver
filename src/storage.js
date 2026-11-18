// Small localStorage helpers. Every access is guarded: storage can be
// unavailable (private browsing, blocked site data) and the app must still work.

const CUBE_KEY = 'rubik.cube.v1';

/** Returns the saved move history (notation strings), or [] if none. */
export function loadCube() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUBE_KEY));
    if (saved && Array.isArray(saved.moves)) return saved.moves.filter((m) => typeof m === 'string');
  } catch {
    // Missing or corrupt save: start from a solved cube.
  }
  return [];
}

let lastSaved = null;

/** Saves the move history; the cube's state is fully described by it. */
export function saveCube(moves) {
  const key = moves.join(' ');
  if (key === lastSaved) return;
  lastSaved = key;
  try {
    if (moves.length === 0) localStorage.removeItem(CUBE_KEY);
    else localStorage.setItem(CUBE_KEY, JSON.stringify({ moves, savedAt: Date.now() }));
  } catch {
    // Not persisted; nothing else to do.
  }
}
