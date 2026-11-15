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
  /** `logo`: image URL (dummy SVGs in /img/logos for now; later the backend's `logo_url`). */
  brand: { name: string; initial: string; color: string; logo?: string; tag?: string };
  /** Wide campaign banner (1200×525 in the backend; `campaigns.banner_url` later). Shown on the details card. */
  banner?: string;
  offerEn: string;
  offerBn: string;
  category: Category;
  /** ISO timestamp (end of day, Dhaka time), like the backend's campaign `end_date`. */
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

/** Fictional demo merchants (placeholders, not real partners). Logos: public/img/logos/<slug>.svg */
/** `days`: this brand's deal ends sooner than the campaign (so countdowns differ in the demo). */
const BRANDS: { name: string; banner?: number; category: Category; color: string; offers: [string, string][]; tag?: string; days?: number }[] = [
  { name: 'Rongdhonu Café', banner: 6, category: 'food', color: '#E2136E', offers: [['20% cashback', '২০% ক্যাশব্যাক'], ['Buy 1 Get 1', '১টি কিনলে ১টি ফ্রি']], tag: 'Hot Deal', days: 1 },
  { name: 'Kacchi Ghor', banner: 3, category: 'food', color: '#C2410C', offers: [['15% instant discount', '১৫% ইনস্ট্যান্ট ছাড়']] },
  { name: 'Cha Adda', banner: 6, category: 'food', color: '#92400E', offers: [['৳50 cashback', '৳৫০ ক্যাশব্যাক']] },
  { name: 'Pizza Point', banner: 3, category: 'food', color: '#DC2626', offers: [['25% off', '২৫% ছাড়']], tag: 'New', days: 9 },
  { name: 'Shada Kalo Fashion', banner: 1, category: 'fashion', color: '#111827', offers: [['10% cashback', '১০% ক্যাশব্যাক']] },
  { name: 'Nakshi Threads', banner: 1, category: 'fashion', color: '#7C3AED', offers: [['Up to 30% off', '৩০% পর্যন্ত ছাড়']], tag: 'Hot Deal', days: 4 },
  { name: 'Step Up Shoes', banner: 12, category: 'fashion', color: '#0F766E', offers: [['৳200 off on ৳1500', '৳১৫০০-তে ৳২০০ ছাড়']] },
  { name: 'Daily Bazar', banner: 4, category: 'grocery', color: '#16A34A', offers: [['5% cashback', '৫% ক্যাশব্যাক']] },
  { name: 'Fresh Mart', banner: 7, category: 'grocery', color: '#65A30D', offers: [['৳100 cashback', '৳১০০ ক্যাশব্যাক']] },
  { name: 'Glow Beauty', banner: 2, category: 'lifestyle', color: '#DB2777', offers: [['20% off', '২০% ছাড়']] },
  { name: 'Gadget Ghor', banner: 14, category: 'lifestyle', color: '#2563EB', offers: [['0% EMI + ৳500 off', '০% ইএমআই + ৳৫০০ ছাড়']], tag: 'New' },
  { name: 'Shastho Pharmacy', banner: 8, category: 'health', color: '#0891B2', offers: [['10% instant discount', '১০% ইনস্ট্যান্ট ছাড়']] },
  { name: 'Shofor Tours', banner: 5, category: 'travel', color: '#EA580C', offers: [['৳300 off bus tickets', 'বাস টিকেটে ৳৩০০ ছাড়']] },
  { name: 'Sky Wings Travel', banner: 11, category: 'travel', color: '#4F46E5', offers: [['8% cashback on flights', 'ফ্লাইটে ৮% ক্যাশব্যাক']] },
];

/* ---------- mock campaign timing ---------- */
const CAMPAIGN_DAYS = 21;
const TKEY = 'bofa.campaign.v1';

/** End of that day in Dhaka (UTC+6, no DST) as an ISO timestamp. */
function endOfDayDhaka(t: number) {
  const ymd = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  return new Date(`${ymd}T23:59:59+06:00`).toISOString();
}

/**
 * Demo campaign start, kept in localStorage so countdowns keep running across
 * reloads. Restarts once the demo campaign has ended.
 */
function campaignStart(): number {
  let t = 0;
  try { t = Number(localStorage.getItem(TKEY)) || 0; } catch { /* storage unavailable */ }
  if (!t || Date.parse(endOfDayDhaka(t + CAMPAIGN_DAYS * 864e5)) < Date.now()) {
    t = Date.now();
    try { localStorage.setItem(TKEY, String(t)); } catch { /* ignore */ }
  }
  return t;
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STREETS = ['Road 11', 'Road 27', 'Lake Road', 'Kemal Ataturk Ave', 'Station Road', 'Bazar Road', 'College Road', 'Park Lane', 'Main Road', 'Mosque Road'];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * ~40 outlets: a few very close (so tapping is testable immediately),
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
  const t0 = campaignStart();
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
        brand: { name: b.name, initial: b.name[0], color: b.color, logo: `/img/logos/${slug(b.name)}.svg`, tag: b.tag },
        banner: b.banner ? `/img/banners/campaign-${String(b.banner).padStart(2, '0')}.webp` : undefined,
        offerEn: o[0],
        offerBn: o[1],
        category: b.category,
        endsAt: endOfDayDhaka(t0 + (b.days ?? CAMPAIGN_DAYS) * 864e5),
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
