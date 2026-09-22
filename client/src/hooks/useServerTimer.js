import { useEffect, useState } from 'react';

/**
 * Timer basado en timestamp del servidor.
 * El servidor envía { running, round, remainingMs, startedAt, durationMs, serverNow }.
 * El cliente calcula localmente el tiempo restante y corrige el desfase de reloj
 * usando serverNow (offset = serverNow - Date.now()).
 */
export function normalizeTimer(d, prev = null) {
  if (!d) return prev;
  const clockOffset = typeof d.serverNow === 'number' ? d.serverNow - Date.now() : (prev?.clockOffset || 0);
  return {
    running: !!d.running,
    round: d.round ?? prev?.round ?? 1,
    remainingMs: d.remainingMs ?? prev?.remainingMs ?? 0,
    startedAt: d.startedAt ?? null,
    durationMs: d.durationMs ?? null,
    clockOffset
  };
}

export function computeRemaining(t) {
  if (!t) return 0;
  if (!t.running || t.startedAt == null || t.durationMs == null) {
    return Math.max(0, t.remainingMs || 0);
  }
  const serverNow = Date.now() + (t.clockOffset || 0);
  return Math.max(0, t.durationMs - (serverNow - t.startedAt));
}

/**
 * Devuelve el tiempo restante (ms) recalculado localmente.
 * Sólo provoca re-render cuando cambia el valor mostrado:
 *  - hundredths=true: centésimas bajo 10s, segundos por encima (scoreboard)
 *  - hundredths=false: sólo cambios de segundo (paneles de operador/juez)
 */
export function useServerTimer(timer, { hundredths = false, tickMs } = {}) {
  const [remainingMs, setRemainingMs] = useState(() => computeRemaining(timer));

  useEffect(() => {
    setRemainingMs(computeRemaining(timer));
    if (!timer?.running) return undefined;

    const interval = tickMs ?? (hundredths ? 50 : 200);
    let lastKey = null;

    const id = setInterval(() => {
      const r = computeRemaining(timer);
      const key = hundredths && r <= 10000 ? Math.floor(r / 10) : Math.ceil(r / 1000);
      if (key !== lastKey) {
        lastKey = key;
        setRemainingMs(r);
      }
      if (r <= 0) clearInterval(id);
    }, interval);

    return () => clearInterval(id);
  }, [timer, hundredths, tickMs]);

  return remainingMs;
}
