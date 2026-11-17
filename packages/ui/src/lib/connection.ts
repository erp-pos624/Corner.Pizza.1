import { useCallback, useEffect, useRef, useState } from 'react';

/** How often a healthy connection is re-confirmed while the app is open. */
const ONLINE_PING_MS = 30_000;
/** Faster retry while the offline screen is up, so it clears on its own. */
const OFFLINE_RETRY_MS = 10_000;

export interface ConnectionStatus {
  offline: boolean;
  checking: boolean;
  recheck: () => void;
}

/**
 * Tracks whether the API is actually reachable: the `online`/`offline` events
 * cover a dropped interface, and a periodic probe covers the case where Wi-Fi
 * is up but the network or server is not.
 */
export function useConnectionStatus(probe: () => Promise<boolean>): ConnectionStatus {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [checking, setChecking] = useState(false);
  const probeRef = useRef(probe);
  probeRef.current = probe;
  const mounted = useRef(true);

  const runProbe = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    let reachable = false;
    try {
      reachable = await probeRef.current();
    } catch {
      reachable = false;
    }
    if (mounted.current) {
      setOffline(!reachable);
      setChecking(false);
    }
    return reachable;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (navigator.onLine) void runProbe();
    const onOffline = (): void => setOffline(true);
    const onOnline = (): void => {
      void runProbe();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [runProbe]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runProbe();
    }, offline ? OFFLINE_RETRY_MS : ONLINE_PING_MS);
    return () => window.clearInterval(timer);
  }, [offline, runProbe]);

  // Coming back from a background tab is the most likely moment to recover.
  useEffect(() => {
    if (!offline) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void runProbe();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [offline, runProbe]);

  const recheck = useCallback((): void => {
    void runProbe();
  }, [runProbe]);

  return { offline, checking, recheck };
}
