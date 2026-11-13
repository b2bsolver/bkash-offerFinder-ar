import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from 'maplibre-gl';
import { makeGift, type Gift } from '../gift3d';
import type { Offer } from '../offers';

type Item = { offer: Offer; gift: Gift; phase: number; inRange: boolean; caught: boolean; x: number; z: number };

/** On-screen gift height in CSS pixels (kept constant across zoom levels, like map games). */
const GIFT_PX = 54;
const GIFT_UNITS = 1.95;

/**
 * three.js gifts drawn inside the MapLibre WebGL context.
 * Local space: metres from `origin`, +x east, +y up, +z south.
 */
export class GiftLayer implements CustomLayerInterface {
  id = 'gifts-3d';
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
    this.items.forEach((it) => this.scene.remove(it.gift.group));
    this.items.clear();
  }

  private toLocal(lat: number, lng: number) {
    const m = maplibregl.MercatorCoordinate.fromLngLat({ lat, lng }, 0);
    return { x: (m.x - this.origin.x) / this.mScale, z: (m.y - this.origin.y) / this.mScale };
  }

  /** Sync the set of gifts shown on the map. */
  setOffers(offers: Offer[], caught: Set<string>, inRange: Set<string>) {
    const keep = new Set(offers.map((o) => o.id));
    for (const [id, it] of this.items) {
      if (!keep.has(id)) {
        this.scene.remove(it.gift.group);
        this.items.delete(id);
      }
    }
    for (const o of offers) {
      let it = this.items.get(o.id);
      if (!it) {
        const gift = makeGift(o.brand.initial, o.brand.color);
        const { x, z } = this.toLocal(o.lat, o.lng);
        gift.group.position.set(x, 0, z);
        this.scene.add(gift.group);
        it = { offer: o, gift, phase: Math.random() * Math.PI * 2, inRange: false, caught: false, x, z };
        this.items.set(o.id, it);
      }
      const c = caught.has(o.id);
      if (c !== it.caught) {
        it.caught = c;
        it.gift.setOpened(c);
      }
      it.inRange = inRange.has(o.id) && !c;
    }
    this.map?.triggerRepaint();
  }

  /** Smaller gifts in a small container (minimap card). */
  private sizeK() {
    return Math.min(1, Math.max(0.28, this.map.getContainer().clientWidth / 520));
  }

  /** Nearest gift to a screen point (CSS px), using projected positions. */
  pick(point: { x: number; y: number }, maxPx = 46): Offer | null {
    let best: Offer | null = null;
    let bestD = maxPx;
    for (const it of this.items.values()) {
      const p = this.map.project([it.offer.lng, it.offer.lat]);
      const cy = p.y - GIFT_PX * this.sizeK() * 0.55; // gift body sits above its ground point
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
    const base = (GIFT_PX * this.sizeK() * mpp) / GIFT_UNITS;
    const yaw = (-this.map.getBearing() * Math.PI) / 180;

    for (const it of this.items.values()) {
      const g = it.gift;
      const pulse = it.inRange ? 1.22 + Math.sin(t * 5 + it.phase) * 0.06 : 1;
      g.group.scale.setScalar(base * (it.caught ? 0.8 : pulse));
      g.body.position.y = it.caught ? 0 : 0.12 + Math.abs(Math.sin(t * 2.2 + it.phase)) * (it.inRange ? 0.45 : 0.18);
      g.body.rotation.y = yaw + (it.inRange ? Math.sin(t * 6 + it.phase) * 0.12 : 0);
      const gm = g.glow.material as THREE.MeshBasicMaterial;
      gm.opacity = it.inRange ? 0.55 + Math.sin(t * 5 + it.phase) * 0.25 : 0;
      g.glow.scale.setScalar(it.inRange ? 1.2 + ((t * 0.8 + it.phase) % 1) * 0.6 : 1);
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
