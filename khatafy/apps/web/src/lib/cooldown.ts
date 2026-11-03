import { useEffect, useState } from 'react';

const PREFIX = 'kh.cd.';
const read = (key: string): number => { try { return Number(sessionStorage.getItem(PREFIX + key) ?? 0) || 0; } catch { return 0; } };

/** Starts (or restarts) a cooldown for e.g. "resend verification email". Survives page reloads in the same tab. */
export function startCooldown(key: string, seconds = 60) {
  try { sessionStorage.setItem(PREFIX + key.trim().toLowerCase(), String(Date.now() + seconds * 1000)); } catch { /* ignore */ }
}

/** Seconds left on the cooldown for `key` (0 = ready). Ticks every second. */
export function useCooldown(key: string | null): number {
  const k = key ? key.trim().toLowerCase() : null;
  const calc = () => (k ? Math.max(0, Math.ceil((read(k) - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    const id = setInterval(() => setLeft(calc()), 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return left;
}
