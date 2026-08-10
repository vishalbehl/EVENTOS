import React, { useState, useCallback } from 'react';
import type { Editor } from 'grapesjs';
import type { PageConfig } from '../types';

interface MultiPageManagerProps {
  editor: Editor | null;
  pages: PageConfig[];
  activePageId: string;
  onPageChange: (pageId: string) => void;
  onPageCreate: () => void;
  onPageDelete: (pageId: string) => void;
  onPageRename: (pageId: string, newName: string) => void;
}

const PageIcon: React.FC<{ isHome: boolean }> = ({ isHome }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" style={{ width: 13, height: 13, flexShrink: 0 }}>
    {isHome
      ? <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>
      : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>
    }
  </svg>
);

/**
 * MultiPageManager
 *
 * Phase 6: Page tabs panel rendered in the sidebar.
 * - Shows all pages as tabs
 * - Handles page switching (serializes current canvas, loads target page)
 * - Create / Delete / Rename pages
 * - Marks home page with home icon
 */
export const MultiPageManager: React.FC<MultiPageManagerProps> = ({
  editor,
  pages,
  activePageId,
  onPageChange,
  onPageCreate,
  onPageDelete,
  onPageRename,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  const handlePageClick = useCallback((pageId: string) => {
    if (pageId === activePageId) return;
    onPageChange(pageId);
    setContextMenuId(null);
  }, [activePageId, onPageChange]);

  const startRename = (page: PageConfig) => {
    setRenamingId(page.id);
    setRenameValue(page.name);
    setContextMenuId(null);
  };

  const commitRename = (pageId: string) => {
    if (renameValue.trim()) {
      onPageRename(pageId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const activePage = pages.find(p => p.id === activePageId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Section title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted-foreground)' }}>Pages</span>
        <button
          onClick={onPageCreate}
          title="Add Page"
          style={{ width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)', color: 'var(--pri, var(--primary))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, lineHeight: 1 }}
        >
          +
        </button>
      </div>

      {/* Page list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pages.map(page => (
          <div key={page.id} style={{ position: 'relative' }}>
            {renamingId === page.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(page.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(page.id);
                  if (e.key === 'Escape') { setRenamingId(null); }
                }}
                style={{ width: '100%', padding: '7px 10px', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', border: '1px solid var(--pri, var(--primary))', borderRadius: 8, color: 'var(--foreground)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              />
            ) : (
              <div
                onClick={() => handlePageClick(page.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: page.id === activePageId ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  border: `1px solid ${page.id === activePageId ? 'color-mix(in srgb, var(--primary) 25%, transparent)' : 'transparent'}`,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (page.id !== activePageId) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-hover, rgba(255,255,255,0.04))'; }}
                onMouseLeave={e => { if (page.id !== activePageId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ color: page.id === activePageId ? 'var(--pri, var(--primary))' : 'var(--muted-foreground)' }}>
                  <PageIcon isHome={page.isHomePage} />
                </span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: page.id === activePageId ? 700 : 500, color: page.id === activePageId ? 'var(--foreground)' : 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {page.name}
                </span>
                {page.isHomePage && (
                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', background: 'var(--bg-surface-2, rgba(255,255,255,0.05))', padding: '2px 6px', borderRadius: 999, flexShrink: 0 }}>Home</span>
                )}
                {/* Context menu trigger */}
                <button
                  onClick={e => { e.stopPropagation(); setContextMenuId(contextMenuId === page.id ? null : page.id); }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 14, lineHeight: 1, flexShrink: 0, opacity: page.id === activePageId ? 1 : 0 }}
                  className="page-ctx-trigger"
                >
                  ⋯
                </button>
              </div>
            )}

            {/* Context Menu */}
            {contextMenuId === page.id && (
              <div
                style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: '#0f1219', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '4px', minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 4 }}
                onClick={e => e.stopPropagation()}
              >
                <button onClick={() => startRename(page)} style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--foreground)', fontSize: 12, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ✏ Rename
                </button>
                {!page.isHomePage && (
                  <button
                    onClick={() => { onPageDelete(page.id); setContextMenuId(null); }}
                    style={{ width: '100%', background: 'transparent', border: 'none', color: '#f87171', fontSize: 12, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    🗑 Delete Page
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* SEO Panel for active page */}
      {activePage && (
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted-foreground)', marginBottom: 10 }}>Page SEO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>URL Slug</label>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace' }}>
                /{activePage.slug}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>SEO Title</label>
              <div style={{ fontSize: 12, color: activePage.seoTitle ? 'var(--foreground)' : '#475569', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))', borderRadius: 6, padding: '6px 10px' }}>
                {activePage.seoTitle || '(not set)'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close context menu on outside click */}
      {contextMenuId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onClick={() => setContextMenuId(null)}
        />
      )}
    </div>
  );
};
