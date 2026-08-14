import React, { useState } from 'react';
import type { EventDataSnapshot } from '../types';
import type { ImportStatus } from '../hooks/useEventImport';

interface ImportDataPanelProps {
  status: ImportStatus;
  snapshot: EventDataSnapshot | null;
  importedAt: string | null;
  disconnectedAt: string | null;
  notice?: string | null;
  /** Called when user clicks "Import Event Data" */
  onImport: () => void;
  /** Called when user clicks "Disconnect (make static)" */
  onDisconnect: () => void;
  /** Called when user clicks "Re-import / Refresh" */
  onReconnect: () => void;
}

const statusConfig: Record<ImportStatus, { color: string; bg: string; border: string; dot: string; label: string }> = {
  idle:         { color: 'var(--muted-foreground)', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', dot: '#475569', label: 'No Data Imported' },
  importing:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', dot: '#f59e0b', label: 'Importing…' },
  connected:    { color: 'var(--success)', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', dot: 'var(--success)', label: 'Connected to Event' },
  disconnected: { color: 'var(--primary)', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.2)', dot: 'var(--primary)', label: 'Static Snapshot' },
  error:        { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', dot: '#f87171', label: 'Import Error' },
};

const DataField: React.FC<{ label: string; value?: string | number; available: boolean }> = ({ label, value, available }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-surface-hover, rgba(255,255,255,0.04))' }}>
    <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>{label}</span>
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 999,
      background: available ? 'rgba(52,211,153,0.1)' : 'rgba(100,116,139,0.08)',
      color: available ? 'var(--success)' : '#475569',
      border: `1px solid ${available ? 'rgba(52,211,153,0.2)' : 'rgba(100,116,139,0.15)'}`,
    }}>
      {available ? (typeof value !== 'undefined' ? String(value) : '✓') : '—'}
    </span>
  </div>
);

/**
 * ImportDataPanel
 *
 * The Phase 4 Import Panel rendered inside the left sidebar under the "Event Data" tab.
 * Shows what data is available from the event snapshot and allows users to:
 *   - Import event data (when idle)
 *   - View what's been imported (when connected)
 *   - Disconnect to freeze the snapshot (making the page truly static)
 *   - Re-import to refresh the data (when disconnected)
 */
export const ImportDataPanel: React.FC<ImportDataPanelProps> = ({
  status,
  snapshot,
  importedAt,
  disconnectedAt,
  notice,
  onImport,
  onDisconnect,
  onReconnect,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const cfg = statusConfig[status];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
      {/* Status Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 12,
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
          boxShadow: status === 'connected' ? `0 0 6px ${cfg.dot}` : 'none',
          animation: status === 'importing' ? 'pulse 1.2s ease-in-out infinite' : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: cfg.color, lineHeight: 1.3 }}>{cfg.label}</div>
          {importedAt && (
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>
              {status === 'disconnected' ? 'Frozen' : 'Synced'} {new Date(importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '9px 12px', color: 'var(--primary)', fontSize: 11, lineHeight: 1.5, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      {/* Idle state: prompt to import */}
      {status === 'idle' && (
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.65, padding: '4px 2px' }}>
          Import your event data to pre-fill all event blocks — speaker names, agenda, sponsors, venue, and more — with a single click.
        </div>
      )}

      {/* Event Info Preview (when connected or disconnected) */}
      {snapshot && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--foreground)', marginBottom: 2, lineHeight: 1.3 }}>{snapshot.eventName}</div>
            {snapshot.venue?.city && (
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                📍 {snapshot.venue.city}, {snapshot.venue.country}
              </div>
            )}
          </div>
          <div style={{ padding: '8px 14px' }}>
            <DataField label="Speakers" value={snapshot.speakers?.length} available={!!snapshot.speakers?.length} />
            <DataField label="Sessions" value={snapshot.sessions?.length} available={!!snapshot.sessions?.length} />
            <DataField label="Sponsors" value={snapshot.sponsors?.length} available={!!snapshot.sponsors?.length} />
            <DataField label="Ticket Types" value={snapshot.ticketCategories?.length} available={!!snapshot.ticketCategories?.length} />
            <DataField label="Gallery Photos" value={snapshot.gallery?.filter(g => g.type === 'PHOTO').length} available={!!snapshot.gallery?.length} />
            <DataField label="Venue Info" available={!!snapshot.venue} />
            <DataField label="Important Dates" value={snapshot.importantDates?.length} available={!!snapshot.importantDates?.length} />
            <DataField label="Downloads" value={snapshot.downloads?.length} available={!!snapshot.downloads?.length} />
          </div>
          {showDetails && snapshot.stats && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>Statistics</div>
              {snapshot.stats.totalDelegates && <DataField label="Total Delegates" value={snapshot.stats.totalDelegates.toLocaleString()} available />}
              {snapshot.stats.totalCountries && <DataField label="Countries" value={snapshot.stats.totalCountries} available />}
            </div>
          )}
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{ width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', padding: '8px 14px', color: 'var(--muted-foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
          >
            {showDetails ? '▲ Show Less' : '▼ Show More'}
          </button>
        </div>
      )}

      {/* Disconnect warning (when connected) */}
      {status === 'connected' && (
        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>⚠ About Disconnecting</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            Once you disconnect, block content becomes a <strong style={{ color: 'var(--foreground)' }}>static snapshot</strong>. The published website will have <strong style={{ color: 'var(--foreground)' }}>zero dependency</strong> on the backend.
          </div>
        </div>
      )}

      {/* Static snapshot info (when disconnected) */}
      {status === 'disconnected' && disconnectedAt && (
        <div style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>✓ Static Snapshot Active</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
            Data frozen on {new Date(disconnectedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. This website is now fully self-contained.
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {status === 'idle' && (
          <button onClick={onImport} style={{ width: '100%', background: 'var(--pri, var(--primary))', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span>⬇</span> Import Event Data
          </button>
        )}
        {status === 'connected' && (
          <>
            <button onClick={onImport} style={{ width: '100%', background: 'var(--border-subtle, rgba(255,255,255,0.06))', color: 'var(--foreground)', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', padding: '9px 16px', borderRadius: 10, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              ↻ Refresh from Event
            </button>
            <button onClick={onDisconnect} style={{ width: '100%', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              ⚡ Disconnect (Make Static)
            </button>
          </>
        )}
        {status === 'disconnected' && (
          <button onClick={onReconnect} style={{ width: '100%', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--pri, var(--primary))', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            ↻ Re-import Event Data
          </button>
        )}
        {status === 'error' && (
          <button onClick={onImport} style={{ width: '100%', background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            ↻ Retry Import
          </button>
        )}
      </div>

      {/* Help text */}
      <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.6, padding: '0 2px' }}>
        {status === 'idle' && 'Event data is used to pre-populate blocks. It becomes static after disconnect.'}
        {status === 'connected' && 'Data is live. Blocks will use this data when you drag them to the canvas.'}
        {status === 'disconnected' && 'Your site is now a static export — safe to publish independently.'}
      </div>
    </div>
  );
};
