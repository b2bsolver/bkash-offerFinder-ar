export type LatLng = { lat: number; lng: number };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a → b in degrees (0 = north, clockwise). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Move a point by metres east / north (fine for < a few km). */
export function offsetM(p: LatLng, eastM: number, northM: number): LatLng {
  return {
    lat: p.lat + (northM / R) * (180 / Math.PI),
    lng: p.lng + (eastM / (R * Math.cos(rad(p.lat)))) * (180 / Math.PI),
  };
}

/** Polygon ring approximating a circle, as [lng, lat] pairs. */
export function circleRing(c: LatLng, radiusM: number, steps = 72): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = offsetM(c, Math.sin(a) * radiusM, Math.cos(a) * radiusM);
    ring.push([p.lng, p.lat]);
  }
  return ring;
}

export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassName = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bn = (s: string | number) => String(s).replace(/\d/g, (d) => BN_DIGITS[+d]);
