/**
 * One shared camera request. Prevents two overlapping getUserMedia calls
 * (React StrictMode runs effects twice in dev) from cancelling each other
 * while the browser permission prompt is open.
 */
let pending: Promise<MediaStream> | null = null;
let users = 0;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

export function acquireCamera(): Promise<MediaStream> {
  clearTimeout(stopTimer);
  users++;
  if (!pending) {
    pending = navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    pending.catch((e) => {
      console.warn('[camera]', e?.name, e?.message);
      pending = null;
    });
  }
  return pending;
}

export function releaseCamera() {
  users = Math.max(0, users - 1);
  if (users > 0 || !pending) return;
  const p = pending;
  // small delay so an immediate re-mount reuses the same stream
  stopTimer = setTimeout(() => {
    if (users === 0 && pending === p) {
      pending = null;
      p.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
    }
  }, 400);
}
