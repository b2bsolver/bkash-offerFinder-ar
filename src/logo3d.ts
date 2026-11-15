import * as THREE from 'three';
import type { Offer } from './offers';

export const PINK = 0xe2136e;

type Brand = Offer['brand'];

/* ---------------- logo texture ---------------- */

const SIZE = 512;
const texCache = new Map<string, THREE.CanvasTexture>();

/** Drawn stand-in when a brand has no logo image (or it fails to load). */
function drawFallback(g: CanvasRenderingContext2D, b: Brand) {
  g.fillStyle = b.color;
  g.beginPath();
  g.arc(SIZE / 2, 200, 150, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 190px "Anek", "Hind Siliguri", system-ui, sans-serif';
  g.fillText(b.initial, SIZE / 2, 214);
  g.fillStyle = '#3a1027';
  let px = 62;
  g.font = `700 ${px}px "Hind Siliguri", system-ui, sans-serif`;
  while (px > 34 && g.measureText(b.name).width > SIZE - 40) {
    px -= 4;
    g.font = `700 ${px}px "Hind Siliguri", system-ui, sans-serif`;
  }
  g.fillText(b.name, SIZE / 2, 425, SIZE - 40);
}

/** Logo contained in a white square, like a shop sign. */
function drawImage(g: CanvasRenderingContext2D, img: HTMLImageElement) {
  const pad = 36;
  const k = Math.min((SIZE - pad * 2) / img.width, (SIZE - pad * 2) / img.height);
  const w = img.width * k, h = img.height * k;
  g.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
}

/**
 * Brand logo texture, shared per brand. Starts with the drawn fallback and
 * swaps in `brand.logo` once the image loads (needs CORS for remote URLs).
 */
export function logoTexture(b: Brand): THREE.CanvasTexture {
  const key = b.logo || `${b.name}|${b.color}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const paint = (img?: HTMLImageElement) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, SIZE, SIZE);
    if (img) drawImage(g, img);
    else drawFallback(g, b);
  };
  paint();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  if (b.logo) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      paint(img);
      t.needsUpdate = true;
    };
    img.src = b.logo;
  }
  // fonts may arrive after the first paint
  else document.fonts?.ready.then(() => { paint(); t.needsUpdate = true; });
  return t;
}

/* ---------------- 3D sign ---------------- */

function roundedSquare(s: number, r: number) {
  const h = s / 2, p = new THREE.Shape();
  p.moveTo(-h + r, -h);
  p.lineTo(h - r, -h);
  p.quadraticCurveTo(h, -h, h, -h + r);
  p.lineTo(h, h - r);
  p.quadraticCurveTo(h, h, h - r, h);
  p.lineTo(-h + r, h);
  p.quadraticCurveTo(-h, h, -h, h - r);
  p.lineTo(-h, -h + r);
  p.quadraticCurveTo(-h, -h, -h + r, -h);
  return p;
}

const PLATE = 1.3;
const PLATE_Y = 1.0;
/** Sign height (ground → top of plate), for callers that size it on screen. */
export const LOGO_UNITS = PLATE_Y + PLATE / 2;

// shared by every sign → nothing per instance to dispose
const plateGeo = new THREE.ExtrudeGeometry(roundedSquare(PLATE, 0.16), { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04);
const faceGeo = new THREE.PlaneGeometry(PLATE * 0.88, PLATE * 0.88);
const pinGeo = new THREE.ConeGeometry(0.14, PLATE_Y - PLATE / 2, 16).rotateX(Math.PI).translate(0, (PLATE_Y - PLATE / 2) / 2, 0);
const shadowGeo = new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2).translate(0, 0.01, 0);
const plateMats = [new THREE.MeshLambertMaterial({ color: 0xffffff }), new THREE.MeshLambertMaterial({ color: PINK })];
const pinMat = new THREE.MeshLambertMaterial({ color: PINK });
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x3a1027, transparent: true, opacity: 0.22, depthWrite: false });
const faceMats = new Map<THREE.Texture, THREE.MeshBasicMaterial>();

export type LogoSign = {
  /** Positioned at the outlet's ground point. */
  group: THREE.Group;
  /** The sign itself (plate + pin): rotate to face the viewer, hit-test against it. */
  body: THREE.Group;
};

/**
 * Brand logo sign: rounded white plate with a pink edge, the logo on both
 * faces, on a short pin. ~1.3 units wide, base at y = 0, height LOGO_UNITS.
 * The plate faces +Z.
 */
export function makeLogoSign(b: Brand): LogoSign {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const tex = logoTexture(b);
  let faceMat = faceMats.get(tex);
  if (!faceMat) {
    faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    faceMats.set(tex, faceMat);
  }

  const plate = new THREE.Group();
  plate.position.y = PLATE_Y;
  const front = new THREE.Mesh(faceGeo, faceMat);
  front.position.z = 0.042;
  const back = front.clone();
  back.position.z = -0.042;
  back.rotation.y = Math.PI;
  plate.add(new THREE.Mesh(plateGeo, plateMats), front, back);

  body.add(plate, new THREE.Mesh(pinGeo, pinMat));
  group.add(new THREE.Mesh(shadowGeo, shadowMat));
  return { group, body };
}
