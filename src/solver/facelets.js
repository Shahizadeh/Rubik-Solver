// Facelet model shared by the import editor, the 3D engine and the solver.
//
// A cube state is a 54-character string in Kociemba's URFDLB order: nine
// stickers per face, faces in the order U R F D L B, each face read row by
// row as it appears in the standard unfolded net:
//
//         U
//      L  F  R  B
//         D
//
// Each sticker holds the letter of the face whose centre has that colour, so
// a solved cube is "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB".
// With the cube held white-up / green-front: U white, R red, F green,
// D yellow, L orange, B blue.

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

export const FACE_INFO = {
  U: { name: 'White', side: 'Top', hex: '#ffffff' },
  R: { name: 'Red', side: 'Right', hex: '#c41e3a' },
  F: { name: 'Green', side: 'Front', hex: '#009e60' },
  D: { name: 'Yellow', side: 'Bottom', hex: '#ffd500' },
  L: { name: 'Orange', side: 'Left', hex: '#ff7a00' },
  B: { name: 'Blue', side: 'Back', hex: '#0051ba' },
};

/** How to hold the cube to read each face, and which faces border it in the net. */
export const FACE_VIEW = {
  U: {
    howTo: 'Look down at the top (white centre), green side nearest you.',
    edges: { top: 'B', right: 'R', bottom: 'F', left: 'L' },
  },
  F: {
    howTo: 'Green centre facing you, white on top.',
    edges: { top: 'U', right: 'R', bottom: 'D', left: 'L' },
  },
  R: {
    howTo: 'Turn the cube left so red faces you, white on top.',
    edges: { top: 'U', right: 'B', bottom: 'D', left: 'F' },
  },
  B: {
    howTo: 'Turn the cube around so blue faces you, white on top.',
    edges: { top: 'U', right: 'L', bottom: 'D', left: 'R' },
  },
  L: {
    howTo: 'Turn the cube right so orange faces you, white on top.',
    edges: { top: 'U', right: 'F', bottom: 'D', left: 'B' },
  },
  D: {
    howTo: 'Tip the cube toward you to see the bottom (yellow), green side at the top.',
    edges: { top: 'F', right: 'R', bottom: 'B', left: 'L' },
  },
};

export const SOLVED = FACES.map((f) => f.repeat(9)).join('');

/** Index of a face's centre sticker in the facelet string. */
export const centerIndex = (face) => FACES.indexOf(face) * 9 + 4;

// Facelet indices of each corner / edge position and the colours of each
// piece, in Kociemba's numbering (U1..U9 = 0..8, R1..R9 = 9..17, ...).
const CORNER_FACELETS = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const CORNER_COLORS = [
  'URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB',
];
const EDGE_FACELETS = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
const EDGE_COLORS = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

function parity(perm) {
  let p = 0;
  for (let i = 0; i < perm.length; i++) {
    for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  }
  return p;
}

/**
 * Checks that a facelet string describes a cube that can actually exist.
 * Returns { ok: true } or { ok: false, error } with a message for the user.
 * The solver must never see an impossible cube (it would search forever).
 */
export function validateFacelets(f) {
  if (f.length !== 54 || /[^URFDLB]/.test(f)) {
    return { ok: false, error: 'Paint every sticker before solving.' };
  }
  for (const face of FACES) {
    if (f[centerIndex(face)] !== face) {
      return { ok: false, error: 'Centre stickers must stay at their own colours.' };
    }
  }
  for (const face of FACES) {
    const count = f.split(face).length - 1;
    if (count !== 9) {
      const { name } = FACE_INFO[face];
      return {
        ok: false,
        error: `${name} appears ${count} time${count === 1 ? '' : 's'} — every colour needs exactly 9.`,
      };
    }
  }

  const cp = [];
  const co = [];
  for (let i = 0; i < 8; i++) {
    const fl = CORNER_FACELETS[i];
    const ori = [0, 1, 2].find((o) => f[fl[o]] === 'U' || f[fl[o]] === 'D');
    if (ori === undefined) return { ok: false, error: impossiblePiece('corner') };
    const c1 = f[fl[(ori + 1) % 3]];
    const c2 = f[fl[(ori + 2) % 3]];
    const piece = CORNER_COLORS.findIndex(
      (cols) => cols[0] === f[fl[ori]] && cols[1] === c1 && cols[2] === c2,
    );
    if (piece < 0) return { ok: false, error: impossiblePiece('corner') };
    cp.push(piece);
    co.push(ori);
  }

  const ep = [];
  const eo = [];
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELETS[i].map((k) => f[k]);
    let piece = EDGE_COLORS.findIndex((cols) => cols[0] === a && cols[1] === b);
    let ori = 0;
    if (piece < 0) {
      piece = EDGE_COLORS.findIndex((cols) => cols[0] === b && cols[1] === a);
      ori = 1;
    }
    if (piece < 0) return { ok: false, error: impossiblePiece('edge') };
    ep.push(piece);
    eo.push(ori);
  }

  if (new Set(cp).size !== 8) return { ok: false, error: duplicatePiece('corner') };
  if (new Set(ep).size !== 12) return { ok: false, error: duplicatePiece('edge') };
  if (co.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return {
      ok: false,
      error: 'One corner looks twisted in place. Check the corner stickers — this cube can’t be solved as painted.',
    };
  }
  if (eo.reduce((a, b) => a + b, 0) % 2 !== 0) {
    return {
      ok: false,
      error: 'One edge looks flipped. Check the edge stickers — this cube can’t be solved as painted.',
    };
  }
  if (parity(cp) !== parity(ep)) {
    return {
      ok: false,
      error: 'Two pieces look swapped. Check the stickers — this cube can’t be solved as painted.',
    };
  }
  return { ok: true };
}

const impossiblePiece = (kind) =>
  `A ${kind} has a colour combination that doesn’t exist on a real cube. Check the ${kind} stickers.`;
const duplicatePiece = (kind) =>
  `The same ${kind} piece appears twice. Check the ${kind} stickers.`;
