import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView from './map/MapView';
import MiniMap from './map/MiniMap';
import CatchScreen from './catch/CatchScreen';
import ArView from './ar/ArView';
import type { LookMode } from './ar/arScene';
import { acquireCamera, releaseCamera } from './catch/camera';
import { bearingDeg, bn, compassName, distanceM, fmtDistance } from './geo';
import { CATEGORIES, loadCaught, nearby, offersFor, saveCaught, type Caught, type Category, type Offer } from './offers';
import { requestMotionPermission, useGeolocation, useHeading } from './sensors';

const ZOOMS = [500, 1000, 2000];
const ZOOM_BN = ['৫০০ মি', '১ কিমি', '২ কিমি'];
const BASE_CATCH_M = 40;
/** AR shows every offer within this distance at its real direction. */
const AR_RANGE_M = 500;
const NOCAM = new URLSearchParams(location.search).has('nocam');

type Panel = null | 'list' | 'collection';

export default function App() {
  const [started, setStarted] = useState(false);
  const geo = useGeolocation(started);
  const heading = useHeading(started);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [followCompass, setFollowCompass] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [caught, setCaught] = useState<Caught[]>(loadCaught);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [catching, setCatching] = useState<Offer | null>(null);
  const [revealed, setRevealed] = useState<Offer | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [mapFull, setMapFull] = useState(false);
  const [look, setLook] = useState<number | null>(null);
  const [lookMode, setLookMode] = useState<LookMode>('drag');

  const viewRadius = ZOOMS[zoomIdx];
  const catchRadius = Math.min(80, Math.max(BASE_CATCH_M, geo.accuracy));
  const located = geo.source !== 'waiting';

  // mock world is created around the first known position
  useEffect(() => {
    if (located && offers.length === 0) setOffers(offersFor(geo.pos));
  }, [located, geo.pos, offers.length]);

  const caughtIds = useMemo(() => new Set(caught.map((c) => c.id)), [caught]);
  const inView = useMemo(() => nearby(offers, geo.pos, viewRadius, cat), [offers, geo.pos, viewRadius, cat]);
  const onMap = useMemo(() => nearby(offers, geo.pos, viewRadius * 1.25, cat), [offers, geo.pos, viewRadius, cat]);
  const arList = useMemo(() => nearby(offers, geo.pos, AR_RANGE_M, cat), [offers, geo.pos, cat]);
  const inRangeIds = useMemo(
    () => new Set(arList.filter((o) => o.distance <= catchRadius && !caughtIds.has(o.id)).map((o) => o.id)),
    [arList, catchRadius, caughtIds],
  );
  // stable references for the map layer
  const mapKey = onMap.map((o) => o.id).join();
  const mapOffers = useMemo(() => {
    const ids = new Set(mapKey.split(','));
    return offers.filter((o) => ids.has(o.id));
  }, [offers, mapKey]);
  const inRangeKey = [...inRangeIds].join();
  const stableInRange = useMemo(() => inRangeIds, [inRangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const tapOffer = (o: Offer) => {
    if (inRangeIds.has(o.id)) {
      setSelected(null);
      setCatching(o);
    } else setSelected(o);
  };

  const onOpened = () => {
    if (!catching) return;
    const o = catching;
    if (!caughtIds.has(o.id)) {
      const next = [{ id: o.id, at: Date.now(), offer: o }, ...caught];
      setCaught(next);
      saveCaught(next);
    }
    setCatching(null);
    setRevealed(o);
  };

  // AR look direction drives the minimap when there is no compass (desktop drag-to-look)
  const lastLook = useRef(0);
  const onLook = useCallback((h: number) => {
    const now = performance.now();
    if (now - lastLook.current < 120) return;
    lastLook.current = now;
    setLook(h);
  }, []);

  if (!started) return <StartScreen onStart={start} />;

  const firstInRange = arList.find((o) => inRangeIds.has(o.id));
  const mapHeading = heading ?? look;
  // battery: camera released while the map is full screen; AR render paused whenever covered
  const arRunning = !mapFull && !catching && !panel;

  return (
    <div className={mapFull ? 'app map-full' : 'app'}>
      <ArView
        pos={geo.pos}
        offers={arList}
        caught={caughtIds}
        inRange={stableInRange}
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
            catchRadius={catchRadius}
            viewRadius={mapFull ? viewRadius : AR_RANGE_M}
            heading={mapHeading}
            followCompass={followCompass}
            offers={mapOffers}
            caught={caughtIds}
            inRange={stableInRange}
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

      {geo.source === 'manual' && <DPad move={geo.move} />}

      {firstInRange && !selected && !catching && (
        <button className="toast" onClick={() => setCatching(firstInRange)}>
          🎁 <b>{firstInRange.brand.name}</b> · <span>ধরুন! Tap to catch</span>
        </button>
      )}

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
        <button className="pill" onClick={() => setPanel('list')}>☰ List</button>
        <button className="pill main" onClick={() => setPanel('collection')}>
          🎁 My offers <span className="count">{bn(caught.length)}</span>
        </button>
      </footer>

      {/* ---------- sheets ---------- */}
      {selected && (
        <OfferSheet
          offer={selected}
          from={geo.pos}
          catchRadius={catchRadius}
          caught={caughtIds.has(selected.id)}
          onCatch={() => { setCatching(selected); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      )}
      {panel === 'list' && (
        <ListPanel items={inView} caught={caughtIds} radius={viewRadius} onPick={(o) => { setPanel(null); tapOffer(o); }} onClose={() => setPanel(null)} />
      )}
      {panel === 'collection' && <CollectionPanel items={caught} onPick={(o) => { setPanel(null); setRevealed(o); }} onClose={() => setPanel(null)} />}

      {catching && <CatchScreen offer={catching} onOpened={onOpened} onClose={() => setCatching(null)} />}
      {revealed && <RevealCard offer={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}

/* ================= components ================= */

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="start">
      <img src="/img/logo.webp" alt="bKash" className="start-logo" />
      <div className="bird big" />
      <h1>Offer Hunt <span>Nearby</span></h1>
      <p className="bn">হাঁটুন, খুঁজুন, অফার ধরুন!</p>
      <ul className="how">
        <li>📷 Look around — gifts float at real shops within 500 m</li>
        <li>🚶 Walk close (within ~40 m)</li>
        <li>🎁 Tap the gift to catch it and unlock the offer</li>
      </ul>
      <button className="btn big" onClick={onStart}>Start hunting · শুরু করুন</button>
      <small>Asks for camera, location and motion (compass). Your location stays on your phone.<br />Demo build — offers are sample data.</small>
    </div>
  );
}

function DPad({ move }: { move: (e: number, n: number) => void }) {
  const s = 8;
  return (
    <div className="dpad" aria-label="Move (demo)">
      <button onClick={() => move(0, s)}>▲</button>
      <div>
        <button onClick={() => move(-s, 0)}>◀</button>
        <button onClick={() => move(s, 0)}>▶</button>
      </div>
      <button onClick={() => move(0, -s)}>▼</button>
    </div>
  );
}

function Badge({ o, size = 44 }: { o: Offer; size?: number }) {
  return (
    <span className="badge" style={{ background: o.brand.color, width: size, height: size, fontSize: size * 0.48 }}>
      {o.brand.initial}
    </span>
  );
}

function OfferSheet(p: { offer: Offer; from: { lat: number; lng: number }; catchRadius: number; caught: boolean; onCatch: () => void; onClose: () => void }) {
  const d = distanceM(p.from, p.offer);
  const dir = compassName(bearingDeg(p.from, p.offer));
  const inRange = d <= p.catchRadius;
  return (
    <div className="sheet" onClick={p.onClose}>
      <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <Badge o={p.offer} />
          <div className="grow">
            <b>{p.offer.brand.name}</b>
            <small>{p.offer.address}</small>
          </div>
          {p.offer.brand.tag && <span className="tag">{p.offer.brand.tag}</span>}
        </div>
        <div className="offer-val">
          {p.offer.offerEn}
          <span>{p.offer.offerBn}</span>
        </div>
        {p.caught ? (
          <div className="note ok">✓ Already in My offers</div>
        ) : inRange ? (
          <button className="btn big" onClick={p.onCatch}>🎁 Catch it!</button>
        ) : (
          <div className="note">🚶 Walk <b>{fmtDistance(d - p.catchRadius)}</b> {dir} to catch this gift</div>
        )}
      </div>
    </div>
  );
}

function ListPanel(p: { items: (Offer & { distance: number })[]; caught: Set<string>; radius: number; onPick: (o: Offer) => void; onClose: () => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <b>Offers within {fmtDistance(p.radius)}</b>
        <button className="icon-btn" onClick={p.onClose}>✕</button>
      </div>
      <ul className="list">
        {p.items.map((o) => (
          <li key={o.id} onClick={() => p.onPick(o)} className={p.caught.has(o.id) ? 'done' : ''}>
            <Badge o={o} size={40} />
            <div className="grow">
              <b>{o.brand.name}</b>
              <small>{o.offerEn} · {o.offerBn}</small>
            </div>
            <span className="dist">{p.caught.has(o.id) ? '✓' : fmtDistance(o.distance)}</span>
          </li>
        ))}
        {p.items.length === 0 && <li className="none">No offers here — try zooming out.</li>}
      </ul>
    </div>
  );
}

function CollectionPanel(p: { items: Caught[]; onPick: (o: Offer) => void; onClose: () => void }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <b>My offers · {bn(p.items.length)}</b>
        <button className="icon-btn" onClick={p.onClose}>✕</button>
      </div>
      {p.items.length === 0 ? (
        <p className="none">No offers caught yet. Walk to a gift and tap it!</p>
      ) : (
        <div className="grid">
          {p.items.map((c) => (
            <button key={c.id} className="grid-item" onClick={() => p.onPick(c.offer)}>
              <Badge o={c.offer} size={52} />
              <b>{c.offer.brand.name}</b>
              <small>{c.offer.offerBn}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RevealCard({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${offer.lat},${offer.lng}`;
  return (
    <div className="reveal">
      <div className="reveal-card">
        <div className="reveal-head" style={{ background: offer.brand.color }}>
          <div className="bird" />
          <Badge o={offer} size={64} />
          <b>{offer.brand.name}</b>
        </div>
        <div className="reveal-body">
          <span className="congrats">🎉 অভিনন্দন! You unlocked</span>
          <div className="offer-val big">
            {offer.offerEn}
            <span>{offer.offerBn}</span>
          </div>
          <p>Pay with bKash at this outlet. Valid till {offer.endsAt}.</p>
          <small>📍 {offer.address}</small>
          <div className="row gap">
            <a className="btn ghost" href={dir} target="_blank" rel="noreferrer">Directions</a>
            <button className="btn" onClick={onClose}>Keep hunting</button>
          </div>
        </div>
      </div>
    </div>
  );
}
