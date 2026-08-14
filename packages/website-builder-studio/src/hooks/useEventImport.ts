import { useState, useCallback, useEffect, useRef } from 'react';
import type { EventDataSnapshot } from '../types';

export type ImportStatus = 'idle' | 'importing' | 'connected' | 'disconnected' | 'error';

export interface ImportResult {
  snapshot: EventDataSnapshot;
  importedAt: string;
}

export interface UseEventImportReturn {
  status: ImportStatus;
  snapshot: EventDataSnapshot | null;
  importedAt: string | null;
  disconnectedAt: string | null;
  error: string | null;
  /** Import from prop (Option C — parent already has data) */
  importFromProp: (data: EventDataSnapshot) => void;
  /** Disconnect: freeze snapshot, mark as static */
  disconnect: () => void;
  /** Reconnect: re-import from fresh prop data */
  reconnect: (data: EventDataSnapshot) => void;
  /** Reset to idle (no snapshot) */
  reset: () => void;
}

/**
 * useEventImport
 *
 * Manages the lifecycle of event data binding in the Website Builder Studio.
 *
 * Architecture (Option C):
 *   - Parent page (Organiser Portal or Command Center) passes eventSnapshot as a prop
 *   - This hook receives it via `importFromProp` and stores it locally
 *   - When `disconnect()` is called, the data becomes a static snapshot
 *   - Once disconnected, the website page has NO live dependency on the backend
 */
export function useEventImport(
  initialSnapshot?: EventDataSnapshot,
  onSnapshotChange?: (snapshot: EventDataSnapshot | null) => void,
): UseEventImportReturn {
  const [status, setStatus] = useState<ImportStatus>(
    initialSnapshot ? 'connected' : 'idle',
  );
  const [snapshot, setSnapshot] = useState<EventDataSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [importedAt, setImportedAt] = useState<string | null>(
    initialSnapshot ? new Date().toISOString() : null,
  );
  const [disconnectedAt, setDisconnectedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onChangeRef = useRef(onSnapshotChange);
  const initialSnapshotKey = initialSnapshot
    ? `${initialSnapshot.snapshotId || ''}:${initialSnapshot.snapshotCreatedAt || ''}`
    : '';
  const importedPropKeyRef = useRef(initialSnapshotKey);
  onChangeRef.current = onSnapshotChange;

  const importFromProp = useCallback((data: EventDataSnapshot) => {
    const now = new Date().toISOString();
    const enriched: EventDataSnapshot = {
      ...data,
      snapshotId: data.snapshotId || `snap_${Date.now()}`,
      snapshotCreatedAt: data.snapshotCreatedAt || now,
      disconnectedAt: undefined,
    };
    setSnapshot(enriched);
    setImportedAt(now);
    setDisconnectedAt(null);
    setStatus('connected');
    setError(null);
    onChangeRef.current?.(enriched);
  }, []);

  const disconnect = useCallback(() => {
    const now = new Date().toISOString();
    setDisconnectedAt(now);
    setStatus('disconnected');
    setSnapshot(prev => {
      if (!prev) return prev;
      const frozen = { ...prev, disconnectedAt: now };
      onChangeRef.current?.(frozen);
      return frozen;
    });
  }, []);

  const reconnect = useCallback((data: EventDataSnapshot) => {
    importFromProp(data);
  }, [importFromProp]);

  useEffect(() => {
    if (!initialSnapshot || status === 'disconnected') return;
    if (initialSnapshotKey === importedPropKeyRef.current) return;
    importedPropKeyRef.current = initialSnapshotKey;
    importFromProp(initialSnapshot);
  }, [initialSnapshot, initialSnapshotKey, importFromProp, status]);

  const reset = useCallback(() => {
    setSnapshot(null);
    setStatus('idle');
    setImportedAt(null);
    setDisconnectedAt(null);
    setError(null);
    onChangeRef.current?.(null);
  }, []);

  return {
    status,
    snapshot,
    importedAt,
    disconnectedAt,
    error,
    importFromProp,
    disconnect,
    reconnect,
    reset,
  };
}
