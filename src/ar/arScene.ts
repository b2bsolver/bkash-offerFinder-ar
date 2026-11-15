import * as THREE from 'three';
import { makeLogoSign, LOGO_UNITS, type LogoSign } from '../logo3d';
import { bn, type LatLng } from '../geo';
import type { WithDistance, Offer } from '../offers';

/** Labels of shops beyond 250 m are drawn a bit smaller. */
const FAR_SCALE = 0.85;

/** How the AR camera is oriented. */
export type LookMode = 'compass' | 'relative' | 'drag';

type Item = {
  offer: WithDistance;
  sign: LogoSign;
  label: HTMLButtonElement;
  txt: HTMLElement;
  phase: number;
  lastText: string;
  lw: number;
  lh: number;
};

type Placed = { it: Item; d: number; sx: number; sy: number; edge: '' | 'left' | 'right' };

type Callbacks = {
  onTap: (o: Offer) => void;
  /** Look direction (deg, 0 = north, clockwise); throttled. */
  onLook: (heading: number) => void;
  onMode: (m: LookMode) => void;
};

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };

const M_PER_DEG = 111320;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Location-based AR home view.
 *
 * World frame: camera at the origin (eye height), +X = east, −Z = north, +Y = up.
 * Every offer within range is placed at its real compass bearing from the player.
 * Distances are compressed (500 m → ~42 units) and logo signs keep a minimum on-screen
 * size so far shops stay visible; HTML labels show name + real distance.
 *
 * Orientation:
 * - Android: `deviceorientationabsolute` (alpha is already relative to north).
 * - iOS: relative `deviceorientation` + `webkitCompassHeading` → smoothed north offset.
 * - No sensors (desktop): drag to look; starts facing the nearest shop.
 */
