import { useEffect, useRef } from 'react';
import { toNotation } from '../cube/notation.js';

const FACE_WORDS = {
  U: 'top (white)',
  D: 'bottom (yellow)',
  F: 'front (green)',
  B: 'back (blue)',
  R: 'right (red)',
  L: 'left (orange)',
  M: 'middle slice',
  E: 'equator slice',
  S: 'standing slice',
};

/** Plain-language instruction for a move, for following along on a real cube. */
function describeMove(move) {
  const face = FACE_WORDS[toNotation(move)[0]];
  if (move.turns === 2) return `Turn the ${face} face a half turn (180°)`;
  const dir = move.turns === 1 ? 'clockwise' : 'counter-clockwise';
  return `Turn the ${face} face ${dir}`;
}

/**
 * Floating card that walks through a solution one move at a time.
 * `guide` is { moves, index, playing }; `index` is the next move to make.
 */
export default function SolveGuide({ guide, busy, onBack, onNext, onTogglePlay, onClose }) {
  const { moves, index } = guide;
  const total = moves.length;
  const done = index >= total;
  const playing = guide.playing && !done;
  const stripRef = useRef(null);

  // Keep the current move visible in the move strip.
  useEffect(() => {
    stripRef.current
      ?.querySelector('.current')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  return (
    <section className="guide" aria-label="Step-by-step solution" aria-live="polite">
      <div className="guide-head">
        <span className="guide-step">
          {total === 0
            ? 'Already solved'
            : done
              ? `Solved in ${total} move${total === 1 ? '' : 's'}`
              : `Step ${index + 1} of ${total}`}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close guide">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      {total > 0 && (
        <>
          <div className="guide-move">
            {done ? (
              <span className="guide-done">🎉 Cube solved!</span>
            ) : (
              <>
                <span className="guide-notation">{toNotation(moves[index])}</span>
                <span className="guide-desc">{describeMove(moves[index])}</span>
              </>
            )}
          </div>

          <div className="guide-progress" aria-hidden="true">
            <span style={{ width: `${(index / total) * 100}%` }} />
          </div>

          <div className="guide-strip" ref={stripRef} aria-hidden="true">
            {moves.map((m, i) => (
              <span
                key={i}
                className={i < index ? 'past' : i === index ? 'current' : ''}
              >
                {toNotation(m)}
              </span>
            ))}
          </div>

          <div className="guide-actions">
            <button onClick={onBack} disabled={index === 0 || playing}>
              ◀ Back
            </button>
            <button onClick={onTogglePlay} disabled={done}>
              {playing ? '❚❚ Pause' : '▶ Play'}
            </button>
            <button className="primary" onClick={onNext} disabled={done || playing || busy}>
              Next ▶
            </button>
          </div>
        </>
      )}
    </section>
  );
}
