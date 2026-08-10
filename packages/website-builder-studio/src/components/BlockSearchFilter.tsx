import React, { useState, useEffect, useRef } from 'react';
import type { Editor } from 'grapesjs';

interface BlockSearchFilterProps {
  editor: Editor | null;
}

const CATEGORIES = [
  { id: 'all', label: 'All Components' },
  { id: 'Hero & Headers', label: 'Hero & Headers' },
  { id: 'Layout', label: 'Layout' },
  { id: 'Typography', label: 'Typography' },
  { id: 'Media', label: 'Media' },
  { id: 'Buttons', label: 'Buttons' },
  { id: 'Forms', label: 'Forms' },
  { id: 'Navigation', label: 'Navigation' },
  { id: 'Event Overview', label: 'Event Overview' },
  { id: 'Event Statistics', label: 'Event Statistics' },
  { id: 'Countdown Timers', label: 'Countdown Timers' },
  { id: 'Speakers & Committee', label: 'Speakers & Committee' },
  { id: 'Program & Agenda', label: 'Program & Agenda' },
  { id: 'Sponsors & Partners', label: 'Sponsors & Partners' },
  { id: 'Tickets & Registration', label: 'Tickets & Registration' },
  { id: 'Venue & Travel', label: 'Venue & Travel' },
  { id: 'Gallery & Media', label: 'Gallery & Media' },
  { id: 'Marketing & CTA', label: 'Marketing & CTA' },
  { id: 'Contact & Footer', label: 'Contact & Footer' },
  { id: 'Utilities', label: 'Utilities' },
];

export const BlockSearchFilter: React.FC<BlockSearchFilterProps> = ({ editor }) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // Apply filtering effect whenever query or category changes
  useEffect(() => {
    if (!editor) return;

    let observer: MutationObserver;
    let updateTimeout: ReturnType<typeof setTimeout>;

    const applyFilter = () => {
      const container = document.getElementById('gjs-blocks-container');
      if (!container) return;

      const q = query.toLowerCase().trim();
      const blockEls = container.querySelectorAll<HTMLElement>('.gjs-block');
      const categoryEls = container.querySelectorAll<HTMLElement>('.gjs-block-category');

      const visibleCategories = new Set<string>();

      blockEls.forEach(blockEl => {
        const labelEl = blockEl.querySelector('.gjs-block-label, .gjs-block-name');
        const label = labelEl?.textContent?.toLowerCase() || blockEl.title?.toLowerCase() || '';

        const categoryContainer = blockEl.closest('.gjs-block-category');
        const categoryTitle = categoryContainer 
          ? categoryContainer.querySelector('.gjs-title')?.textContent?.trim() || '' 
          : '';

        const matchesQuery = !q || label.includes(q);
        const matchesCategory = activeCategory === 'all' || categoryTitle === activeCategory;
        const visible = matchesQuery && matchesCategory;

        if (visible) {
          blockEl.classList.remove('filter-hidden');
          visibleCategories.add(categoryTitle);
        } else {
          blockEl.classList.add('filter-hidden');
        }
      });

      categoryEls.forEach(catEl => {
        const titleEl = catEl.querySelector('.gjs-title');
        const title = titleEl?.textContent?.trim() || '';
        const hasVisibleBlocks = visibleCategories.has(title);
        const matchesCategory = activeCategory === 'all' || title === activeCategory;
        
        if (matchesCategory && hasVisibleBlocks) {
          catEl.classList.remove('filter-hidden');
        } else {
          catEl.classList.add('filter-hidden');
        }
      });
    };

    // Apply initially with a short timeout to let initial render finish
    const initialTimer = setTimeout(applyFilter, 50);

    // Watch for DOM changes in case GrapesJS re-renders
    const container = document.getElementById('gjs-blocks-container');
    if (container) {
      observer = new MutationObserver(() => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(applyFilter, 10);
      });
      observer.observe(container, { childList: true, subtree: true, attributes: false });
    }

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(updateTimeout);
      if (observer) observer.disconnect();
    };
  }, [query, activeCategory, editor]);

  // Keyboard shortcut: Ctrl+F or Cmd+F focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      <style>{`
        .gjs-block.filter-hidden,
        .gjs-block-category.filter-hidden {
          display: none !important;
        }
      `}</style>
      {/* Category Dropdown */}
      <div style={{ position: 'relative' }}>
        <select
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--bg-surface-hover, rgba(255,255,255,0.04))',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
            appearance: 'none',
            cursor: 'pointer',
          }}
        >
          {CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id} style={{ background: 'var(--card)', color: '#fff' }}>
              {cat.label}
            </option>
          ))}
        </select>
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted-foreground)' }}>
          ▼
        </div>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--muted-foreground)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search components (Cmd+F)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px 8px 30px',
            background: 'var(--bg-surface-hover, rgba(255,255,255,0.04))',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--foreground)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--pri, var(--primary))'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
