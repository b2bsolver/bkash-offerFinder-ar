import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from 'maplibre-gl';
import { LOGO_UNITS, makeLogoSign, type LogoSign } from '../logo3d';
import type { Offer } from '../offers';

type Item = { offer: Offer; sign: LogoSign; phase: number };

/** On-screen sign height in CSS pixels (kept constant across zoom levels). */
const SIGN_PX = 58;

/**
 * three.js brand logo signs drawn inside the MapLibre WebGL context.
 * The plates turn with the map bearing so the logo always faces the screen.
 * Local space: metres from `origin`, +x east, +y up, +z south.
 */
export class LogoLayer implements CustomLayerInterface {
  id = 'logos-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private map!: MLMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private items = new Map<string, Item>();
  private origin: maplibregl.MercatorCoordinate;
  private originLL: maplibregl.LngLat;
  private mScale: number;
  private t0 = performance.now();

  constructor(origin: { lat: number; lng: number }) {
    this.originLL = new maplibregl.LngLat(origin.lng, origin.lat);
    this.origin = maplibregl.MercatorCoordinate.fromLngLat(this.originLL, 0);
    this.mScale = this.origin.meterInMercatorCoordinateUnits();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-0.5, 1, 0.8);
    this.scene.add(sun);
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  onRemove() {
    this.items.forEach((it) => this.scene.remove(it.sign.group));
    this.items.clear();
  }

  private toLocal(lat: number, lng: number) {
    const m = maplibregl.MercatorCoordinate.fromLngLat({ lat, lng }, 0);
    return { x: (m.x - this.origin.x) / this.mScale, z: (m.y - this.origin.y) / this.mScale };
  }

  /** Sync the set of logo signs shown on the map. */
  setOffers(offers: Offer[]) {
    const keep = new Set(offers.map((o) => o.id));
    for (const [id, it] of this.items) {
      if (!keep.has(id)) {
        this.scene.remove(it.sign.group);
        this.items.delete(id);
      }
    }
    for (const o of offers) {
      if (this.items.has(o.id)) continue;
      const sign = makeLogoSign(o.brand);
      const { x, z } = this.toLocal(o.lat, o.lng);
      sign.group.position.set(x, 0, z);
      this.scene.add(sign.group);
      this.items.set(o.id, { offer: o, sign, phase: Math.random() * Math.PI * 2 });
    }
    this.map?.triggerRepaint();
  }

  /** Smaller signs in a small container (minimap card). */
  private sizeK() {
    return Math.min(1, Math.max(0.28, this.map.getContainer().clientWidth / 520));
  }

  /** Nearest sign to a screen point (CSS px), using projected positions. */
  pick(point: { x: number; y: number }, maxPx = 46): Offer | null {
    let best: Offer | null = null;
    let bestD = maxPx;
    for (const it of this.items.values()) {
      const p = this.map.project([it.offer.lng, it.offer.lat]);
      const cy = p.y - SIGN_PX * this.sizeK() * 0.6; // logo plate sits above its ground point
      const d = Math.hypot(point.x - p.x, point.y - cy);
      if (d < bestD) {
        bestD = d;
        best = it.offer;
      }
    }
    return best;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, opts: CustomRenderMethodInput) {
    const t = (performance.now() - this.t0) / 1000;
    const zoom = this.map.getZoom();
    const lat = this.map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
    const base = (SIGN_PX * this.sizeK() * mpp) / LOGO_UNITS;
    const yaw = (-this.map.getBearing() * Math.PI) / 180;

    for (const it of this.items.values()) {
      const g = it.sign;
      g.group.scale.setScalar(base);
      g.body.position.y = 0.08 + Math.sin(t * 1.6 + it.phase) * 0.06;
      g.body.rotation.y = yaw;
    }

    const m = new THREE.Matrix4().fromArray(opts.defaultProjectionData.mainMatrix as unknown as number[]);
    const l = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(this.mScale, -this.mScale, this.mScale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix = m.multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}
