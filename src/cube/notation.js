// Move model shared by the engine and the UI.
//
// A move is { axis: 'x'|'y'|'z', layer: -1|0|1, turns: 1|-1|2 } where `turns`
// follows standard notation: 1 = clockwise when looking at that face,
// -1 = counter-clockwise (prime), 2 = half turn.

export const AXES = ['x', 'y', 'z'];

// Face letter for each axis/layer pair, plus the sign that converts
// notation turns into a right-handed rotation about the positive axis.
const FACES = {
  x: { 1: ['R', -1], 0: ['M', 1], [-1]: ['L', 1] },
  y: { 1: ['U', -1], 0: ['E', 1], [-1]: ['D', 1] },
  z: { 1: ['F', -1], 0: ['S', -1], [-1]: ['B', 1] },
};

const BY_LETTER = {};
for (const axis of AXES) {
  for (const layer of [-1, 0, 1]) {
    BY_LETTER[FACES[axis][layer][0]] = { axis, layer };
  }
}

export function baseSign(axis, layer) {
  return FACES[axis][layer][1];
}

/** Rotation angle (radians, about the +axis) a move applies to its layer. */
export function moveAngle(move) {
  return move.turns * baseSign(move.axis, move.layer) * (Math.PI / 2);
}

export function invert(move) {
  return { ...move, turns: move.turns === 2 ? 2 : -move.turns };
}

export function sameLayer(a, b) {
  return a.axis === b.axis && a.layer === b.layer;
}

/** Combines quarter-turn counts; returns 0 when they cancel out. */
export function combineTurns(a, b) {
  const t = (((a + b) % 4) + 4) % 4;
  return t === 3 ? -1 : t;
}

export function toNotation(move) {
  const letter = FACES[move.axis][move.layer][0];
  if (move.turns === 2) return `${letter}2`;
  return move.turns === -1 ? `${letter}'` : letter;
}

/** Parses a single token such as "R", "U'", "F2". */
export function parseMove(token) {
  const m = /^([RLUDFBMES])(2|')?$/.exec(token.trim());
  if (!m) throw new Error(`Unknown move: ${token}`);
  const { axis, layer } = BY_LETTER[m[1]];
  const turns = m[2] === '2' ? 2 : m[2] === "'" ? -1 : 1;
  return { axis, layer, turns };
}

export function parseSequence(text) {
  return text.split(/\s+/).filter(Boolean).map(parseMove);
}

const OUTER_FACES = ['R', 'L', 'U', 'D', 'F', 'B'];

/** Random scramble that never turns the same face twice in a row. */
export function randomScramble(length = 25) {
  const moves = [];
  let prev = null;
  while (moves.length < length) {
    const face = OUTER_FACES[Math.floor(Math.random() * OUTER_FACES.length)];
    if (face === prev) continue;
    prev = face;
    const suffix = ['', "'", '2'][Math.floor(Math.random() * 3)];
    moves.push(parseMove(face + suffix));
  }
  return moves;
}
