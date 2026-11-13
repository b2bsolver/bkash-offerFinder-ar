import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

type Props = {
  full: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  /** The map itself (kept mounted in both states so MapLibre keeps its GL context). */
  children: ReactNode;
  /** Controls shown only while full screen (zoom, compass, range chip). */
  controls: ReactNode;
};

/**
 * Minimap card (top right) ⇄ full-screen map.
 * Size switches via CSS class; the change is animated FLIP-style with a CSS
 * transform, and MapView's ResizeObserver calls map.resize() for the new size.
 */
export default function MiniMap({ full, onExpand, onCollapse, children, controls }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastRect = useRef<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = el.getBoundingClientRect();
    const prev = lastRect.current;
    lastRect.current = next;
    if (!prev || !next.width || !next.height) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${prev.left - next.left}px, ${prev.top - next.top}px) scale(${prev.width / next.width}, ${prev.height / next.height})`;
    void el.offsetWidth; // flush
    const id = requestAnimationFrame(() => {
      el.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
    });
    return () => cancelAnimationFrame(id);
  }, [full]);

  // keep the stored rect fresh across rotation / window resize; Esc closes
  useEffect(() => {
    const onResize = () => { if (ref.current) lastRect.current = ref.current.getBoundingClientRect(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && full) onCollapse(); };
    addEventListener('resize', onResize);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('resize', onResize);
      removeEventListener('keydown', onKey);
    };
  }, [full, onCollapse]);

  // tap (not drag) on the minimap → expand
  const down = useRef<{ x: number; y: number } | null>(null);

  return (
    <div ref={ref} className={full ? 'mapwrap full' : 'mapwrap mini'}>
      {children}
      {full ? (
        <>
          {controls}
          <button className="round map-min" onClick={onCollapse} aria-label="Minimize map · back to AR" title="Back to AR">
            ⤡
          </button>
        </>
      ) : (
        <div
          className="mm-hit"
          role="button"
          aria-label="Expand map"
          onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
          onPointerUp={(e) => {
            const d = down.current;
            down.current = null;
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) onExpand();
          }}
          onPointerCancel={() => { down.current = null; }}
          onWheel={(e) => e.stopPropagation()}
        >
          <span className="mm-expand">⤢</span>
        </div>
      )}
    </div>
  );
}
