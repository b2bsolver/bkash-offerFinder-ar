import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import MiniMap from './map/MiniMap';
import ArView from './ar/ArView';
import type { LookMode } from './ar/arScene';
import { acquireCamera, releaseCamera } from './ar/camera';
import { bearingDeg, bn, compassName, distanceM, fmtDistance } from './geo';
import { CATEGORIES, nearby, offersFor, type Category, type Offer } from './offers';
import { Countdown, EndsChip } from './Countdown';
import { requestMotionPermission, useGeolocation, useHeading } from './sensors';

const ZOOMS = [500, 1000, 2000];
const ZOOM_BN = ['৫০০ মি', '১ কিমি', '২ কিমি'];
/** AR shows every offer within this distance at its real direction. */
const AR_RANGE_M = 500;
const NOCAM = new URLSearchParams(location.search).has('nocam');

type Panel = null | 'list';

export default function App() {
  const [started, setStarted] = useState(false);
  const geo = useGeolocation(started);
  const heading = useHeading(started);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [followCompass, setFollowCompass] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [mapFull, setMapFull] = useState(false);
  const [look, setLook] = useState<number | null>(null);
  const [lookMode, setLookMode] = useState<LookMode>('drag');

  const viewRadius = ZOOMS[zoomIdx];
  const located = geo.source !== 'waiting';

  // mock world is created around the first known position
  useEffect(() => {
    if (located && offers.length === 0) setOffers(offersFor(geo.pos));
  }, [located, geo.pos, offers.length]);

  const inView = useMemo(() => nearby(offers, geo.pos, viewRadius, cat), [offers, geo.pos, viewRadius, cat]);
  const onMap = useMemo(() => nearby(offers, geo.pos, viewRadius * 1.25, cat), [offers, geo.pos, viewRadius, cat]);
  const arList = useMemo(() => nearby(offers, geo.pos, AR_RANGE_M, cat), [offers, geo.pos, cat]);
  // stable references for the map layer
  const mapKey = onMap.map((o) => o.id).join();
  const mapOffers = useMemo(() => {
    const ids = new Set(mapKey.split(','));
    return offers.filter((o) => ids.has(o.id));
  }, [offers, mapKey]);

  const zoomStep = (dir: 1 | -1) => setZoomIdx((i) => Math.max(0, Math.min(ZOOMS.length - 1, i - dir)));
  const expandMap = useCallback(() => setMapFull(true), []);
  const collapseMap = useCallback(() => setMapFull(false), []);

  // Start tap = user gesture: ask motion/compass (iOS) and camera together; GPS starts right after.
  const start = async () => {
    const motion = requestMotionPermission();
    if (!NOCAM && 'mediaDevices' in navigator) {
      // fire the prompt now; ArView picks up the same shared stream when it mounts
      acquireCamera().catch(() => {});
      releaseCamera();
    }
    await motion;
    setStarted(true);
  };

  // tap a logo (AR, map or list) → open that offer
  const tapOffer = useCallback((o: Offer) => setSelected(o), []);

  // AR look direction drives the minimap when there is no compass (desktop drag-to-look)
  const lastLook = useRef(0);
  const onLook = useCallback((h: number) => {
    const now = performance.now();
    if (now - lastLook.current < 120) return;
    lastLook.current = now;
    setLook(h);
  }, []);

  if (!started) return <StartScreen onStart={start} />;

  const mapHeading = heading ?? look;
  // battery: camera released while the map is full screen; AR render paused whenever covered
  const arRunning = !mapFull && !panel && !selected;

  return (
    <div className={mapFull ? 'app map-full' : 'app'}>
      <ArView
        pos={geo.pos}
        offers={arList}
        cameraOn={!mapFull}
        running={arRunning}
        onTap={tapOffer}
        onLook={onLook}
        onMode={setLookMode}
      />

      {!located ? (
        <div className="locating">
          <div className="bird big" />
          <b>Finding your location…</b>
          <span>আপনার লোকেশন খোঁজা হচ্ছে</span>
        </div>
      ) : (
        <MiniMap
          full={mapFull}
          onExpand={expandMap}
          onCollapse={collapseMap}
          controls={
            <>
              <div className="range-chip">
                <b>{ZOOM_BN[zoomIdx]}</b>
                <span>{bn(inView.length)} টি অফার</span>
              </div>
              <div className="side-btns">
                <button className="round" onClick={() => zoomStep(1)} disabled={zoomIdx === 0} aria-label="Zoom in">＋</button>
                <button className="round" onClick={() => zoomStep(-1)} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Zoom out">－</button>
                <button
                  className={followCompass && mapHeading != null ? 'round on' : 'round'}
                  onClick={() => setFollowCompass((f) => !f)}
                  aria-label="Rotate map with compass"
                  title={mapHeading == null ? 'Compass not available — drag the map to rotate' : 'Rotate with compass'}
                >
                  🧭
                </button>
              </div>
              {inView.length === 0 && (
                <div className="empty">
                  <b>No offers within {fmtDistance(viewRadius)}</b>
                  {zoomIdx < ZOOMS.length - 1 && <button className="btn" onClick={() => zoomStep(-1)}>Zoom out · জুম আউট</button>}
                </div>
              )}
            </>
          }
        >
          <MapView
            pos={geo.pos}
            viewRadius={mapFull ? viewRadius : AR_RANGE_M}
            heading={mapHeading}
            followCompass={followCompass}
            offers={mapOffers}
            onTapOffer={tapOffer}
            onZoomStep={zoomStep}
          />
        </MiniMap>
      )}

      {/* ---------- HUD (over AR; stays over the full map too) ---------- */}
      <header className="hud-top">
        <img src="/img/logo.webp" alt="bKash" className="logo" />
        {located && !mapFull && (
          <div className="ar-info">
            <b>🧭 {look == null ? '—' : compassName(look)}</b>
            <span>{bn(AR_RANGE_M)} মি-তে {bn(arList.length)} টি অফার</span>
          </div>
        )}
      </header>
      <nav className="chips">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={c.id === cat ? 'chip on' : 'chip'} onClick={() => setCat(c.id)}>
            {c.icon} {c.bn}
          </button>
        ))}
      </nav>


      <div className="status">
        {geo.error && <span>{geo.error} · move with arrow keys / pad</span>}
        {geo.source === 'gps' && <span>GPS ±{Math.round(geo.accuracy)} m</span>}
        {!mapFull && lookMode === 'drag' && <span>👆 Drag to look · টেনে দেখুন</span>}
        {!mapFull && lookMode === 'relative' && <span>No compass — directions approximate</span>}
      </div>

      {arList.length === 0 && located && !mapFull && (
        <div className="empty">
          <b>No offers within {fmtDistance(AR_RANGE_M)}</b>
          <span>৫০০ মিটারের মধ্যে কোনো অফার নেই</span>
          <button className="btn" onClick={expandMap}>🗺️ Open map · ম্যাপ</button>
        </div>
      )}

      <footer className="hud-bottom">
        <button className="pill main" onClick={() => setPanel('list')}>
          ☰ Offers nearby <span className="count">{bn(inView.length)}</span>
        </button>
      </footer>

      {/* ---------- sheets ---------- */}
      {panel === 'list' && (
        <ListPanel items={inView} radius={viewRadius} onPick={(o) => { setPanel(null); tapOffer(o); }} onClose={() => setPanel(null)} />
      )}
      {selected && <OfferCard key={selected.id} offer={selected} from={geo.pos} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ================= components ================= */

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="start">
      <img src="/img/logo.webp" alt="bKash" className="start-logo" />
      <h1>Offers <span>Nearby</span></h1>
      <p className="bn">চারপাশে দেখুন, অফার খুঁজুন!</p>
      <ul className="how">
        <li>📷 Look around — brand logos float at real shops within 500 m</li>
        <li>👆 Tap a logo to see that shop's bKash offer</li>
        <li>🗺️ Open the map for shops up to 2 km away</li>
      </ul>
      <button className="btn big" onClick={onStart}>Start · শুরু করুন</button>
      <small>Asks for camera, location and motion (compass). Your location stays on your phone.<br />Demo build — offers are sample data.</small>
    </div>
  );
}