export class ArScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private items = new Map<string, Item>();
  private raf = 0;
  private running = true;
  private t0 = performance.now();
  private ori: { a: number; b: number; g: number } | null = null;
  private northOffset: number | null = null; // deg added to alpha (iOS)
  private gotAbsolute = false;
  private mode: LookMode = 'drag';
  private drag = { yaw: 0, pitch: -0.05 };
  private aimed = false;
  private target: LatLng | null = null;
  private shown: LatLng | null = null;
  private lastLook = { t: 0, h: -999 };
  private disposers: (() => void)[] = [];
  private ray = new THREE.Raycaster();
  private host: HTMLElement;
  private labels: HTMLElement;
  private cb: Callbacks;
  private tmp = new THREE.Vector3();

  constructor(host: HTMLElement, labels: HTMLElement, cb: Callbacks) {
    this.host = host;
    this.labels = labels;
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1, 2, 1.5);
    this.scene.add(sun);

    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.disposers.push(() => ro.disconnect());

    this.listenOrientation();
    this.listenPointer();
    cb.onMode(this.mode);
    this.loop();
  }

  /* ---------------- inputs ---------------- */

  private listenOrientation() {
    const handle = (e: Event, absEvent: boolean) => {
      const ev = e as IOSOrientationEvent;
      if (ev.alpha == null || ev.beta == null || ev.gamma == null) return;
      if (absEvent) this.gotAbsolute = true;
      else if (this.gotAbsolute) return; // Android fires both; prefer the absolute one
      this.ori = { a: ev.alpha, b: ev.beta, g: ev.gamma };
      let mode: LookMode = 'relative';
      if (absEvent || ev.absolute === true) {
        this.northOffset = 0;
        mode = 'compass';
      } else if (typeof ev.webkitCompassHeading === 'number' && (ev.webkitCompassAccuracy ?? 0) >= 0) {
        const est = 360 - ev.webkitCompassHeading - ev.alpha;
        this.northOffset = this.northOffset == null ? est : this.northOffset + wrap180(est - this.northOffset) * 0.05;
        mode = 'compass';
      }
      if (mode !== this.mode) {
        this.mode = mode;
        this.cb.onMode(mode);
      }
    };
    const onAbs = (e: Event) => handle(e, true);
    const onRel = (e: Event) => handle(e, false);
    if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', onAbs);
    addEventListener('deviceorientation', onRel);
    this.disposers.push(() => {
      removeEventListener('deviceorientationabsolute', onAbs);
      removeEventListener('deviceorientation', onRel);
    });
  }

  private listenPointer() {
    const el = this.renderer.domElement;
    let last: { x: number; y: number; moved: number } | null = null;
    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      last = { x: e.clientX, y: e.clientY, moved: 0 };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!last || !e.isPrimary) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last.moved += Math.abs(dx) + Math.abs(dy);
      if (!this.ori) {
        this.drag.yaw -= dx * 0.005;
        this.drag.pitch = THREE.MathUtils.clamp(this.drag.pitch - dy * 0.004, -1.2, 1.2);
      }
      last.x = e.clientX;
      last.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (last && last.moved < 10) this.tap(e.clientX, e.clientY);
      last = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // desktop: Q / E also turn
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'q') this.drag.yaw += 0.12;
      else if (k === 'e') this.drag.yaw -= 0.12;
    };
    addEventListener('keydown', onKey);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      removeEventListener('keydown', onKey);
    });
  }

  private tap(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const bodies = [...this.items.values()].filter((it) => it.sign.group.visible).map((it) => it.sign.body);
    const hit = this.ray.intersectObjects(bodies, true)[0];
    if (!hit) return;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.offerId) o = o.parent;
    const it = o && this.items.get(o.userData.offerId as string);
    if (it) this.cb.onTap(it.offer);
  }

  /* ---------------- public API ---------------- */

  setPos(p: LatLng) {
    this.target = { ...p };
    if (!this.shown) this.shown = { ...p };
  }

  setOffers(list: WithDistance[]) {
    const keep = new Set(list.map((o) => o.id));
    for (const [id, it] of this.items) {
      if (keep.has(id)) continue;
      this.scene.remove(it.sign.group); // geometry / materials are shared (logo3d.ts)
      it.label.remove();
      this.items.delete(id);
    }
    for (const o of list) {
      let it = this.items.get(o.id);
      if (!it) {
        const sign = makeLogoSign(o.brand);
        sign.body.userData.offerId = o.id;
        this.scene.add(sign.group);
        const label = document.createElement('button');
        label.className = 'ar-label';
        const dot = document.createElement('span');
        dot.className = 'ar-dot';
        if (o.brand.logo) {
          dot.classList.add('logo');
          const img = document.createElement('img');
          img.src = o.brand.logo;
          img.alt = '';
          dot.append(img);
        } else {
          dot.style.background = o.brand.color;
          dot.textContent = o.brand.initial;
        }
        const txt = document.createElement('span');
        txt.className = 'ar-txt';
        label.append(dot, txt);
        label.addEventListener('click', () => {
          const cur = this.items.get(o.id);
          if (cur) this.cb.onTap(cur.offer);
        });
        this.labels.appendChild(label);
        it = { offer: o, sign, label, txt, phase: Math.random() * Math.PI * 2, lastText: '', lw: 0, lh: 0 };
        this.items.set(o.id, it);
      }
      it.offer = o;
    }
  }

  setRunning(on: boolean) {
    if (on === this.running) return;
    this.running = on;
    cancelAnimationFrame(this.raf);
    if (on) this.loop();
  }

  /* ---------------- frame ---------------- */

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
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
    const alpha = this.ori.a + (this.northOffset ?? 0);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d(this.ori.b), d(alpha), -d(this.ori.g), 'YXZ'));
    q.multiply(new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)); // camera looks out the back of the device
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle));
    this.camera.quaternion.slerp(q, 0.3);
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const t = (performance.now() - this.t0) / 1000;

    // smooth player position (GPS jitter)
    if (this.target && this.shown) {
      this.shown.lat += (this.target.lat - this.shown.lat) * 0.06;
      this.shown.lng += (this.target.lng - this.shown.lng) * 0.06;
    }
    const me = this.shown;

    // desktop: start facing the nearest shop
    if (!this.aimed && !this.ori && me && this.items.size) {
      const near = [...this.items.values()].sort((a, b) => a.offer.distance - b.offer.distance)[0].offer;
      const e = (near.lng - me.lng) * M_PER_DEG * Math.cos((me.lat * Math.PI) / 180);
      const n = (near.lat - me.lat) * M_PER_DEG;
      this.drag.yaw = Math.atan2(-e, n);
      this.aimed = true;
    }
    this.applyOrientation();
    this.camera.updateMatrixWorld();

    // look heading for the minimap / HUD
    const f = this.tmp.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const heading = ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
    const now = performance.now();
    if (now - this.lastLook.t > 100 && Math.abs(wrap180(heading - this.lastLook.h)) > 0.8) {
      this.lastLook = { t: now, h: heading };
      this.cb.onLook(heading);
    }

    const w = this.host.clientWidth, h = this.host.clientHeight;
    let nearest: Item | null = null;
    for (const it of this.items.values()) if (!nearest || it.offer.distance < nearest.offer.distance) nearest = it;
    const placed: Placed[] = [];

    for (const it of this.items.values()) {
      const g = it.sign.group;
      if (!me) { g.visible = false; it.label.style.display = 'none'; continue; }
      const e = (it.offer.lng - me.lng) * M_PER_DEG * Math.cos((me.lat * Math.PI) / 180);
      const n = (it.offer.lat - me.lat) * M_PER_DEG;
      const d = Math.max(0.5, Math.hypot(e, n));
      // compressed display distance + minimum angular size
      const D = d < 8 ? Math.max(d, 3) : 8 + (d - 8) * 0.07;
      const ang = 0.085 / (1 + d / 40) + 0.028;
      const s = D * ang * 1.6; // bigger than the old gift so the logo stays readable
      const x = (e / d) * D, z = -(n / d) * D;
      const bob = Math.sin(t * 1.6 + it.phase) * s * 0.05;
      const y = -D * (0.2 / (1 + d / 25)) - s * 0.45;
      g.visible = true;
      g.position.set(x, y, z);
      g.scale.setScalar(s);
      // logo always faces the viewer, with a gentle float
      g.rotation.y = Math.atan2(-x, -z);
      it.sign.body.position.y = bob / s;

      // ---- label ----
      const p = this.tmp.set(x, y + bob + s * (LOGO_UNITS + 0.2), z).applyMatrix4(this.camera.matrixWorldInverse);
      const inFront = p.z < -0.1;
      p.applyMatrix4(this.camera.projectionMatrix);
      let sx = ((p.x + 1) / 2) * w, sy = ((1 - p.y) / 2) * h;
      const onScreen = inFront && sx > -40 && sx < w + 40 && sy > -40 && sy < h + 40;
      const edge = !onScreen && it === nearest;
      const text = edge
        ? `${bn(Math.round(d))} মি`
        : `<b>${esc(it.offer.brand.name)}</b><small>${esc(it.offer.offerBn)} · ${bn(Math.round(d))} মি</small>`;
      if (text !== it.lastText) {
        it.txt.innerHTML = text;
        it.lastText = text;
        it.lw = 0; // re-measure
      }
      if (!onScreen && !edge) { it.label.style.display = 'none'; continue; }
      it.label.style.display = '';
      let side: Placed['edge'] = '';
      if (edge) {
        // camera-space x decides which side (behind → nearest side)
        const cam = this.tmp.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
        side = cam.x >= 0 ? 'right' : 'left';
        sx = side === 'right' ? w - 8 : 8;
        sy = THREE.MathUtils.clamp(inFront ? sy : h * 0.5, 180, h - 210);
        it.label.className = `ar-label edge ${side}`;
      } else {
        it.label.className = `ar-label${d > 250 ? ' far' : ''}`;
      }
      if (!it.lw) { it.lw = it.label.offsetWidth; it.lh = it.label.offsetHeight; }
      placed.push({ it, d, sx, sy, edge: side });
    }

    // ---- de-overlap labels: nearest keeps its spot, others are pushed up ----
    placed.sort((a, b) => a.d - b.d);
    const rects: { l: number; t: number; r: number; b: number }[] = [];
    const rectOf = (p: Placed, sy: number) => {
      const k = p.d > 250 && !p.edge ? FAR_SCALE : 1;
      const lw = p.it.lw * k, lh = p.it.lh * k;
      if (p.edge === 'right') return { l: p.sx - lw, t: sy - lh / 2, r: p.sx, b: sy + lh / 2 };
      if (p.edge === 'left') return { l: p.sx, t: sy - lh / 2, r: p.sx + lw, b: sy + lh / 2 };
      return { l: p.sx - lw / 2, t: sy - lh, r: p.sx + lw / 2, b: sy };
    };
    for (const p of placed) {
      if (!p.edge) p.sx = THREE.MathUtils.clamp(p.sx, p.it.lw / 2 + 6, w - p.it.lw / 2 - 6); // keep inside the screen
      let sy = p.sy;
      for (let k = 0; k < 10; k++) {
        const rc = rectOf(p, sy);
        const hit = rects.find((o) => rc.l < o.r && rc.r > o.l && rc.t < o.b + 3 && rc.b > o.t - 3);
        if (!hit) break;
        sy -= rc.b - hit.t + 4;
      }
      rects.push(rectOf(p, sy));
      // scale lives in the transform (after the translate) so it shrinks the pill around its anchor, not its screen position
      const far = p.d > 250 && !p.edge ? ` scale(${FAR_SCALE})` : '';
      p.it.label.style.transform = `translate(${p.sx.toFixed(1)}px, ${sy.toFixed(1)}px)${far}`;
      p.it.label.style.zIndex = String(p.edge ? 2000 : 1000 - Math.round(p.d));
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    for (const it of this.items.values()) it.label.remove();
    this.items.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
