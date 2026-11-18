import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CubeEngine } from './cube/CubeEngine.js';
import { parseMove, parseSequence } from './cube/notation.js';
import { loadCube, saveCube } from './storage.js';
import { usePwa } from './pwa/usePwa.js';
import ShareDialog from './components/ShareDialog.jsx';
import ImportDialog from './components/ImportDialog.jsx';
import SolveGuide from './components/SolveGuide.jsx';
import { solveFacelets } from './solver/solver.js';
import { invert } from './cube/notation.js';
import './App.css';

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M18 16.1c-.8 0-1.4.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8C7.5 9.3 6.8 9 6 9c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-2.9-2.8-2.9Z"
      fill="currentColor"
    />
  </svg>
);

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

// Must match the phone breakpoint in App.css.
const PHONE_QUERY = '(max-width: 760px)';

function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
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
  // Phones only: the control panel is a drawer, closed until the floating
  // button opens it. It slides over the cube view, which keeps its size.
  const [panelOpen, setPanelOpen] = useState(false);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const panelRef = useRef(null);
  const [drawerHeight, setDrawerHeight] = useState(0);
  const [angle, setAngle] = useState(loadAngle);
  const [shareOpen, setShareOpen] = useState(false);
  const pwa = usePwa();
  const [importOpen, setImportOpen] = useState(false);
  // Step-by-step solution being followed: { moves, index, playing } or null.
  const [guide, setGuide] = useState(null);
  const [findingSolution, setFindingSolution] = useState(false);
  const [guideError, setGuideError] = useState('');

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
    // Turning the cube by hand leaves the step-by-step guide behind.
    engine.onUserMove = () => setGuide(null);
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

  // Track the drawer's height (its content can grow, e.g. the move history).
  useEffect(() => {
    const el = panelRef.current;
    const ro = new ResizeObserver(() => setDrawerHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Height taken by the bottom dock (guide card + floating buttons).
  const dockRef = useRef(null);
  const [dockHeight, setDockHeight] = useState(0);
  useEffect(() => {
    const el = dockRef.current;
    const ro = new ResizeObserver(() =>
      setDockHeight(el.offsetHeight + (parseFloat(getComputedStyle(el).bottom) || 0)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // How much of the cube view the open drawer covers on phones (the dock
  // rides up by this much), and how much the cube must stay clear of: the
  // drawer plus, while the guide card is showing, the dock itself.
  const bottomInset = isPhone && panelOpen ? drawerHeight : 0;
  const cubeInset = bottomInset + (guide ? dockHeight : 0);
  useEffect(() => {
    engineRef.current?.setBottomInset(cubeInset);
  }, [cubeInset]);

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

  const turn = useCallback((token) => {
    setGuide(null);
    engineRef.current?.move(parseMove(token));
  }, []);

  /** Runs a cube action that isn't part of the guide (and so ends it). */
  const act = (fn) => {
    setGuide(null);
    setGuideError('');
    fn();
  };

  // ---- step-by-step solving -------------------------------------------

  const guideNext = () => {
    if (!guide || guide.index >= guide.moves.length) return;
    engineRef.current.move(guide.moves[guide.index]);
    setGuide({ ...guide, index: guide.index + 1 });
  };

  const guideBack = () => {
    if (!guide || guide.index === 0) return;
    engineRef.current.move(invert(guide.moves[guide.index - 1]));
    setGuide({ ...guide, index: guide.index - 1 });
  };

  // Play: make the next move once the previous one has finished turning.
  useEffect(() => {
    if (!guide?.playing || state.busy || guide.index >= guide.moves.length) return;
    const t = setTimeout(() => {
      engineRef.current.move(guide.moves[guide.index]);
      setGuide({ ...guide, index: guide.index + 1 });
    }, 450);
    return () => clearTimeout(t);
  }, [guide, state.busy]);

  /** Finds the shortest-ish solution for whatever is on the 3D cube now. */
  const solveStepByStep = async () => {
    setGuideError('');
    setFindingSolution(true);
    try {
      const moves = await solveFacelets(engineRef.current.getFacelets());
      setGuide({ moves, index: 0, playing: false });
      setPanelOpen(false);
    } catch (err) {
      setGuideError(err.message || 'Could not find a solution.');
    } finally {
      setFindingSolution(false);
    }
  };

  /** Sets the 3D cube to an imported state and starts guiding its solution. */
  const applyImport = async (facelets) => {
    const moves = await solveFacelets(facelets); // throws a user-facing message
    // Undoing the solution from solved recreates the imported state exactly.
    engineRef.current.restore(moves.slice().reverse().map(invert));
    setGuide({ moves, index: 0, playing: false });
    setImportOpen(false);
    setPanelOpen(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
      if (e.target.closest?.('dialog')) return; // keys inside a dialog
      const letter = e.key.toUpperCase();
      if (FACE_BUTTONS.includes(letter)) {
        turn(e.shiftKey ? `${letter}'` : letter);
      } else if (e.key === 'Backspace') {
        setGuide(null);
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
    <div
      className={`app ${panelOpen ? 'panel-open' : ''}`}
      style={{ '--drawer-offset': `${bottomInset}px` }}
    >
      <div className="viewport" ref={mountRef}>
        <div className={`status ${isSolved && !busy ? 'ok' : ''}`}>{status}</div>

        {/* Stacked notices: resume, app update, install. */}
        <div className="notices">
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

          {pwa.needRefresh && (
            <div className="toast" role="alert">
              <span>A new version is available</span>
              <button className="primary" onClick={pwa.update}>
                Update
              </button>
              <button onClick={pwa.dismissUpdate}>Later</button>
            </div>
          )}

          {pwa.showInstallBanner && (
            <div className="toast" role="status">
              <span>Install the app for quick, offline play</span>
              <button className="primary" onClick={pwa.install}>
                Install
              </button>
              <button onClick={pwa.dismissInstall}>Not now</button>
            </div>
          )}

          {pwa.showIosTip && (
            <div className="toast" role="status">
              <span>
                Install: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>
              </span>
              <button onClick={pwa.dismissInstall} aria-label="Dismiss install tip">
                OK
              </button>
            </div>
          )}
        </div>

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

        {/* Guide card and floating buttons; on phones they ride up with the drawer. */}
        <div className="dock" ref={dockRef}>
          {guide && (
            <SolveGuide
              guide={guide}
              busy={busy}
              onBack={guideBack}
              onNext={guideNext}
              onTogglePlay={() => setGuide({ ...guide, playing: !guide.playing })}
              onClose={() => setGuide(null)}
            />
          )}
          <div className="fabs">
            <button
              className="panel-toggle"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
              aria-controls="panel"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                {panelOpen ? (
                  <path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z" fill="currentColor" />
                ) : (
                  <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" fill="currentColor" />
                )}
              </svg>
              <span>{panelOpen ? 'Hide' : 'Controls'}</span>
            </button>

            <div className="fab-group">
              <button
                className="fab"
                onClick={() => setShareOpen(true)}
                title="Share with a QR code"
                aria-label="Share app"
              >
                <ShareIcon />
                <span>Share</span>
              </button>

              <button
                className="fab"
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
            </div>
          </div>
        </div>

        <p className={`hint ${guide ? 'hidden' : ''}`}>
          <span className="fine">
            Drag a face to turn it · drag the background to rotate · scroll to zoom
          </span>
          <span className="coarse">
            Swipe a face to turn it · swipe the background to rotate · pinch to zoom
          </span>
        </p>
      </div>

      <aside className="panel" id="panel" ref={panelRef} inert={isPhone && !panelOpen}>
        <h1>Rubik&apos;s Cube</h1>

        <div className="actions">
          <button className="primary" onClick={() => act(() => engine().shuffle(25))} disabled={busy}>
            Shuffle
          </button>
          <button
            className="primary solve"
            onClick={() => act(() => engine().solve())}
            disabled={busy || history.length === 0}
          >
            Solve
          </button>
          <button onClick={() => act(() => engine().undo())} disabled={busy || history.length === 0}>
            Undo
          </button>
          <button onClick={() => act(() => engine().reset())}>Reset</button>
        </div>

        <section className="physical">
          <h2>Real cube</h2>
          <div className="app-actions">
            <button onClick={() => setImportOpen(true)}>Import cube</button>
            <button
              className="primary"
              onClick={solveStepByStep}
              disabled={busy || findingSolution || isSolved}
              title="Find a short solution and walk through it move by move"
            >
              {findingSolution ? 'Finding…' : 'Solve step by step'}
            </button>
          </div>
          {guideError && (
            <p className="import-error" role="alert">
              {guideError}
            </p>
          )}
        </section>

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

        <section>
          <h2>App</h2>
          <div className="app-actions">
            <button onClick={() => setShareOpen(true)}>
              <ShareIcon /> Share
            </button>
            {pwa.canInstall && (
              <button className="primary" onClick={pwa.install}>
                Install app
              </button>
            )}
          </div>
        </section>
      </aside>

      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        getCurrentFacelets={() => engine().getFacelets()}
        onApply={applyImport}
      />
    </div>
  );
}
