import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
import 'maplibre-gl/dist/maplibre-gl.css';
import { circleRing, type LatLng } from '../geo';
import type { Offer } from '../offers';
import { LogoLayer } from './logoLayer';

type Props = {
  pos: LatLng;
  viewRadius: number;
  heading: number | null;
  followCompass: boolean;
  offers: Offer[];
  onTapOffer: (o: Offer) => void;
  onZoomStep: (dir: 1 | -1) => void;
};

const PITCH = 58;
const params = new URLSearchParams(location.search);

/** Free vector tiles, no API key. `?offline=1` or a failed load → plain pink ground. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#fbe1ec' } }],
};

async function loadStyle(): Promise<StyleSpecification> {
  if (params.has('offline')) return OFFLINE_STYLE;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(STYLE_URL, { signal: ctl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error(String(res.status));
    return bkashify(await res.json());
  } catch {
    return OFFLINE_STYLE;
  }
}

/** Recolour a generic vector style into bKash pinks (remittance-ar palette). */
function bkashify(style: StyleSpecification): StyleSpecification {
  const set = (l: Record<string, unknown>, k: string, v: unknown) => {
    l.paint = { ...((l.paint as object) || {}), [k]: v };
  };
  const layers = style.layers.filter((l) => !/poi|housenum|aeroway|shield/.test(l.id));
  for (const l of layers as unknown as Record<string, unknown>[]) {
    const id = String(l.id);
    const type = l.type;
    if (type === 'background') set(l, 'background-color', '#fbe3ee');
    else if (type === 'fill' && /water/.test(id)) set(l, 'fill-color', '#c9e6f2');
    else if (type === 'fill' && /park|landcover|grass|wood|forest|landuse/.test(id)) set(l, 'fill-color', '#f3d6e3');
    else if (type === 'fill' && /building/.test(id)) set(l, 'fill-color', '#f6c7db');
    else if (type === 'line' && /water|river/.test(id)) set(l, 'line-color', '#c9e6f2');
    else if (type === 'line' && /road|highway|street|bridge|tunnel|path|transportation/.test(id)) set(l, 'line-color', /casing/.test(id) ? '#f3b5cf' : '#ffffff');
    else if (type === 'line' && /boundary/.test(id)) set(l, 'line-color', '#e9a3c3');
    else if (type === 'symbol') {
      set(l, 'text-color', '#7d3556');
      set(l, 'text-halo-color', '#fff5f9');
    }
  }
  const src = Object.keys(style.sources).find((k) => (style.sources[k] as { type: string }).type === 'vector');
  if (src) {
    const firstSymbol = layers.findIndex((l) => l.type === 'symbol');
    const ext = {
      id: 'bkash-buildings-3d',
      type: 'fill-extrusion',
      source: src,
      'source-layer': 'building',
      minzoom: 14.5,
      paint: {
        'fill-extrusion-color': '#f4bcd4',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.75,
      },
    } as unknown as StyleSpecification['layers'][number];
    layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, ext);
  }
  return { ...style, layers };
}

/**
 * Warm the browser's HTTP cache with the zoom-14 tiles around `c`.
 * The minimap renders z13 tiles; full screen switches to z14 (much heavier in dense
 * areas + 3D buildings), so without this the full map waits on a fresh download.
 * Tiles are immutable (`max-age` 10 years), so the map worker's later fetch hits the cache.
 */
const warmed = new Set<string>();
async function prefetchTiles(style: StyleSpecification, c: LatLng) {
  const src = Object.values(style.sources).find((s) => s.type === 'vector') as { url?: string } | undefined;
  if (!src?.url) return;
  try {
    const tpl: string | undefined = (await fetch(src.url).then((r) => r.json())).tiles?.[0];
    if (!tpl) return;
    const z = 14, n = 2 ** z;
    const cx = Math.floor(((c.lng + 180) / 360) * n);
    const r = (c.lat * Math.PI) / 180;
    const cy = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    // centre first, then the 8 neighbours (a z14 tile is ~2 km wide here)
    const order = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dy] of order) {
      const url = tpl.replace('{z}', String(z)).replace('{x}', String(cx + dx)).replace('{y}', String(cy + dy));
      if (warmed.has(url)) continue;
      warmed.add(url);
      await fetch(url, { priority: 'low' } as RequestInit).then((res) => res.arrayBuffer()).catch(() => warmed.delete(url));
    }
  } catch { /* offline: the map just loads on demand */ }
}

/** Zoom so that `radius` metres fits in the shorter half-screen. */
function zoomFor(radius: number, lat: number, el: HTMLElement) {
  const half = Math.min(el.clientWidth, el.clientHeight) * 0.46;
  return Math.log2((40075016.686 * Math.cos((lat * Math.PI) / 180) * half) / (512 * radius));
}

