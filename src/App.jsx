import { useCallback, useEffect, useRef, useState } from 'react';
import { CubeEngine } from './cube/CubeEngine.js';
import { parseMove, parseSequence } from './cube/notation.js';
import { loadCube, saveCube } from './storage.js';
import './App.css';

const FACE_BUTTONS = ['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S'];

const MODE_KEY = 'rubik.controlMode';

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'free' ? 'free' : 'simple';
  } catch {
    return 'simple';
  }
}

const ANGLE_KEY = 'rubik.viewAngle';
const DEFAULT_ANGLE = { yaw: 45, pitch: 28 };

function loadAngle() {
  try {
    const saved = JSON.parse(localStorage.getItem(ANGLE_KEY));
    if (Number.isFinite(saved?.yaw) && Number.isFinite(saved?.pitch)) return saved;
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_ANGLE;
}

const INITIAL_STATE = {
  busy: false,
  solving: false,
  queued: 0,
  history: [],
  solution: [],
  isSolved: true,
};

export default function App() {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const [state, setState] = useState(INITIAL_STATE);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState(loadMode);
  const [angle, setAngle] = useState(loadAngle);

  // Read the saved cube once; kept in state so React's dev double-mount
  // restores the same save both times.
  const [savedMoves] = useState(() => {
    try {
      return parseSequence(loadCube().join(' '));
    } catch {
      return []; // unreadable save: start solved
    }
  });
  const [resumed, setResumed] = useState(savedMoves.length > 0);

  useEffect(() => {
    const engine = new CubeEngine(mountRef.current, (s) => {
      setState(s);
      saveCube(s.history);
    });
    engineRef.current = engine;
    if (savedMoves.length) engine.restore(savedMoves);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [savedMoves]);

  useEffect(() => {
    if (!resumed) return;
    const t = setTimeout(() => setResumed(false), 6000);
    return () => clearTimeout(t);
  }, [resumed]);

  useEffect(() => {
    engineRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    engineRef.current?.setControlMode(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Storage may be unavailable (private mode); the choice just won't persist.
    }
  }, [mode]);

  // The angle sliders set the starting view: applied on load and live while
  // the sliders move, and remembered for next time.
  useEffect(() => {
    engineRef.current?.setViewAngle(angle.yaw, angle.pitch);
    try {
      localStorage.setItem(ANGLE_KEY, JSON.stringify(angle));
    } catch {
      // Not persisted; the view still updates.
    }
  }, [angle]);

  const turn = useCallback((token) => engineRef.current?.move(parseMove(token)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
      const letter = e.key.toUpperCase();
      if (FACE_BUTTONS.includes(letter)) {
        turn(e.shiftKey ? `${letter}'` : letter);
      } else if (e.key === 'Backspace') {
        engineRef.current?.undo();
      } else if (e.key === ' ' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        engineRef.current?.straighten();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  const engine = () => engineRef.current;
  const { busy, solving, history, solution, isSolved } = state;

  let status;
  if (solving) status = 'Solving…';
  else if (busy) status = 'Turning…';
  else if (isSolved) status = 'Solved';
  else status = 'Scrambled';

  return (
    <div className="app">
      <div className="viewport" ref={mountRef}>
        <div className={`status ${isSolved && !busy ? 'ok' : ''}`}>{status}</div>

        {resumed && (
          <div className="toast" role="status">
            <span>Resumed your saved cube</span>
            <button
              onClick={() => {
                engine().reset();
                setResumed(false);
              }}
            >
              Start fresh
            </button>
          </div>
        )}

        <div className="mode-toggle" role="radiogroup" aria-label="View control">
          {[
            ['simple', 'Simple', 'Each drag turns the view left-right or up-down'],
            ['free', 'Free', 'Drag the view in any direction'],
          ].map(([value, label, title]) => (
            <button
              key={value}
              role="radio"
              aria-checked={mode === value}
              className={mode === value ? 'active' : ''}
              title={title}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className="straighten"
          onClick={() => engine().straighten()}
          title="Straighten view (Space)"
          aria-label="Straighten view"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z"
              fill="currentColor"
            />
          </svg>
          <span>Straighten</span>
        </button>

        <p className="hint">
          <span className="fine">
            Drag a face to turn it · drag the background to rotate · scroll to zoom
          </span>
          <span className="coarse">
            Swipe a face to turn it · swipe the background to rotate · pinch to zoom
          </span>
        </p>
      </div>

      <aside className="panel">
        <h1>Rubik&apos;s Cube</h1>

        <div className="actions">
          <button className="primary" onClick={() => engine().shuffle(25)} disabled={busy}>
            Shuffle
          </button>
          <button
            className="primary solve"
            onClick={() => engine().solve()}
            disabled={busy || history.length === 0}
          >
            Solve
          </button>
          <button onClick={() => engine().undo()} disabled={busy || history.length === 0}>
            Undo
          </button>
          <button onClick={() => engine().reset()}>Reset</button>
        </div>

        <label className="speed">
          Speed <span>{speed.toFixed(1)}×</span>
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>

        {mode === 'simple' && (
          <section className="view-angle">
            <h2>View angle</h2>
            <label className="speed">
              Horizontal <span>{angle.yaw}°</span>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={angle.yaw}
                onChange={(e) => setAngle((a) => ({ ...a, yaw: Number(e.target.value) }))}
              />
            </label>
            <label className="speed">
              Vertical <span>{angle.pitch}°</span>
              <input
                type="range"
                min="-89"
                max="89"
                step="1"
                value={angle.pitch}
                onChange={(e) => setAngle((a) => ({ ...a, pitch: Number(e.target.value) }))}
              />
            </label>
            <div className="angle-actions">
              <button
                onClick={() => engine().setViewAngle(angle.yaw, angle.pitch, true)}
                title="Return to the angle set above"
              >
                Reset view
              </button>
              <button onClick={() => setAngle(DEFAULT_ANGLE)} title="Restore 45° / 28°">
                Default angle
              </button>
            </div>
          </section>
        )}

        <section>
          <h2>Moves</h2>
          <div className="moves">
            {FACE_BUTTONS.map((f) => (
              <div className="move-col" key={f}>
                <button onClick={() => turn(f)}>{f}</button>
                <button onClick={() => turn(`${f}'`)}>{f}&apos;</button>
              </div>
            ))}
          </div>
          <p className="small fine">
            Keyboard: letter = clockwise, Shift+letter = counter-clockwise, Backspace = undo,
            Space = straighten
          </p>
        </section>

        <section>
          <h2>
            History <span className="count">{history.length}</span>
          </h2>
          <div className="seq">{history.length ? history.join(' ') : '—'}</div>
        </section>

        <section>
          <h2>
            Solution <span className="count">{solution.length}</span>
          </h2>
          <div className="seq">{solution.length ? solution.join(' ') : '—'}</div>
        </section>
      </aside>
    </div>
  );
}
