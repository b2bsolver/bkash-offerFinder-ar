import { useEffect, useRef, useState } from 'react';
import { offsetM, type LatLng } from './geo';

/** Used when GPS is unavailable/denied (Gulshan 2 circle, Dhaka). */
export const DEFAULT_POS: LatLng = { lat: 23.7925, lng: 90.4078 };

export type GeoSource = 'gps' | 'manual' | 'waiting';
export type GeoState = { pos: LatLng; accuracy: number; source: GeoSource; error?: string };

const params = new URLSearchParams(location.search);

/**
 * Player position.
 * - Real GPS via watchPosition (smoothed in the map view).
 * - `?lat=..&lng=..` forces a fixed start position (manual mode).
 * - `?walk=1` simulates walking in a slow loop (desk testing).
 * - Manual mode (no GPS / denied / forced): move with arrow keys / WASD.
 */
export function useGeolocation(enabled: boolean) {
  const forced = params.has('lat') && params.has('lng');
  const start: LatLng = forced ? { lat: +params.get('lat')!, lng: +params.get('lng')! } : DEFAULT_POS;
  const [state, setState] = useState<GeoState>({ pos: start, accuracy: 10, source: forced || params.has('walk') ? 'manual' : 'waiting' });
  const manualRef = useRef(state.source === 'manual');

  useEffect(() => {
    if (!enabled || manualRef.current) return;
    if (!('geolocation' in navigator)) {
      manualRef.current = true;
      setState((s) => ({ ...s, source: 'manual', error: 'GPS not supported — using demo location' }));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (manualRef.current) return;
        setState({ pos: { lat: p.coords.latitude, lng: p.coords.longitude }, accuracy: p.coords.accuracy, source: 'gps' });
      },
      (e) => {
        manualRef.current = true;
        setState((s) => ({ ...s, source: 'manual', error: e.code === 1 ? 'Location permission denied — using demo location' : 'No GPS fix — using demo location' }));
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  // simulated walk
  useEffect(() => {
    if (!enabled || !params.has('walk')) return;
    const c = start;
    let t = 0;
    const iv = setInterval(() => {
      t += 1;
      const a = t / 90; // ~1.4 m/s around a 130 m circle
      setState((s) => ({ ...s, pos: offsetM(c, Math.sin(a) * 130, Math.cos(a) * 130 - 130), source: 'manual', accuracy: 8 }));
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const move = (eastM: number, northM: number) => {
    manualRef.current = true;
    setState((s) => ({ ...s, pos: offsetM(s.pos, eastM, northM), source: 'manual', accuracy: 5 }));
  };

  // keyboard
  useEffect(() => {
    if (!enabled) return;
    const step = 6;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') move(0, step);
      else if (k === 'arrowdown' || k === 's') move(0, -step);
      else if (k === 'arrowleft' || k === 'a') move(-step, 0);
      else if (k === 'arrowright' || k === 'd') move(step, 0);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [enabled]);

  return { ...state, move };
}

/* ---------------- compass ---------------- */

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionAPI = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Must be called from a user gesture (iOS). Resolves true if motion events are allowed. */
export async function requestMotionPermission(): Promise<boolean> {
  const DOE = (window as unknown as { DeviceOrientationEvent?: PermissionAPI }).DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    try { return (await DOE.requestPermission()) === 'granted'; } catch { return false; }
  }
  return true;
}

/** Smoothed compass heading in degrees (0 = north), or null if unavailable. */
export function useHeading(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let h: number | null = null;
    let last = 0;
    const onOri = (e: Event) => {
      const ev = e as IOSOrientationEvent;
      let raw: number | null = null;
      if (typeof ev.webkitCompassHeading === 'number') raw = ev.webkitCompassHeading;
      else if (ev.absolute && ev.alpha != null) raw = (360 - ev.alpha) % 360;
      if (raw == null) return;
      if (h == null) h = raw;
      else {
        let d = raw - h;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        h = (h + d * 0.15 + 360) % 360; // low-pass
      }
      const now = performance.now();
      if (now - last > 80) { last = now; setHeading(h); }
    };
    const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    addEventListener(evName, onOri);
    return () => removeEventListener(evName, onOri);
  }, [enabled]);
  return heading;
}