const circle = (c: LatLng, r: number) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'Polygon' as const, coordinates: [circleRing(c, r)] },
});

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layerRef = useRef<LogoLayer | null>(null);
  const avatarRef = useRef<maplibregl.Marker | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const props = useRef(p);
  props.current = p;
  const shown = useRef<LatLng>(p.pos);
  const bearing = useRef(0);
  const ready = useRef(false);

  // create map once
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    (async () => {
      const style = await loadStyle();
      if (disposed || !el.current) return;
      const start = props.current.pos;
      const map = new maplibregl.Map({
        container: el.current,
        style,
        center: [start.lng, start.lat],
        zoom: zoomFor(props.current.viewRadius, start.lat, el.current),
        pitch: PITCH,
        maxPitch: 70,
        interactive: false,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      });
      mapRef.current = map;

      const av = document.createElement('div');
      av.className = 'avatar';
      av.innerHTML = '<div class="avatar-arrow"></div><div class="avatar-bird"></div><div class="avatar-shadow"></div>';
      arrowRef.current = av.querySelector('.avatar-arrow');
      // subpixel: no 1 px snapping while the follow camera moves the map by fractions of a pixel
      avatarRef.current = new maplibregl.Marker({ element: av, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport', subpixelPositioning: true })
        .setLngLat([start.lng, start.lat])
        .addTo(map);

      map.on('load', () => {
        map.addSource('view', { type: 'geojson', data: circle(start, props.current.viewRadius) });
        map.addLayer({ id: 'view-line', type: 'line', source: 'view', paint: { 'line-color': '#e2136e', 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [2, 2] } });
        const layer = new LogoLayer(start);
        layerRef.current = layer;
        map.addLayer(layer);
        ready.current = true;
        layer.setOffers(props.current.offers);
        // once the minimap has its own tiles, quietly fetch what the full map will need
        map.once('idle', () => {
          const go = () => prefetchTiles(style, shown.current);
          if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 3000 });
          else setTimeout(go, 1000);
        });
      });

      // ---- follow loop: smooth position, zoom, bearing ----
      let frame = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const cur = props.current;
        const s = shown.current;
        s.lat += (cur.pos.lat - s.lat) * 0.08;
        s.lng += (cur.pos.lng - s.lng) * 0.08;
        if (cur.followCompass && cur.heading != null) {
          let d = cur.heading - bearing.current;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          // dead-band ignores compass noise; ease harder for big turns
          const ad = Math.abs(d);
          if (ad > 1.5) bearing.current = (bearing.current + d * (ad > 20 ? 0.12 : 0.06) + 360) % 360;
        }
        const targetZoom = zoomFor(cur.viewRadius, s.lat, map.getContainer());
        const z = map.getZoom() + (targetZoom - map.getZoom()) * 0.12;
        map.jumpTo({ center: [s.lng, s.lat], zoom: z, bearing: bearing.current, pitch: PITCH });
        avatarRef.current?.setLngLat([s.lng, s.lat]);
        if (arrowRef.current) {
          arrowRef.current.style.display = cur.heading == null ? 'none' : 'block';
          if (cur.heading != null) arrowRef.current.style.transform = `translateX(-50%) rotateX(${PITCH}deg) rotate(${cur.heading - bearing.current}deg)`;
        }
        if (ready.current && frame++ % 4 === 0) {
          (map.getSource('view') as maplibregl.GeoJSONSource)?.setData(circle(s, cur.viewRadius));
        }
      };
      tick();
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      mapRef.current?.remove();
      mapRef.current = null;
      ready.current = false;
    };
  }, []);

  // container size changes (minimap ⇄ full screen): let MapLibre re-render at the new size
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // sync logo signs
  useEffect(() => {
    if (ready.current) layerRef.current?.setOffers(p.offers);
  }, [p.offers]);

  // gestures: tap = pick logo, horizontal drag = rotate (when not following compass), pinch / wheel = zoom level
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let down: { x: number; y: number; b: number; moved: boolean } | null = null;
    let pinch0 = 0;
    let pinchDone = false;

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, b: bearing.current, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!down || !e.isPrimary) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 8 || Math.abs(e.clientY - down.y) > 8) down.moved = true;
      if (down.moved && !props.current.followCompass) bearing.current = (down.b - dx * 0.35 + 360) % 360;
    };
    const onUp = (e: PointerEvent) => {
      if (!down || !e.isPrimary) return;
      const wasTap = !down.moved;
      down = null;
      if (!wasTap || !layerRef.current) return;
      const r = node.getBoundingClientRect();
      const o = layerRef.current.pick({ x: e.clientX - r.left, y: e.clientY - r.top });
      if (o) props.current.onTapOffer(o);
    };
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch0 = dist(e.touches);
        pinchDone = false;
        down = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinchDone || !pinch0) return;
      const ratio = dist(e.touches) / pinch0;
      if (ratio > 1.3) { props.current.onZoomStep(1); pinchDone = true; }
      else if (ratio < 0.77) { props.current.onZoomStep(-1); pinchDone = true; }
    };
    let wheelLock = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock) return;
      wheelLock = now + 450;
      props.current.onZoomStep(e.deltaY > 0 ? -1 : 1);
    };
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: true });
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  return <div ref={el} className="map" />;
}
