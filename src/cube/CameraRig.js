import * as THREE from 'three';

// Bounding-sphere radius of the cube plus a little breathing room.
const CUBE_RADIUS = 2.75;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2;
const SNAP_MS = 450;
const ELEVATION = 0.75; // how far above the cube the "straight" view sits

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function lookQuaternion(eye, up) {
  const m = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/**
 * Orbits the camera around the origin. The whole camera pose is a single
 * quaternion, so there are no poles to get stuck on: the camera sits at
 * q·(0,0,distance) and looks at the cube with orientation q.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.q = lookQuaternion(new THREE.Vector3(1, ELEVATION, 1), Y);
    this.zoom = 1.15;
    this.fitDistance = 8;
    this.tween = null;
    this.fit();
  }

  /**
   * Recomputes the distance at which the whole cube fits the viewport.
   * `visibleFraction` is the share of the height not covered by overlays.
   */
  fit(visibleFraction = 1) {
    const fullV = THREE.MathUtils.degToRad(this.camera.fov);
    const vfov = 2 * Math.atan(Math.tan(fullV / 2) * visibleFraction);
    const hfov = 2 * Math.atan(Math.tan(fullV / 2) * this.camera.aspect);
    this.fitDistance = CUBE_RADIUS / Math.sin(Math.min(vfov, hfov) / 2);
  }

  /** Rotates by screen-space angles: yaw about the screen's vertical axis, pitch about its horizontal. */
  rotate(yaw, pitch) {
    this.tween = null;
    if (yaw) this.q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, -yaw));
    if (pitch) this.q.multiply(new THREE.Quaternion().setFromAxisAngle(X, -pitch));
    this.q.normalize();
  }

  /** Turntable spin: rotates the camera around a fixed world axis through the cube. */
  spin(axis, angle) {
    this.tween = null;
    this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, -angle));
    this.q.normalize();
  }

  /** The cube axis (±x, ±y, ±z) that currently points most nearly up on screen. */
  uprightAxis() {
    const up = Y.clone().applyQuaternion(this.q);
    const i = [0, 1, 2].reduce((best, k) =>
      Math.abs(up.getComponent(k)) > Math.abs(up.getComponent(best)) ? k : best,
    );
    return new THREE.Vector3().setComponent(i, Math.sign(up.getComponent(i)) || 1);
  }

  /**
   * Points the camera from a horizontal angle (yaw, around the vertical
   * axis; 0° = looking at the front face) and a vertical angle (pitch;
   * positive = looking down on the top face), both in degrees.
   */
  setAngles(yawDeg, pitchDeg, animate = false) {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitchDeg, -89, 89));
    const eye = new THREE.Vector3(
      Math.cos(pitch) * Math.sin(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.cos(yaw),
    );
    const target = lookQuaternion(eye, Y);
    if (animate) {
      this.tween = { from: this.q.clone(), to: target, elapsed: 0 };
    } else {
      this.tween = null;
      this.q.copy(target);
    }
  }

  setZoom(zoom) {
    this.zoom = THREE.MathUtils.clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  }

  /**
   * Straightens the view: picks the cube axis closest to the screen's "up",
   * then moves to the nearest corner view that shows three faces with that
   * axis pointing straight up.
   */
  snap() {
    const eye = Z.clone().applyQuaternion(this.q);
    const upAxis = this.uprightAxis();
    const ui = [0, 1, 2].find((i) => upAxis.getComponent(i) !== 0);

    const corner = new THREE.Vector3();
    for (let i = 0; i < 3; i++) {
      const v = i === ui ? upAxis.getComponent(i) * ELEVATION : Math.sign(eye.getComponent(i)) || 1;
      corner.setComponent(i, v);
    }

    this.tween = { from: this.q.clone(), to: lookQuaternion(corner, upAxis), elapsed: 0 };
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.elapsed += dt;
      const t = Math.min(tw.elapsed / SNAP_MS, 1);
      this.q.slerpQuaternions(tw.from, tw.to, easeOut(t));
      if (t >= 1) this.tween = null;
    }
    const distance = this.fitDistance * this.zoom;
    this.camera.position.set(0, 0, distance).applyQuaternion(this.q);
    this.camera.quaternion.copy(this.q);
  }
}
