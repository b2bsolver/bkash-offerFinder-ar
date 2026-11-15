import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../geo';
import type { Offer, WithDistance } from '../offers';
import { acquireCamera, releaseCamera } from './camera';
import { ArScene, type LookMode } from './arScene';

type Props = {
  pos: LatLng;
  offers: WithDistance[];
  /** Camera stream held (false while the map is full screen → saves battery). */
  cameraOn: boolean;
  /** Render loop running (false while covered by the map / panels). */
  running: boolean;
  onTap: (o: Offer) => void;
  onLook: (heading: number) => void;
  onMode: (m: LookMode) => void;
};

const NOCAM = new URLSearchParams(location.search).has('nocam');

/** Camera feed (or pink fallback) + persistent location-based three.js scene. */
export default function ArView(p: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const sceneRef = useRef<ArScene | null>(null);
  const cb = useRef(p);
  cb.current = p;
  const [cam, setCam] = useState<'loading' | 'on' | 'off'>(NOCAM ? 'off' : 'loading');
  const [camTry, setCamTry] = useState(0);

  // camera: shared refcounted stream; released while the map is full screen
  useEffect(() => {
    if (NOCAM || !p.cameraOn) return;
    let cancelled = false;
    acquireCamera()
      .then(async (stream) => {
        if (cancelled || !video.current) return;
        if (video.current.srcObject !== stream) video.current.srcObject = stream;
        await video.current.play().catch(() => {});
        if (!cancelled) setCam('on');
      })
      .catch(() => {
        if (!cancelled) setCam('off');
      });
    return () => {
      cancelled = true;
      releaseCamera();
    };
  }, [p.cameraOn, camTry]);

  // scene (created once)
  useEffect(() => {
    if (!host.current || !labels.current) return;
    const s = new ArScene(host.current, labels.current, {
      onTap: (o) => cb.current.onTap(o),
      onLook: (h) => cb.current.onLook(h),
      onMode: (m) => cb.current.onMode(m),
    });
    sceneRef.current = s;
    s.setPos(cb.current.pos);
    s.setOffers(cb.current.offers);
    return () => {
      s.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => { sceneRef.current?.setPos(p.pos); }, [p.pos]);
  useEffect(() => { sceneRef.current?.setOffers(p.offers); }, [p.offers]);
  useEffect(() => { sceneRef.current?.setRunning(p.running); }, [p.running]);

  const retry = () => {
    // inside the tap gesture (iOS); the effect below re-acquires the same stream
    acquireCamera().catch(() => {});
    releaseCamera();
    setCamTry((n) => n + 1);
  };

  return (
    <div className={`ar ${cam === 'on' ? 'with-cam' : 'no-cam'}`}>
      <video ref={video} className="ar-video" playsInline muted autoPlay />
      <div ref={host} className="ar-gl" />
      <div ref={labels} className="ar-labels" />
      {cam === 'off' && !NOCAM && (
        <button className="btn ar-retry" onClick={retry}>📷 Turn on camera · ক্যামেরা চালু করুন</button>
      )}
    </div>
  );
}