function Badge({ o, size = 44 }: { o: Offer; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (o.brand.logo && !broken)
    return (
      <span className="badge logo" style={{ width: size, height: size }}>
        <img src={o.brand.logo} alt={o.brand.name} onError={() => setBroken(true)} />
      </span>
    );
  return (
    <span className="badge" style={{ background: o.brand.color, width: size, height: size, fontSize: size * 0.48 }}>
      {o.brand.initial}
    </span>
  );
}

/** Offer details, opened by tapping a brand logo (any distance). */
function OfferCard({ offer, from, onClose }: { offer: Offer; from: { lat: number; lng: number }; onClose: () => void }) {
  const d = distanceM(from, offer);
  const dir = compassName(bearingDeg(from, offer));
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${offer.lat},${offer.lng}`;
  const [bannerBroken, setBannerBroken] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="reveal" onClick={onClose}>
      <div className="reveal-card" role="dialog" aria-label={`${offer.brand.name} offer`} onClick={(e) => e.stopPropagation()}>
        {offer.banner && !bannerBroken ? (
          <div className="reveal-banner" style={{ background: offer.brand.color }}>
            <img src={offer.banner} alt={`${offer.brand.name} campaign`} onError={() => setBannerBroken(true)} />
            <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        ) : (
          <div className="reveal-head" style={{ background: offer.brand.color }}>
            <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
            <Badge o={offer} size={88} />
          </div>
        )}
        <div className="reveal-body">
          <div className="reveal-title">
            <b>{offer.brand.name}</b>
            {offer.brand.tag && <span className="tag">{offer.brand.tag}</span>}
          </div>
          <div className="offer-val big">
            {offer.offerEn}
            <span>{offer.offerBn}</span>
          </div>
          <p>Pay with bKash at this outlet.</p>
          <Countdown end={offer.endsAt} compact />
          <small>📍 {offer.address} · {fmtDistance(d)} {dir}</small>
          <div className="row gap">
            <a className="btn ghost" href={directions} target="_blank" rel="noreferrer">Directions</a>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListPanel(p: { items: (Offer & { distance: number })[]; radius: number; onPick: (o: Offer) => void; onClose: () => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <b>Offers within {fmtDistance(p.radius)}</b>
        <button className="icon-btn" onClick={p.onClose}>✕</button>
      </div>
      <ul className="list">
        {p.items.map((o) => (
          <li key={o.id} onClick={() => p.onPick(o)}>
            <Badge o={o} size={40} />
            <div className="grow">
              <b>{o.brand.name}</b>
              <small>{o.offerEn} · {o.offerBn}</small>
            </div>
            <EndsChip end={o.endsAt} />
            <span className="dist">{fmtDistance(o.distance)}</span>
          </li>
        ))}
        {p.items.length === 0 && <li className="none">No offers here — try zooming out.</li>}
      </ul>
    </div>
  );
}
