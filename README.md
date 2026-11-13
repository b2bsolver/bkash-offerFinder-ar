# bKash Offer Hunt Nearby (prototype)

AR-first, location-based offer hunt in the browser. The home screen is the live camera with 3D bKash gifts placed at the **real compass direction and distance** of every outlet within 500 m (name + distance labels, edge arrows for in-range gifts behind you). A minimap (top right) expands to the full 3D map. Walk within ~40 m, tap the gift (in AR or on the map) → catch screen → offer unlocked and saved to **My offers**. See `plan.md` for the full plan.

**Prototype scope:** no backend/API. Offers are **mock data** generated around your first position (`src/offers.ts`, fictional merchant names). Caught offers are stored in `localStorage`.

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
| `?nocam=1` | No camera (AR home + catch on the pink background) |

In manual mode (no GPS / denied / forced) move with **arrow keys / WASD** or the on-screen pad. On desktop, **drag** the AR view (or **Q / E**) to look around; the minimap follows the look direction. Wheel or pinch = zoom out/in (500 m → 1 km → 2 km). Drag sideways rotates the map when the compass toggle is off.

To reset the mock world and collection: clear site data (`bofa.*` keys in localStorage).

## Structure
| File | What |
|---|---|
| `src/App.tsx` | Screens, HUD, sheets, list, My offers, reveal card |
| `src/ar/` | AR home: camera feed + location-based three.js scene (`arScene.ts`), labels, edge arrows |
| `src/map/MiniMap.tsx` | Minimap card ⇄ full-screen map (FLIP transform animation) |
| `src/map/MapView.tsx` | MapLibre map, bKash restyle, avatar, range circles, follow camera, gestures |
| `src/map/giftLayer.ts` | three.js gifts rendered inside MapLibre (custom layer) |
| `src/catch/` | AR catch: camera feed + gyro + tap-to-open, coin burst |
| `src/gift3d.ts` | Shared gift / coin models |
| `src/sensors.ts` | GPS, compass, iOS motion permission, manual/simulated movement |
| `src/offers.ts` | Mock offers, nearby filter, collection storage |
| `src/geo.ts` | Haversine, bearing, offsets, Bangla digits |

Map tiles: [OpenFreeMap](https://openfreemap.org) (free, no key; © OpenMapTiles, © OpenStreetMap contributors). Brand colours, fonts, logo and bKash bird sprite come from `../remittance-ar` (plan.md §4.1).

## AR home notes
- **Permissions on Start** (one tap): motion/compass (iOS prompt), camera, then location.
- **Orientation:** Android uses `deviceorientationabsolute` (true north); iOS uses `deviceorientation` + `webkitCompassHeading` as a smoothed north offset. No sensors → drag to look.
- **Accuracy:** placement comes from GPS (5–30 m) and compass (±10–20°), so a gift can sit a few metres beside the shop. Gifts are not anchored to surfaces and are not hidden behind buildings.
- **Distances are compressed** for display (500 m ≈ 42 scene units) with a minimum on-screen size; labels show the real distance.
- **Battery:** while the map is full screen the camera stream is released and the AR render loop is paused; both resume on minimize. The AR loop also pauses under the catch screen and full-screen panels.
