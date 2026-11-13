import * as THREE from 'three';
import { makeCoin, makeGift, type Gift } from '../gift3d';

const TAPS_TO_OPEN = 3;

type Particle = { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number };

/**
 * AR catch: live camera behind a transparent three.js canvas, camera rotated by
 * the gyroscope (or mouse drag on desktop). The gift floats in front of the
 * player and drifts playfully; tap it TAPS_TO_OPEN times to open.
 */
export class CatchScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private gift: Gift;
  private particles: Particle[] = [];
  private raf = 0;
  private t0 = performance.now();
  private last = performance.now();
  private taps = 0;
  private opened = false;
  private shake = 0;
  private lidV = new THREE.Vector3();
  private ori: { a: number; b: number; g: number } | null = null;
  private drag = { yaw: 0, pitch: 0 };
  private disposers: (() => void)[] = [];
  private ray = new THREE.Raycaster();
  private host: HTMLElement;
  private onTap: (left: number) => void;
  private onOpened: () => void;

  constructor(host: HTMLElement, initial: string, color: string, onTap: (left: number) => void, onOpened: () => void) {
    this.host = host;
    this.onTap = onTap;
    this.onOpened = onOpened;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 100);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(1, 2, 1.5);
    this.scene.add(sun);

    this.gift = makeGift(initial, color);
    this.gift.group.scale.setScalar(0.55);
    this.gift.group.position.set(0, -0.45, -2.4);
    this.scene.add(this.gift.group);

    this.resize();
    const onResize = () => this.resize();
    addEventListener('resize', onResize);
    this.disposers.push(() => removeEventListener('resize', onResize));

    const onOri = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      this.ori = { a: e.alpha, b: e.beta, g: e.gamma };
    };
    addEventListener('deviceorientation', onOri);
    this.disposers.push(() => removeEventListener('deviceorientation', onOri));

    const el = this.renderer.domElement;
    let last: { x: number; y: number; moved: number } | null = null;
    const down = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY, moved: 0 }; };
    const move = (e: PointerEvent) => {
      if (!last || this.ori) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.yaw -= dx * 0.004;
      this.drag.pitch = THREE.MathUtils.clamp(this.drag.pitch - dy * 0.004, -1, 1);
      last.x = e.clientX; last.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (last && last.moved < 10) this.tap(e.clientX, e.clientY);
      last = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    });

    this.loop();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private applyOrientation() {
    if (!this.ori) {
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.drag.pitch, this.drag.yaw, 0, 'YXZ'));
      return;
    }
    const d = THREE.MathUtils.degToRad;
    const screenAngle = d((screen.orientation && screen.orientation.angle) || 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d(this.ori.b), d(this.ori.a), -d(this.ori.g), 'YXZ'));
    q.multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)); // camera looks out the back of the device
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle));
    this.camera.quaternion.slerp(q, 0.35);
  }

  private tap(x: number, y: number) {
    if (this.opened) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    if (this.ray.intersectObject(this.gift.body, true).length === 0) return;
    this.taps++;
    this.shake = 1;
    this.burst(6, 1.2);
    navigator.vibrate?.(30);
    const left = TAPS_TO_OPEN - this.taps;
    this.onTap(left);
    if (left <= 0) this.open();
  }

  private open() {
    this.opened = true;
    this.lidV.set((Math.random() - 0.5) * 1.5, 4.5, 0.5);
    this.burst(36, 3);
    navigator.vibrate?.([40, 60, 80]);
    setTimeout(() => this.onOpened(), 1300);
  }

  private burst(n: number, power: number) {
    const origin = new THREE.Vector3();
    this.gift.body.getWorldPosition(origin);
    origin.y += 0.3;
    for (let i = 0; i < n; i++) {
      const mesh = makeCoin();
      mesh.position.copy(origin);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        v: new THREE.Vector3((Math.random() - 0.5) * power, (0.6 + Math.random()) * power, (Math.random() - 0.5) * power),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life: 1.6 + Math.random() * 0.6,
      });
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const t = (now - this.t0) / 1000;
    this.applyOrientation();

    // float in front of the player with a playful drift
    const g = this.gift.group;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wander = this.opened ? 0 : Math.sin(t * 0.9) * 0.55;
    const target = fwd.clone().multiplyScalar(2.4).addScaledVector(side, wander);
    target.y = -0.45 + (this.opened ? 0 : Math.sin(t * 2.1) * 0.12);
    g.position.lerp(target, this.opened ? 0.02 : 0.035);
    g.rotation.y = Math.atan2(-g.position.x, -g.position.z); // front (+z) faces the player

    // tap shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      const s = 0.55 * (1 + Math.sin(this.shake * 30) * 0.12 * this.shake);
      g.scale.set(s * (1 + 0.1 * this.shake), s * (1 - 0.1 * this.shake), s);
      this.gift.body.rotation.z = Math.sin(this.shake * 40) * 0.2 * this.shake;
    }

    // glow
    const gm = this.gift.glow.material as THREE.MeshBasicMaterial;
    gm.opacity = 0.35 + Math.sin(t * 4) * 0.2;
    this.gift.glow.scale.setScalar(1.1 + ((t * 0.7) % 1) * 0.7);

    if (this.opened) {
      const lid = this.gift.lid;
      this.lidV.y -= 9 * dt;
      lid.position.addScaledVector(this.lidV, dt);
      lid.rotation.x += dt * 4;
      lid.rotation.z += dt * 2;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.v.y -= 4.5 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
