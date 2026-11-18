import { useEffect, useRef, useState } from 'react';
import {
  FACES,
  FACE_INFO,
  FACE_VIEW,
  SOLVED,
  centerIndex,
  validateFacelets,
} from '../solver/facelets.js';
import { warmUpSolver } from '../solver/solver.js';

// Order the faces are visited in: turn the cube around, then top and bottom.
const FACE_ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];

/** A blank sheet: only the (fixed) centres are coloured. */
function blank() {
  const f = new Array(54).fill(null);
  for (const face of FACES) f[centerIndex(face)] = face;
  return f;
}

const faceStickers = (facelets, face) => {
  const start = FACES.indexOf(face) * 9;
  return facelets.slice(start, start + 9);
};

/**
 * Lets the user paint a 2D copy of their physical cube, one face at a time,
 * then hands the facelet string to `onApply` (which solves it).
 */
export default function ImportDialog({ open, onClose, getCurrentFacelets, onApply }) {
  const dialogRef = useRef(null);
  const [facelets, setFacelets] = useState(blank);
  const [face, setFace] = useState('F');
  const [color, setColor] = useState('U');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) {
      dialog.showModal();
      warmUpSolver(); // build the solver tables while the user paints
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const counts = Object.fromEntries(FACES.map((c) => [c, facelets.filter((x) => x === c).length]));
  const filled = facelets.every(Boolean);

  const paint = (index) => {
    if (FACES.some((f) => centerIndex(f) === index)) return; // centres are fixed
    setError('');
    setFacelets((prev) => {
      const next = [...prev];
      next[index] = prev[index] === color ? null : color; // tap again to clear
      return next;
    });
  };

  const load = (str) => {
    setError('');
    setFacelets(str ? str.split('') : blank());
  };

  const apply = async () => {
    const str = facelets.map((x) => x ?? '?').join('');
    const check = validateFacelets(str);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setWorking(true);
    setError('');
    try {
      await onApply(str);
    } catch (err) {
      setError(err.message || 'Could not solve this cube.');
    } finally {
      setWorking(false);
    }
  };

  const view = FACE_VIEW[face];
  const start = FACES.indexOf(face) * 9;

  return (
    <dialog
      ref={dialogRef}
      className="import-dialog"
      aria-labelledby="import-title"
      onClose={onClose}
      onCancel={(e) => working && e.preventDefault()}
    >
      <div className="import-body">
        <div className="share-head">
          <h2 id="import-title">Import your cube</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={working}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <p className="share-sub">
          Hold your cube with the <b>white</b> centre on top and <b>green</b> facing you. Paint
          each face to match, then solve it step by step.
        </p>

        {/* Face tabs with live mini previews */}
        <div className="face-tabs" role="tablist" aria-label="Cube faces">
          {FACE_ORDER.map((f) => {
            const stickers = faceStickers(facelets, f);
            const done = stickers.every(Boolean);
            return (
              <button
                key={f}
                role="tab"
                aria-selected={face === f}
                className={`face-tab ${face === f ? 'active' : ''}`}
                onClick={() => setFace(f)}
              >
                <span className="mini">
                  {stickers.map((s, i) => (
                    <i key={i} style={{ background: s ? FACE_INFO[s].hex : undefined }} />
                  ))}
                </span>
                <span className="tab-label">
                  {FACE_INFO[f].side}
                  {done && <span aria-label="done"> ✓</span>}
                </span>
              </button>
            );
          })}
        </div>

        <p className="how-to">
          <b>
            {FACE_INFO[face].side} ({FACE_INFO[face].name.toLowerCase()}):
          </b>{' '}
          {view.howTo}
        </p>

        {/* The face being painted, framed by the colours of its neighbours */}
        <div className="face-frame">
          {['top', 'right', 'bottom', 'left'].map((side) => (
            <span
              key={side}
              className={`edge edge-${side}`}
              style={{ background: FACE_INFO[view.edges[side]].hex }}
              title={`${FACE_INFO[view.edges[side]].name} side`}
            />
          ))}
          <div className="face-grid">
            {faceStickers(facelets, face).map((s, i) => {
              const index = start + i;
              const isCenter = i === 4;
              return (
                <button
                  key={index}
                  className={`sticker ${s ? '' : 'empty'} ${isCenter ? 'center' : ''}`}
                  style={{ background: s ? FACE_INFO[s].hex : undefined }}
                  onClick={() => paint(index)}
                  disabled={isCenter}
                  aria-label={`${FACE_INFO[face].side} sticker ${i + 1}: ${
                    s ? FACE_INFO[s].name : 'not set'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Colour palette with counts */}
        <div className="palette" role="radiogroup" aria-label="Paint colour">
          {FACES.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`${FACE_INFO[c].name} (${counts[c]} of 9)`}
              className={`swatch ${color === c ? 'active' : ''}`}
              onClick={() => setColor(c)}
            >
              <span className="chip" style={{ background: FACE_INFO[c].hex }} />
              <span className={`count-label ${counts[c] > 9 ? 'over' : ''}`}>{counts[c]}/9</span>
            </button>
          ))}
        </div>

        <div className="import-tools">
          <span>Start from:</span>
          <button onClick={() => load(null)}>Blank</button>
          <button onClick={() => load(SOLVED)}>Solved</button>
          <button onClick={() => load(getCurrentFacelets())}>3D cube</button>
        </div>

        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}

        <div className="share-actions">
          <button onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button className="primary" onClick={apply} disabled={!filled || working}>
            {working ? 'Solving…' : filled ? 'Set up & solve' : `${54 - facelets.filter(Boolean).length} left`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
