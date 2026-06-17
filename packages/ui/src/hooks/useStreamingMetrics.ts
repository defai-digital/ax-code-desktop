import { useCallback, useSyncExternalStore } from 'react';
import { getActiveMetricsTracker, type StreamingMetrics } from '@/sync/streaming-metrics';

const DEFAULT_METRICS: StreamingMetrics = {
  prefillMs: null,
  decodeTps: 0,
  tokenCount: 0,
  totalBytes: 0,
  phase: 'idle',
  startedAt: null,
  lastDeltaAt: null,
};

/**
 * Hook to read streaming metrics (prefill latency, decode rate) for a session.
 *
 * Updates at ~1Hz for rate changes and immediately on phase transitions.
 * Returns default (idle) metrics if no tracker is active or session has no data.
 */
export function useStreamingMetrics(sessionID: string | null): StreamingMetrics {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!sessionID) return () => {};

    // Poll at ~1Hz for rate updates. Phase transitions are detected by
    // comparing the snapshot on each poll.
    const intervalId = setInterval(onStoreChange, 1000);
    return () => clearInterval(intervalId);
  }, [sessionID]);

  const getSnapshot = useCallback((): StreamingMetrics => {
    if (!sessionID) return DEFAULT_METRICS;
    const tracker = getActiveMetricsTracker();
    if (!tracker) return DEFAULT_METRICS;
    return tracker.getMetrics(sessionID);
  }, [sessionID]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
