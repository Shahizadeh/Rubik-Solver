import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  AXES,
  baseSign,
  combineTurns,
  invert,
  moveAngle,
  randomScramble,
  sameLayer,
  toNotation,
} from './notation.js';
import { CameraRig } from './CameraRig.js';

const COLORS = {
  px: 0xc41e3a, // R red
  nx: 0xff7a00, // L orange
  py: 0xffffff, // U white
  ny: 0xffd500, // D yellow
  pz: 0x009e60, // F green
  nz: 0x0051ba, // B blue
};

const CUBIE_SIZE = 0.96;
const STICKER_SIZE = 0.82;

function roundedSquare(size, radius) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new THREE.ShapeGeometry(s, 4);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CubeEngine {
  /**
   * @param {HTMLElement} container
   * @param {(state: object) => void} onChange
   */
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.history = []; // merged moves applied since the solved state
    this.queue = []; // [{ move, record, duration }]
    this.current = null; // animation in progress
    this.speed = 1;
    this.solving = false;
    this.controlMode = 'simple'; // 'simple' = one axis per drag, 'free' = both

    this.#initScene();
    this.#buildCube();
    this.#initPointer();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.#tick());
    this.#emit();
  }

  // ---------------------------------------------------------------- setup

  #initScene() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.scene.add(this.camera);
    this.rig = new CameraRig(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    // Lights ride along with the camera so every face looks the same
    // whichever way the view has been turned.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    this.camera.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-4, -2, 3);
    this.camera.add(fill);

    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(this.container);
  }

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.rig.fit();
  }

  #buildCube() {
    if (this.cubeGroup) {
      this.scene.remove(this.cubeGroup);
    } else {
      this.bodyGeometry = new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 3, 0.09);
      this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
      this.stickerGeometry = roundedSquare(STICKER_SIZE, 0.1);
      this.stickerMaterials = Object.fromEntries(
        Object.entries(COLORS).map(([k, c]) => [
          k,
          new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.05 }),
        ]),
      );
    }

    this.cubeGroup = new THREE.Group();
    this.pivot = new THREE.Group();
    this.cubeGroup.add(this.pivot);
    this.scene.add(this.cubeGroup);
    this.cubies = [];

    const offset = CUBIE_SIZE / 2 + 0.002;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new THREE.Mesh(this.bodyGeometry, this.bodyMaterial);
          cubie.position.set(x, y, z);
          cubie.userData.stickers = [];

          const faces = [
            [x === 1, 'px', [1, 0, 0]],
            [x === -1, 'nx', [-1, 0, 0]],
            [y === 1, 'py', [0, 1, 0]],
            [y === -1, 'ny', [0, -1, 0]],
            [z === 1, 'pz', [0, 0, 1]],
            [z === -1, 'nz', [0, 0, -1]],
          ];
          for (const [visible, key, n] of faces) {
            if (!visible) continue;
            const normal = new THREE.Vector3(...n);
            const sticker = new THREE.Mesh(this.stickerGeometry, this.stickerMaterials[key]);
            sticker.position.copy(normal).multiplyScalar(offset);
            sticker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            cubie.add(sticker);
            cubie.userData.stickers.push({ normal, color: key });
          }

          this.cubeGroup.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }
  }

  // ------------------------------------------------------------ public API

  get busy() {
    return this.current !== null || this.queue.length > 0;
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setControlMode(mode) {
    this.controlMode = mode;
  }

  /** Sets the view from horizontal/vertical angles in degrees. */
  setViewAngle(yaw, pitch, animate = false) {
    this.rig.setAngles(yaw, pitch, animate);
  }

  /** Animates the camera to the nearest upright three-face view. */
  straighten() {
    this.rig.snap();
  }

  /** Queue a single user move (from buttons, keyboard or drag). */
  move(move) {
    this.#enqueue([move], { record: true, duration: 260 });
  }

  shuffle(length = 25) {
    if (this.busy) return;
    this.#enqueue(randomScramble(length), { record: true, duration: 140 });
  }

  /** Returns the solution as a list of moves (inverse of the move history). */
  getSolution() {
    return this.history
      .slice()
      .reverse()
      .map(invert);
  }

  solve() {
    if (this.busy || this.history.length === 0) return;
    this.solving = true;
    this.#enqueue(this.getSolution(), { record: true, duration: 300 });
  }

  undo() {
    if (this.busy || this.history.length === 0) return;
    this.#enqueue([invert(this.history[this.history.length - 1])], {
      record: true,
      duration: 220,
    });
  }

  reset() {
    this.queue = [];
    this.current = null;
    this.history = [];
    this.solving = false;
    this.#buildCube();
    this.#emit();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    for (const [type, fn] of this.listeners) el.removeEventListener(type, fn);
    this.bodyGeometry.dispose();
    this.bodyMaterial.dispose();
    this.stickerGeometry.dispose();
    Object.values(this.stickerMaterials).forEach((m) => m.dispose());
    this.renderer.dispose();
    el.remove();
  }

  // -------------------------------------------------------------- moves

  #enqueue(moves, { record, duration }) {
    for (const move of moves) this.queue.push({ move, record, duration });
    this.#emit();
  }

  /**
   * Rebuilds a saved cube instantly (no animation) by replaying its move
   * history from the solved state. Used to resume a previous session.
   */
  restore(moves) {
    this.reset();
    for (const move of moves) {
      this.#grabLayer(move);
      this.#settleLayer(move, moveAngle(move));
      this.#record(move);
    }
    this.#emit();
  }

  /** Moves the cubies of a move's layer into the rotation pivot. */
  #grabLayer(move) {
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld();
    for (const cubie of this.cubies) {
      if (Math.round(cubie.position[move.axis]) === move.layer) this.pivot.attach(cubie);
    }
  }

  /** Finishes a layer rotation and puts its cubies back, snapped to the grid. */
  #settleLayer(move, angle) {
    this.pivot.rotation[move.axis] = angle;
    this.pivot.updateMatrixWorld();

    const m = new THREE.Matrix4();
    for (const cubie of [...this.pivot.children]) {
      this.cubeGroup.attach(cubie);
      cubie.position.round();
      // Snap the orientation to an exact 90° multiple to avoid float drift.
      m.makeRotationFromQuaternion(cubie.quaternion);
      for (let i = 0; i < 16; i++) m.elements[i] = Math.round(m.elements[i]);
      cubie.quaternion.setFromRotationMatrix(m);
    }
    this.pivot.rotation.set(0, 0, 0);
  }

  #startNext() {
    const item = this.queue.shift();
    if (!item) return;
    const { move } = item;
    this.#grabLayer(move);

    const halfTurn = Math.abs(move.turns) === 2 ? 1.5 : 1;
    this.current = {
      ...item,
      angle: moveAngle(move),
      elapsed: 0,
      duration: (item.duration * halfTurn) / this.speed,
    };
  }

  #finishCurrent() {
    const { move, angle, record } = this.current;
    this.#settleLayer(move, angle);
    this.current = null;

    if (record) this.#record(move);
    if (this.queue.length === 0) this.solving = false;
    this.#emit();
  }

  #record(move) {
    const last = this.history[this.history.length - 1];
    if (last && sameLayer(last, move)) {
      const turns = combineTurns(last.turns, move.turns);
      if (turns === 0) this.history.pop();
      else this.history[this.history.length - 1] = { ...last, turns };
    } else {
      this.history.push({ ...move });
    }
    // A solved cube needs no history (e.g. the user solved it by hand).
    if (this.isSolved()) this.history = [];
  }

  isSolved() {
    const seen = {};
    const n = new THREE.Vector3();
    for (const cubie of this.cubies) {
      for (const { normal, color } of cubie.userData.stickers) {
        n.copy(normal).applyQuaternion(cubie.quaternion).round();
        const key = `${n.x},${n.y},${n.z}`;
        if (seen[key] === undefined) seen[key] = color;
        else if (seen[key] !== color) return false;
      }
    }
    return true;
  }

  #tick() {
    const dt = this.clock.getDelta() * 1000;
    if (!this.current && this.queue.length) this.#startNext();
    if (this.current) {
      const c = this.current;
      c.elapsed += dt;
      const t = Math.min(c.elapsed / c.duration, 1);
      if (t >= 1) this.#finishCurrent();
      else this.pivot.rotation[c.move.axis] = c.angle * easeInOut(t);
    }
    this.rig.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  #emit() {
    this.onChange?.({
      busy: this.busy,
      solving: this.solving,
      queued: this.queue.length + (this.current ? 1 : 0),
      history: this.history.map(toNotation),
      solution: this.getSolution().map(toNotation),
      isSolved: this.isSolved(),
    });
  }

  // ------------------------------------------------------- pointer input
  //
  // One finger / left mouse button: drag a sticker to turn that layer, drag
  // the background to rotate the view. Two fingers: pinch to zoom. Wheel: zoom.

  #initPointer() {
    const el = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointers = new Map(); // pointerId -> { x, y }
    this.gesture = null;

    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2) {
        this.gesture = {
          type: 'pinch',
          startDist: this.#pinchDistance(),
          startZoom: this.rig.zoom,
        };
        return;
      }
      if (this.pointers.size > 2) return;

      const base = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        touch: e.pointerType !== 'mouse',
      };
      const hit = this.busy ? null : this.#pick(e);
      this.gesture = hit ? { type: 'turn', ...hit, ...base } : { type: 'orbit', lock: null, ...base };
    };

    const move = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const g = this.gesture;
      if (!g) return;

      if (g.type === 'pinch') {
        const d = this.#pinchDistance();
        if (d > 0 && g.startDist > 0) this.rig.setZoom((g.startZoom * g.startDist) / d);
        return;
      }

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const threshold = g.touch ? 12 : 6;

      if (g.type === 'turn') {
        if (Math.hypot(dx, dy) < threshold) return;
        const m = this.#moveFromDrag(g, dx, dy);
        if (m) this.move(m);
        this.gesture = { type: 'done' };
        return;
      }

      if (g.type === 'orbit') {
        const stepX = e.clientX - g.lastX;
        const stepY = e.clientY - g.lastY;
        g.lastX = e.clientX;
        g.lastY = e.clientY;
        const k = this.#rotateSpeed();

        if (this.controlMode === 'free') {
          this.rig.rotate(stepX * k, stepY * k);
          return;
        }

        // Simple mode: the first few pixels decide left-right or up-down,
        // and the rest of the drag stays on that axis. Left-right spins the
        // cube like a turntable around whichever cube axis is pointing up, so
        // the view never rolls sideways; up-down tilts it toward/away from you.
        const turn = (amountX, amountY) => {
          if (g.lock === 'h') this.rig.spin(g.spinAxis, amountX * k);
          else this.rig.rotate(0, amountY * k);
        };
        if (!g.lock) {
          if (Math.hypot(dx, dy) < threshold) return;
          g.lock = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
          g.spinAxis = this.rig.uprightAxis();
          turn(dx, dy);
          return;
        }
        turn(stepX, stepY);
      }
    };

    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) this.gesture = null;
      // Lifting one finger of a pinch shouldn't turn into a rotate.
      else this.gesture = { type: 'done' };
    };

    const wheel = (e) => {
      e.preventDefault();
      this.rig.setZoom(this.rig.zoom * Math.exp(e.deltaY * 0.0012));
    };

    this.listeners = [
      ['pointerdown', down],
      ['pointermove', move],
      ['pointerup', up],
      ['pointercancel', up],
      ['wheel', wheel],
    ];
    for (const [type, fn] of this.listeners) {
      el.addEventListener(type, fn, type === 'wheel' ? { passive: false } : undefined);
    }
  }

  #pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Radians per pixel: a drag across the viewport's short side turns about 180°. */
  #rotateSpeed() {
    const { clientWidth: w, clientHeight: h } = this.container;
    return Math.PI / Math.max(320, Math.min(w, h));
  }

  #pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const [hit] = this.raycaster.intersectObjects(this.cubies, true);
    if (!hit) return null;

    let cubie = hit.object;
    while (cubie.parent !== this.cubeGroup) cubie = cubie.parent;

    // The face that was touched is the dominant axis of the hit point.
    const p = hit.point;
    const abs = [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)];
    const ni = abs.indexOf(Math.max(...abs));
    const normal = new THREE.Vector3();
    normal.setComponent(ni, Math.sign(p.getComponent(ni)));

    return { point: p.clone(), normal, cubiePos: cubie.position.clone().round() };
  }

  #toScreen(v) {
    const p = v.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2((p.x * rect.width) / 2, (-p.y * rect.height) / 2);
  }

  #moveFromDrag(drag, dx, dy) {
    const dragVec = new THREE.Vector2(dx, dy).normalize();
    const origin = this.#toScreen(drag.point);

    // Pick the in-plane axis whose on-screen direction best matches the drag.
    let best = null;
    for (let i = 0; i < 3; i++) {
      if (drag.normal.getComponent(i) !== 0) continue;
      const t = new THREE.Vector3().setComponent(i, 1);
      const screenDir = this.#toScreen(drag.point.clone().add(t)).sub(origin).normalize();
      const dot = screenDir.dot(dragVec);
      if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { t, dot };
    }
    if (!best) return null;

    // Rotating about (normal × t) moves surface points along +t.
    const tangent = best.t.multiplyScalar(Math.sign(best.dot));
    const axisVec = new THREE.Vector3().crossVectors(drag.normal, tangent);
    const ai = [0, 1, 2].find((i) => Math.abs(axisVec.getComponent(i)) > 0.5);
    const axis = AXES[ai];
    const angleSign = Math.sign(axisVec.getComponent(ai));
    const layer = drag.cubiePos.getComponent(ai);
    return { axis, layer, turns: angleSign * baseSign(axis, layer) };
  }
}
