// Cinematic camera rig: eased moves between shots, slow orbits and shake.
import * as THREE from 'three';

const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  linear: (t) => t,
};

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3();
    this.from = null;
    this.to = null;
    this.t = 0;
    this.dur = 1;
    this.orbit = null;
    this.shakeAmt = 0;
    this.time = 0;
    this.fov = camera.fov;
    this.fovTarget = camera.fov;
    this.sway = 1;
    this.shift = 0;
    this.shiftTarget = 0;
  }

  /** Slide the framing sideways: 0 = centred, 0.33 = look target sits in the left third of the screen. */
  setShift(v) { this.shiftTarget = v; }

  /** Move to a shot. Returns a promise that resolves when the move ends. */
  shot(pos, look, dur = 1.6, easing = 'inOut', fov = null) {
    this.finishPending();
    this.orbit = null;
    this.from = { pos: this.pos.clone(), look: this.look.clone() };
    this.to = { pos: pos.clone(), look: look.clone() };
    this.t = 0;
    this.dur = Math.max(0.001, dur);
    this.easing = ease[easing] || ease.inOut;
    if (fov) this.fovTarget = fov;
    return new Promise((res) => { this.resolve = res; });
  }

  finishPending() {
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  cut(pos, look, fov = null) {
    this.finishPending();
    this.orbit = null;
    this.to = null;
    this.pos.copy(pos);
    this.look.copy(look);
    if (fov) { this.fovTarget = fov; this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  /** Circle a point. With `swing` (radians) the camera sways back and forth instead of going all the way round. */
  startOrbit(center, radius, height, speed = 0.05, startAngle = null, lookOffset = new THREE.Vector3(), swing = 0) {
    this.finishPending();
    const a = startAngle ?? Math.atan2(this.pos.x - center.x, this.pos.z - center.z);
    this.orbit = { center: center.clone(), radius, height, speed, angle: a, base: a, t: 0, swing, lookOffset };
    this.to = null;
  }

  shake(a = 0.4) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt) {
    this.time += dt;
    if (this.to) {
      this.t += dt / this.dur;
      const k = this.easing(Math.min(1, this.t));
      this.pos.lerpVectors(this.from.pos, this.to.pos, k);
      this.look.lerpVectors(this.from.look, this.to.look, k);
      if (this.t >= 1) {
        this.to = null;
        const r = this.resolve;
        this.resolve = null;
        r?.();
      }
    } else if (this.orbit) {
      const o = this.orbit;
      o.t += dt;
      o.angle = o.swing ? o.base + Math.sin(o.t * o.speed) * o.swing : o.angle + o.speed * dt;
      const target = new THREE.Vector3(o.center.x + Math.sin(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.cos(o.angle) * o.radius);
      this.pos.lerp(target, Math.min(1, dt * 1.5));
      this.look.lerp(o.center.clone().add(o.lookOffset), Math.min(1, dt * 1.5));
    }
    const cam = this.camera;
    cam.position.copy(this.pos);
    // gentle handheld sway keeps it feeling alive
    const s = this.sway;
    cam.position.x += Math.sin(this.time * 0.5) * 0.08 * s;
    cam.position.y += Math.sin(this.time * 0.7) * 0.06 * s;
    if (this.shakeAmt > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.02, dt);
    }
    cam.lookAt(this.look);
    this.shift += (this.shiftTarget - this.shift) * Math.min(1, dt * 3.5);
    if (Math.abs(this.shift) > 0.002) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      cam.setViewOffset(w, h, this.shift * w, 0, w, h);
    } else if (cam.view?.enabled) {
      this.shift = 0;
      cam.clearViewOffset();
    }
    if (Math.abs(cam.fov - this.fovTarget) > 0.01) {
      cam.fov += (this.fovTarget - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
    }
  }
}
