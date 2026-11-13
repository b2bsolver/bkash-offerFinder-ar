import { distanceM, offsetM, type LatLng } from './geo';

/**
 * MOCK DATA — no API is used yet. Offers are generated around the player's
 * first position so the demo works anywhere. Shape matches the planned
 * `Offer` type (plan.md §5) so real data can replace it later.
 */
export type Category = 'food' | 'fashion' | 'grocery' | 'lifestyle' | 'travel' | 'health';

export type Offer = {
  id: string;
  lat: number;
  lng: number;
  address: string;
  brand: { name: string; initial: string; color: string; tag?: string };
  offerEn: string;
  offerBn: string;
  category: Category;
  endsAt: string;
};

export const CATEGORIES: { id: Category | 'all'; en: string; bn: string; icon: string }[] = [
  { id: 'all', en: 'All', bn: 'সব', icon: '✨' },
  { id: 'food', en: 'Food', bn: 'খাবার', icon: '🍔' },
  { id: 'fashion', en: 'Fashion', bn: 'ফ্যাশন', icon: '👗' },
  { id: 'grocery', en: 'Grocery', bn: 'গ্রোসারি', icon: '🛒' },
  { id: 'lifestyle', en: 'Lifestyle', bn: 'লাইফস্টাইল', icon: '💄' },
  { id: 'health', en: 'Health', bn: 'স্বাস্থ্য', icon: '💊' },
  { id: 'travel', en: 'Travel', bn: 'ভ্রমণ', icon: '✈️' },
];

/** Fictional demo merchants (placeholders, not real partners). */
const BRANDS: { name: string; category: Category; color: string; offers: [string, string][]; tag?: string }[] = [
  { name: 'Rongdhonu Café', category: 'food', color: '#E2136E', offers: [['20% cashback', '২০% ক্যাশব্যাক'], ['Buy 1 Get 1', '১টি কিনলে ১টি ফ্রি']], tag: 'Hot Deal' },
  { name: 'Kacchi Ghor', category: 'food', color: '#C2410C', offers: [['15% instant discount', '১৫% ইনস্ট্যান্ট ছাড়']] },
  { name: 'Cha Adda', category: 'food', color: '#92400E', offers: [['৳50 cashback', '৳৫০ ক্যাশব্যাক']] },
  { name: 'Pizza Point', category: 'food', color: '#DC2626', offers: [['25% off', '২৫% ছাড়']], tag: 'New' },
  { name: 'Shada Kalo Fashion', category: 'fashion', color: '#111827', offers: [['10% cashback', '১০% ক্যাশব্যাক']] },
  { name: 'Nakshi Threads', category: 'fashion', color: '#7C3AED', offers: [['Up to 30% off', '৩০% পর্যন্ত ছাড়']], tag: 'Hot Deal' },
  { name: 'Step Up Shoes', category: 'fashion', color: '#0F766E', offers: [['৳200 off on ৳1500', '৳১৫০০-তে ৳২০০ ছাড়']] },
  { name: 'Daily Bazar', category: 'grocery', color: '#16A34A', offers: [['5% cashback', '৫% ক্যাশব্যাক']] },
  { name: 'Fresh Mart', category: 'grocery', color: '#65A30D', offers: [['৳100 cashback', '৳১০০ ক্যাশব্যাক']] },
  { name: 'Glow Beauty', category: 'lifestyle', color: '#DB2777', offers: [['20% off', '২০% ছাড়']] },
  { name: 'Gadget Ghor', category: 'lifestyle', color: '#2563EB', offers: [['0% EMI + ৳500 off', '০% ইএমআই + ৳৫০০ ছাড়']], tag: 'New' },
  { name: 'Shastho Pharmacy', category: 'health', color: '#0891B2', offers: [['10% instant discount', '১০% ইনস্ট্যান্ট ছাড়']] },
  { name: 'Shofor Tours', category: 'travel', color: '#EA580C', offers: [['৳300 off bus tickets', 'বাস টিকেটে ৳৩০০ ছাড়']] },
  { name: 'Sky Wings Travel', category: 'travel', color: '#4F46E5', offers: [['8% cashback on flights', 'ফ্লাইটে ৮% ক্যাশব্যাক']] },
];

const STREETS = ['Road 11', 'Road 27', 'Lake Road', 'Kemal Ataturk Ave', 'Station Road', 'Bazar Road', 'College Road', 'Park Lane', 'Main Road', 'Mosque Road'];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * ~40 outlets: a few very close (so the catch loop is testable immediately),
 * more within 500 m, the rest out to 2 km (visible when zooming out).
 */
export function generateOffers(origin: LatLng, seed = 7): Offer[] {
  const r = rng(seed);
  const rings: [number, number, number][] = [
    [3, 8, 30],
    [12, 60, 480],
    [12, 520, 980],
    [13, 1000, 1950],
  ];
  const out: Offer[] = [];
  let n = 0;
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21).toISOString().slice(0, 10);
  for (const [count, minR, maxR] of rings) {
    for (let i = 0; i < count; i++) {
      const b = BRANDS[Math.floor(r() * BRANDS.length)];
      const o = b.offers[Math.floor(r() * b.offers.length)];
      const a = r() * Math.PI * 2;
      const d = minR + Math.sqrt(r()) * (maxR - minR);
      const p = offsetM(origin, Math.sin(a) * d, Math.cos(a) * d);
      out.push({
        id: `o${seed}-${n++}`,
        lat: p.lat,
        lng: p.lng,
        address: `${1 + Math.floor(r() * 80)}, ${STREETS[Math.floor(r() * STREETS.length)]}`,
        brand: { name: b.name, initial: b.name[0], color: b.color, tag: b.tag },
        offerEn: o[0],
        offerBn: o[1],
        category: b.category,
        endsAt: end,
      });
    }
  }
  return out;
}

const KEY = 'bofa.origin.v1';

/** Keep the same mock world across reloads unless the player is far away. */
export function offersFor(pos: LatLng): Offer[] {
  let origin: LatLng | null = null;
  try {
    const s = localStorage.getItem(KEY);
    if (s) origin = JSON.parse(s);
  } catch { /* storage unavailable */ }
  if (!origin || distanceM(origin, pos) > 2500) {
    origin = pos;
    try { localStorage.setItem(KEY, JSON.stringify(origin)); } catch { /* ignore */ }
  }
  return generateOffers(origin);
}

export type WithDistance = Offer & { distance: number };

export function nearby(offers: Offer[], pos: LatLng, radius: number, cat: Category | 'all'): WithDistance[] {
  return offers
    .filter((o) => cat === 'all' || o.category === cat)
    .map((o) => ({ ...o, distance: distanceM(pos, o) }))
    .filter((o) => o.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

/* ---------- caught collection (local only) ---------- */
const CKEY = 'bofa.caught.v1';
export type Caught = { id: string; at: number; offer: Offer };

export function loadCaught(): Caught[] {
  try { return JSON.parse(localStorage.getItem(CKEY) || '[]'); } catch { return []; }
}
export function saveCaught(list: Caught[]) {
  try { localStorage.setItem(CKEY, JSON.stringify(list)); } catch { /* ignore */ }
}
