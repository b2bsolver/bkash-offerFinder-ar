# bKash Offer Finder AR — Plan

A **map-first, location-based offer hunt** in the browser, similar in *type of experience* to location games like Pokémon GO:
walk around a stylised 3D map of your area, see bKash offer gifts at real outlet locations, walk close, tap → **AR catch screen** → offer revealed and saved.

- Look & feel and AR catch mechanic: reuse from **Offer Hunt** (https://offer-hunt.agent-frame.com — camera + motion, gifts/coins, combos).
- Offer data: **Offer Finder** backend (`../bkash-offer-finder/bkash-offer-backend`, Laravel 11) — read-only via its existing public API.
- Web app (no install), React + Three.js, mobile-first.

> Same genre, all-original art: bKash birds, gifts, coins, pink brand style. No Pokémon characters, art, sounds or UI copied.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Main experience | **AR-first** (camera + gifts at real bearing/distance within 500 m); 3D map as a minimap that expands full screen (changed from map-first, Nov 2026) |
| Platform | **Web app** (Android Chrome + iOS Safari, HTTPS). Native / bKash in-app version later if needed |
| Range | Fixed **500 m** default view, no radius picker, with **zoom out** (500 m → 1 km → 2 km) |
| Campaigns | **All active campaigns** |
| Backend | **No changes to `bkash-offer-backend` for now** — use existing public API, filter by distance in the browser (§5) |
| Brand colours / assets | Take from **`../remittance-ar`** (see §4.1) |
| Entry point | **TBD — to be discussed later** (QR in newspaper ad vs link in bKash app/web). App must work from a plain URL either way |

---

## 2. Core user experience

### Screens
1. **Start** — short intro, one "Start" tap that requests location + motion (camera asked later, at first catch). Bangla + English.
2. **Map (home)** — tilted 3D map centred on the user, rotates with compass (toggle: north-up).
   - **Avatar**: bKash bird / character walking on the map at the user's GPS position (smoothed).
   - **Offer gifts**: floating 3D gift boxes / brand coins at outlet locations, brand logo on top, idle bobbing.
   - **Catch ring**: ~40 m ring around the avatar (grows with GPS inaccuracy). Gifts inside it glow and pulse.
   - Tap a far gift → info bubble (brand, offer, distance, "walk 230 m"). Tap a gift in range → **Catch**.
   - HUD: zoom out/in, range chip ("৫০০ মি / ১ কিমি / ২ কিমি"), category filter chips, "My offers" button, GPS accuracy badge, recentre button.
3. **Catch (AR)** — camera + gyro (Offer Hunt engine): the gift floats in the real room, user taps/swipes to open → coin burst + bird animation → **offer card** (brand, offer value, campaign end, outlet address, "Directions").
   - Fallback without camera: same scene on a pink 3D background.
4. **My offers** — collection of caught offers (logo grid), tap for details again. Stored locally (v1).
5. **List view** — plain list of nearby offers sorted by distance (backup for indoors / poor GPS / accessibility / desktop).

### Zoom out
- Default 500 m view; **zoom out** steps 500 m → 1 km → 2 km and back (buttons + pinch).
- Each level re-filters the cached offer list in the browser (no extra request → instant zoom in/out).
- At 1–2 km, gifts cluster into bubbles with a count ("12 offers"); tap a cluster to zoom in on it.
- Empty state at 500 m: "No offers nearby" → **Zoom out** button.

### Feel / juice (Offer Hunt flavour)
- Smooth camera follow, avatar walk cycle when moving, idle when still.
- Gifts sparkle when entering the catch ring; light haptic (`navigator.vibrate`) on Android.
- Catch: coin burst, combo for opening quickly, bird flies off with the offer.
- Sounds optional (muted by default).

---

## 3. Feasibility notes / constraints

| Item | Reality | Mitigation |
|---|---|---|
| GPS accuracy | 5–20 m outdoors, worse between tall buildings, poor indoors | Map hides small errors; catch ring grows with `accuracy`; position smoothing; list fallback |
| Compass | ±10–20° drift | Only used to rotate the map (not critical); low-pass filter; north-up toggle |
| iOS permissions | Motion needs `DeviceOrientationEvent.requestPermission()` from a tap; camera needs a tap | Ask on Start (location + motion) and on first Catch (camera) |
| Background | Web apps cannot track location or notify when closed | Accept for v1; native / bKash in-app later |
| Battery | GPS + 3D map + camera | Cap fps (30 on low-end), pause when hidden, moderate GPS watch, camera only during catch |
| Map tiles | Hosted providers bill per usage | Self-host **Protomaps PMTiles** (Bangladesh extract, one file on nginx) or MapTiler with a cap |
| Data quality | Only outlets with valid `latitude/longitude` appear | Audit coverage first (Phase 0) |
| Cheating (GPS spoofing) | Possible in browser | Low risk for offer discovery; server can sanity-check later if catches become rewards |

---

## 4. Tech stack

Frontend (this folder — already scaffolded: Vite + React 19 + TypeScript):

- **React 19 + Vite + TypeScript** — screens, HUD, state.
- **MapLibre GL JS** — vector map, custom bKash style (pink/white, simplified roads, 3D building extrusions), tilt/rotate.
- **three.js** rendered inside MapLibre via a **custom layer** (shared WebGL context) — avatar, gifts, ring, effects at real lat/long.
- **@react-three/fiber + drei** — for the **Catch (AR)** screen (separate canvas), port of Offer Hunt's camera + gyro scene.
- **zustand** — position, heading, zoom level, offers, caught offers.
- **@tanstack/react-query** — fetch + cache nearby offers per zoom level.
- **Map data**: OpenStreetMap via **Protomaps PMTiles** (self-hosted) — or MapTiler for faster start.
- Assets: glTF models (gift, coin, bird/avatar) compressed with Draco/meshopt; logo texture atlas; Hind Siliguri font.

Backend: existing Laravel 11 API, **unchanged** (see §5).

### 4.1 bKash brand colours & assets — source: `../remittance-ar`

Whenever bKash brand colours, fonts or art are needed, take them from **`/home/rifat/office/bkash/remittance-ar`** (do not invent new brand values).

**Colours** (from `remittance-ar/src/style.css` `:root` + three.js materials):

| Token | Hex | Use |
|---|---|---|
| `--pink` | `#E2136E` | Primary bKash pink: buttons, gifts, highlights, catch ring |
| `--deep` | `#9E0B4D` | Pressed states, dark accents |
| `--maroon` | `#7D3556` | Secondary text, loading text |
| `--ink` | `#3A1027` | Body text |
| `--soft` | `#FDE7F0` | Soft panel backgrounds |
| bg pink | `#FBD9E8` | App background |
| accents | `#FF3D8B`, `#FF5AA5`, `#F3B5CF` (borders), `#8C0A47` | Glows, borders, emphasis |
| gold | `#FFD34D`, `#FFC74A` | Coins / sparkle effects |

Background gradient used there: `radial-gradient(ellipse at 50% 30%, #fff5f9 0%, #fbd3e4 55%, #f3a8c9 100%)` (loading screen: `#fff3f8 → #fbcfe1 → #f6a9c9`).

**Fonts**
- **Hind Siliguri** 400/600/700 via `@fontsource/hind-siliguri` (Bangla + English UI text).
- **Anek ExtraBold** — `remittance-ar/public/fonts/Anek-XB.ttf` (big headline numbers / titles).

**Reusable assets**

| Asset | Path in remittance-ar | Notes |
|---|---|---|
| bKash logo | `public/img/logo.webp` (source `assets-src/clean/logo.png`) | Start screen, HUD, offer card |
| bKash bird animation (official) | `public/bird/0.png … 33.png` (34 frames, 256×256 RGBA, 14 fps); strip `public/img/bird-strip.webp` (**64 px frames — small icons only, looks blurry when enlarged**); for anything ≥ 48 px build a strip from the 256 px PNG frames (this project: `public/img/bird-strip-256.webp`); source GIFs `assets-src/bird/bkash-bird.gif`, `bkash-bird-hd.gif` | Avatar candidate, catch fly-off animation. Sprite logic in `src/birds.js` |
| Favicons / app icons | `public/favicon.ico`, `favicon.png`, `favicon-192.png`, `favicon-512.png`, `apple-touch-icon.png` | Copy as-is |
| Code references | `src/birds.js` (sprite flap, arcs, sparkles, blob shadows), `src/look.js`, `src/style.css` (start screen, panels, bubbles) | Port patterns, not the remittance content |

Not reusable (remittance-campaign specific): people cut-outs `r_*.webp`, flag/landmark images `s_*.webp`, `headline.webp`, `stats.webp`, MTO logos (`public/mto/`), newspaper KV `site/ad/remittance-kv.jpg`.

Brand/merchant logos for offers come from the Offer Finder API (`brand.logo`), not from remittance-ar.

---

## 5. Data source — no backend changes (for now)

**Decision:** `bkash-offer-backend` is **not modified** in this phase. The AR app uses the **existing public API** and does the distance filtering in the browser.

### Existing endpoints used
```
GET {API}/brands?scope=available
    &fields=id,name,slug,logo,tag,offer_value_en,offer_value_bn
    &with[campaign]=id,name_en,slug,tag_color,end_time
    &with[outlets]=id,address,district,thana,latitude,longitude
    &with[subCategory.category]=id,name_en,name_bn,slug,icon
GET {API}/categories                      # category chips
```
- `scope=available` = brands whose campaign is active (`Brand::scopeAvailable` → `campaign.active()`), i.e. **all active campaigns**.
- Field / relation names must match the API whitelist in `API_DOCUMENTATION.md`; verify each one during Phase 1 and drop any that are rejected.
- `{API}` = `VITE_API_BASE_URL` (local dev: same API as the Offer Finder frontend, `NEXT_PUBLIC_BASE_API_URL` in `bkash-offer-frontend/.env`).

### Client-side "nearby" logic (`src/api/offers.ts` + `src/geo/`)
1. Fetch the full available-brands payload **once** per session; cache with react-query (`staleTime` ~10 min) + `localStorage` snapshot for fast reopen.
2. Flatten to an `Offer[]` list: one entry per outlet with valid coords (drop null / 0,0 / outside Bangladesh bbox `20.5–26.7 N, 88.0–92.7 E`).
3. On each smoothed GPS update: bounding-box prefilter → Haversine distance → keep `distance <= zoomRadius` (500 / 1000 / 2000 m) → sort by distance.
4. Spatial grid index (e.g. 0.01° cells) so filtering stays fast with thousands of outlets.

### Same shape as a future endpoint
Normalise into the type below so a server-side `/api/offers/nearby` can replace step 1–3 later **without UI changes**:
```ts
type Offer = {
  outletId: number; lat: number; lng: number; distanceM: number;
  address: string; district: string; thana: string;
  brand: { id: number; name: string; slug: string; logo: string; tag?: string;
           offerValueEn?: string; offerValueBn?: string };
  campaign: { id: number; nameEn: string; slug: string; tagColor?: string; endTime?: string };
  category?: { id: number; slug: string; nameEn: string; nameBn: string; icon?: string };
};
```

### CORS without touching the backend
- **Dev:** Vite `server.proxy` → `/api` forwards to the API host.
- **Prod:** nginx on the AR domain proxies `/api/` to the API (same-origin, no CORS config needed).

### Trade-offs (accepted for v1)
- Larger first download (all active brands + outlets). Mitigate: request only needed fields, gzip, cache. Measure in Phase 1 — if > ~2 MB, raise backend endpoint again.
- Full outlet list is visible to the client (it's already public data via the same API).
- Later (when backend work is allowed): `/api/offers/nearby` with Haversine + `(latitude, longitude)` index, and optional `POST /api/catches`.

---

## 6. Frontend architecture

```
src/
  main.tsx, App.tsx, store.ts, i18n.ts
  screens/
    StartScreen.tsx
    MapScreen.tsx          # MapLibre map + three.js custom layer + HUD
    CatchScreen.tsx        # AR catch (camera + gyro), offer reveal
    CollectionScreen.tsx   # "My offers"
    ListScreen.tsx         # backup list
  map/
    mapStyle.ts            # bKash map style (colours, 3D buildings)
    ThreeLayer.ts          # MapLibre CustomLayerInterface → three.js scene
    Avatar.ts              # model, walk/idle animation, smoothing
    Gifts.ts               # instanced gifts/coins, logo atlas, glow in range
    CatchRing.ts
    clusters.ts            # clustering at 1–2 km zoom
    camera.ts              # follow, tilt, rotate with heading, zoom levels
  catch/
    CatchScene.tsx         # ported from Offer Hunt
    camera-feed.ts, gyro.ts
    effects.ts             # coin burst, sparkles, bird fly-off
  hud/
    ZoomControl.tsx, RangeChip.tsx, CategoryChips.tsx,
    AccuracyBadge.tsx, RecentreButton.tsx, OfferBubble.tsx, OfferCard.tsx
  sensors/
    useGeolocation.ts      # watchPosition, accuracy, Kalman/low-pass smoothing
    useHeading.ts          # iOS webkitCompassHeading / Android deviceorientationabsolute
    usePermissions.ts
  geo/
    distance.ts            # haversine, bearing
  api/
    offers.ts              # existing /api/brands?scope=available → Offer[] (react-query + cache)
    nearby.ts              # grid index + haversine filter by zoom radius
  storage/
    collection.ts          # caught offers in localStorage (try/catch)
```

Key behaviours:
- Offer list fetched once per session; nearby set recomputed on every smoothed GPS update / zoom change.
- Catch allowed when `distance <= max(40 m, gps.accuracy)`.
- Dev overrides for desktop: `?lat=23.78&long=90.41&heading=90&walk=1` (fake position + simulated walking).

---

## 7. Phases (~3 weeks, one developer)

| Phase | Scope | Output |
|---|---|---|
| **0. Audit** (0.5 d) | Call the existing brands API, count outlets with valid coords per district, measure payload size; spot-check accuracy in Dhaka | Go/no-go + data fix list |
| **1. Data layer** (1 d) | Vite proxy, `offers.ts` normalisation, grid index + haversine filter, unit tests, `localStorage` cache | `Offer[]` near any lat/long, no backend change |
| **2. Map base** (3 d) | MapLibre + bKash style + tiles, GPS + heading hooks, follow camera, zoom levels, list view | Walkable map with real offer pins |
| **3. 3D layer** (3 d) | three.js custom layer: avatar, gifts with logos, catch ring, clustering, bubbles | Pokémon-GO-style map feel |
| **4. Catch AR** (2–3 d) | Port Offer Hunt camera + gyro scene, open animation, offer card, collection | Full loop: walk → catch → offer |
| **5. Polish** (2–3 d) | Animations, haptics, Bangla copy, loading/empty/error states, permission flows, low-end Android perf | Campaign-ready build |
| **6. Field test + deploy** (1–2 d) | Walk tests (Gulshan, Banani, Dhanmondi, a mall) on Android + iPhone; tune smoothing & ring; nginx + TLS, analytics | Production |

---

## 8. Testing

- Unit: haversine/bearing, clustering, position smoothing, catch-range rule.
- Simulated walk mode for desktop/dev (`?walk=1`) to test the map loop without going outside.
- Playwright screenshots with mocked geolocation/orientation (map, catch, list, collection).
- Data layer: unit tests for normalisation (bad/null coords), radius filter per zoom level, sorting.
- Field checklist: open street, tall-building street, indoor mall, iOS permission denied, GPS off, slow 3G.

---

## 9. Performance & privacy

- Targets: first load < 3 MB before map tiles; 60 fps mid-range Android (30 fps cap on low-end); ≤ 200 gifts instanced.
- Camera only active on the Catch screen; GPS watch paused when tab hidden.
- User location **never leaves the device** (filtering is client-side). Short privacy note on Start.

---

## 10. Later (v2+)

- Badges, streaks, daily challenges, time-limited special gifts.
- Backend (when allowed): `/api/offers/nearby` endpoint + index; server-side catches (`POST /api/catches`), leaderboards, rewards for visits.
- Social share of a catch.
- bKash in-app / native version with "offer nearby" notifications and background location.

---

## 11. Open questions

1. Entry point: QR in newspaper ad vs link inside bKash app/web — **to be discussed later**.
2. Exact zoom levels (proposed 500 m → 1 km → 2 km) and max range?
3. Catch range: 40 m OK, or must users be at the outlet (~20 m)?
4. Avatar: bKash bird, or a simple human character?
5. Map tiles: self-host Protomaps (free, more setup) or MapTiler (paid, faster)?
6. Production domain for the app, and the production API base URL to proxy to?
7. Who fixes missing/wrong outlet coordinates found in Phase 0?

---

## 12. Prototype status (small-scale build)

Built in this folder **without any API** (mock offers in `src/offers.ts`). Working: start screen + permissions, pink 3D map (OpenFreeMap tiles, 3D buildings), bKash bird avatar following GPS, three.js gifts with brand badges, 40 m catch ring, in-range toast, AR catch (camera + gyro, 3 taps, coin burst), reveal card, My offers (localStorage), list view, category chips, zoom out 500 m → 1 km → 2 km, compass rotation, desktop manual movement / simulated walk. How to run: `README.md`.

Next: field test on real Android + iPhone, then swap mock data for real offers (§5).
