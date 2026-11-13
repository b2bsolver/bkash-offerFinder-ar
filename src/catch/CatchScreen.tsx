import { useEffect, useRef, useState } from 'react';
import type { Offer } from '../offers';
import { CatchScene } from './catchScene';
import { acquireCamera, releaseCamera } from './camera';

type Props = { offer: Offer; onOpened: () => void; onClose: () => void };

export default function CatchScreen({ offer, onOpened, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [left, setLeft] = useState(3);
  const [cam, setCam] = useState<'loading' | 'on' | 'off'>('loading');
  const cb = useRef({ onOpened });
  cb.current = { onOpened };

  const [camTry, setCamTry] = useState(0);

  // camera feed (shared request; retry button if it fails)
  useEffect(() => {
    if (new URLSearchParams(location.search).has('nocam')) {
      setCam('off');
      return;
    }
    let cancelled = false;
    setCam('loading');
    acquireCamera()
      .then(async (stream) => {
        if (cancelled || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => {});
        setCam('on');
      })
      .catch(() => {
        if (!cancelled) setCam('off');
      });
    return () => {
      cancelled = true;
      releaseCamera();
    };
  }, [camTry]);

  // 3D scene
  useEffect(() => {
    if (!host.current) return;
    const s = new CatchScene(host.current, offer.brand.initial, offer.brand.color, setLeft, () => cb.current.onOpened());
    return () => s.dispose();
  }, [offer]);

  return (
    <div className={`catch ${cam === 'on' ? 'with-cam' : 'no-cam'}`}>
      <video ref={video} className="catch-video" playsInline muted autoPlay />
      <div ref={host} className="catch-gl" />
      <div className="catch-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back to map">✕</button>
        <div className="catch-brand">
          <span className="dot" style={{ background: offer.brand.color }}>{offer.brand.initial}</span>
          <div>
            <b>{offer.brand.name}</b>
            <small>{offer.offerBn}</small>
          </div>
        </div>
      </div>
      <div className="catch-hint">
        {left > 0 ? (
          <>
            <b>{left === 3 ? 'Tap the gift to open it!' : `${left} more tap${left > 1 ? 's' : ''}!`}</b>
            <span>গিফটে ট্যাপ করুন · {left}</span>
          </>
        ) : (
          <b>🎉 Opening…</b>
        )}
        {cam === 'off' && <small>Camera off — showing without AR</small>}
      </div>
      {cam === 'off' && (
        <button className="btn cam-retry" onClick={() => setCamTry((n) => n + 1)}>📷 Turn on camera</button>
      )}
    </div>
  );
}
