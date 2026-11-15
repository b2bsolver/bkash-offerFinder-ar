import { useEffect, useState } from 'react';

/** Current time, re-rendered every second while mounted. */
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function splitMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "6 December 2026" in Dhaka time. */
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' });

/** Offer-ends countdown: D / H / M / S boxes + "valid till" date (like Offer Hunt). */
export function Countdown({ end, label = 'Offer ends in', compact = false }: { end: string; label?: string; compact?: boolean }) {
  const left = Date.parse(end) - useNow();
  const t = splitMs(left);
  const urgent = left > 0 && left < 864e5;
  return (
    <div className={`cd${compact ? ' compact' : ''}${urgent ? ' urgent' : ''}`} role="timer" aria-live="off">
      {left <= 0 ? (
        <b className="cd-over">Offer ended · অফার শেষ</b>
      ) : (
        <>
          <div className="cd-lbl">{label}</div>
          <div className="cd-boxes">
            <div><b>{pad(t.d)}</b><small>days</small></div>
            <div><b>{pad(t.h)}</b><small>hours</small></div>
            <div><b>{pad(t.m)}</b><small>min</small></div>
            <div><b>{pad(t.s)}</b><small>sec</small></div>
          </div>
        </>
      )}
      <div className="cd-till">Valid till {fmtDate(end)}</div>
    </div>
  );
}

/** Short "ends in" chip for list rows, e.g. "⏳ 1d 04h"; null when more than `withinDays` away. */
export function EndsChip({ end, withinDays = 5 }: { end: string; withinDays?: number }) {
  const left = Date.parse(end) - useNow();
  if (left > withinDays * 864e5) return null;
  if (left <= 0) return <span className="ends over">Ended</span>;
  const t = splitMs(left);
  const txt = t.d ? `${t.d}d ${pad(t.h)}h` : `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
  return <span className={`ends${t.d ? '' : ' urgent'}`}>⏳ {txt}</span>;
}
