import * as THREE from 'three';

export const PINK = 0xe2136e;
export const DEEP = 0x9e0b4d;
export const GOLD = 0xffc74a;

const labelCache = new Map<string, THREE.CanvasTexture>();

/** Round brand badge (initial on brand colour, gold rim). */
export function badgeTexture(initial: string, color: string): THREE.CanvasTexture {
  const key = initial + color;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fillStyle = '#ffd34d';
  g.fill();
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.fillStyle = '#fff';
  g.font = '800 132px "Anek", "Hind Siliguri", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(initial, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  labelCache.set(key, t);
  return t;
}

export type Gift = {
  group: THREE.Group;
  body: THREE.Group;
  lid: THREE.Group;
  badge: THREE.Mesh;
  glow: THREE.Mesh;
  setOpened: (opened: boolean) => void;
};

/**
 * bKash gift box, ~1 unit wide, base at y = 0, total height ≈ 1.9 (with badge).
 * `badge` should be turned to face the viewer by the caller.
 */
export function makeGift(initial: string, color: string): Gift {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const pink = new THREE.MeshLambertMaterial({ color: PINK });
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const gold = new THREE.MeshLambertMaterial({ color: GOLD, emissive: 0x553300 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 0.78, 1), pink);
  box.position.y = 0.39;
  body.add(box);
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 1.02), white);
  r1.position.y = 0.39;
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.8, 0.2), white);
  r2.position.y = 0.39;
  body.add(r1, r2);

  const lid = new THREE.Group();
  lid.position.y = 0.78;
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 1.1), pink);
  lidBox.position.y = 0.11;
  const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 1.12), white);
  l1.position.y = 0.11;
  const l2 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.24, 0.2), white);
  l2.position.y = 0.11;
  const bowGeo = new THREE.TorusGeometry(0.17, 0.06, 8, 20);
  const bowL = new THREE.Mesh(bowGeo, white);
  bowL.position.set(-0.16, 0.34, 0);
  bowL.rotation.set(0, Math.PI / 2, Math.PI / 4);
  const bowR = bowL.clone();
  bowR.position.x = 0.16;
  bowR.rotation.z = -Math.PI / 4;
  lid.add(lidBox, l1, l2, bowL, bowR);
  body.add(lid);

  const badge = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 40),
    new THREE.MeshBasicMaterial({ map: badgeTexture(initial, color), transparent: true, side: THREE.DoubleSide }),
  );
  badge.position.y = 1.55;
  body.add(badge);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 40), gold);
  badge.add(rim);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.05, 48),
    new THREE.MeshBasicMaterial({ color: 0xff5aa5, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  group.add(glow);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 32),
    new THREE.MeshBasicMaterial({ color: 0x3a1027, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow);

  const setOpened = (opened: boolean) => {
    lid.visible = !opened;
    pink.color.setHex(opened ? 0xd9b3c4 : PINK);
    (badge.material as THREE.MeshBasicMaterial).opacity = opened ? 0.45 : 1;
  };

  return { group, body, lid, badge, glow, setOpened };
}

/** Flat gold coin for burst effects. */
export function makeCoin(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.03, 20),
    new THREE.MeshLambertMaterial({ color: GOLD, emissive: 0x664400 }),
  );
}
