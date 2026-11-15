# bKash Offer Hunt Nearby (prototype)

AR-first, location-based offer finder in the browser. The home screen is the live camera with 3D **brand logo signs** placed at the **real compass direction and distance** of every outlet within 500 m (name, offer + distance labels, an edge arrow for the nearest shop behind you). A minimap (top right) expands to the full 3D map. **Tap any logo** (in AR, on the map or in the list) → offer card with directions. No catching / collecting (the earlier game loop was removed, Nov 2026). See `plan.md` for the original plan.

**Prototype scope:** no backend/API. Offers are **mock data** generated around your first position (`src/offers.ts`, fictional merchant names). Their logos are placeholder SVGs in `public/img/logos/` (not real partner marks); `brand.logo` takes any image URL, so the backend's `logo_url` can replace them later (remote images need CORS for the 3D texture).

## Run
```bash
npm install
npm run dev          # http://localhost:5173 (desktop)
npm run dev:https    # https://<your-LAN-IP>:5173 for phones (accept the self-signed cert warning)
npm run build        # -> dist/
```
Phones need HTTPS for GPS, compass and camera — use `dev:https` or deploy behind TLS.

## Testing without walking
| URL param | Effect |
|---|---|
| `?lat=23.78&lng=90.41` | Start at a fixed position (manual mode) |
| `?walk=1` | Simulated walk in a loop |
| `?offline=1` | No map tiles (plain pink ground) |
| `?nocam=1` | No camera (AR home on the pink background) |

In manual mode (no GPS / denied / forced) move with **arrow keys / WASD**. On desktop, **drag** the AR view (or **Q / E**) to look around; the minimap follows the look direction. Wheel or pinch = zoom out/in (500 m → 1 km → 2 km). Drag sideways rotates the map when the compass toggle is off.

**Offer-ends countdown** (`src/Countdown.tsx`): each offer card counts down to that offer's end, and the list shows a ⏳ chip for offers ending within 5 days. Mock end times are end-of-day Dhaka time: the campaign runs 21 days from your first visit, and a few brands end sooner (`days` in `src/offers.ts`).

To reset the mock world and campaign timer: clear site data (`bofa.*` keys in localStorage).

## Structure
| File | What |
|---|---|
| `src/App.tsx` | Screens, HUD, list, offer card |
| `src/ar/` | AR home: camera feed (`camera.ts`) + location-based three.js scene (`arScene.ts`), labels, edge arrows |
| `src/map/MiniMap.tsx` | Minimap card ⇄ full-screen map (FLIP transform animation) |
| `src/map/MapView.tsx` | MapLibre map, bKash restyle, avatar, range circles, follow camera, gestures |
| `src/map/logoLayer.ts` | three.js logo signs rendered inside MapLibre (custom layer) |
| `src/logo3d.ts` | Shared logo sign model + logo texture (image, or drawn fallback) |
| `src/sensors.ts` | GPS, compass, iOS motion permission, manual/simulated movement |
| `src/offers.ts` | Mock offers, campaign end times, nearby filter |
| `src/Countdown.tsx` | Offer-ends countdown boxes + list chip |
| `src/geo.ts` | Haversine, bearing, offsets, Bangla digits |

Map tiles: [OpenFreeMap](https://openfreemap.org) (free, no key; © OpenMapTiles, © OpenStreetMap contributors). Brand colours, fonts, logo and bKash bird sprite come from `../remittance-ar` (plan.md §4.1).

## AR home notes
- **Permissions on Start** (one tap): motion/compass (iOS prompt), camera, then location.
- **Orientation:** Android uses `deviceorientationabsolute` (true north); iOS uses `deviceorientation` + `webkitCompassHeading` as a smoothed north offset. No sensors → drag to look.
- **Accuracy:** placement comes from GPS (5–30 m) and compass (±10–20°), so a logo can sit a few metres beside the shop. Logos are not anchored to surfaces and are not hidden behind buildings.
- **Distances are compressed** for display (500 m ≈ 42 scene units) with a minimum on-screen size; labels show the real distance.
- **Battery:** while the map is full screen the camera stream is released and the AR render loop is paused; both resume on minimize. The AR loop also pauses under the offer card and full-screen panels.
