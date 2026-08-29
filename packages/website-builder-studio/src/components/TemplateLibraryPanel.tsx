import React, { useMemo, useState } from 'react';
import { Search, Plus, LayoutTemplate, Boxes, ExternalLink, PackageCheck, Sparkles, Info } from 'lucide-react';
import {
  ACETERNITY_CATALOG,
  ACETERNITY_CATEGORIES,
  getAceternityBuilderAsset,
  searchWebsiteComponentAssets,
  WEBSITE_COMPONENT_ASSET_GROUPS,
  type WebsiteComponentAsset,
} from '../component-assets';
import { PREVIEW_RUNTIME_CSS } from '../core/runtime';
import { buildThemeCss } from '../plugins/themePlugin';

interface TemplateLibraryPanelProps {
  onInsert: (asset: WebsiteComponentAsset) => void;
}

function buildPreviewDocument(asset: WebsiteComponentAsset): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: ${asset.preview.background}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
    body { transform: scale(.32); transform-origin: top left; width: 312.5%; min-height: 312.5%; pointer-events: none; }
    img { max-width: 100%; }
    ${buildThemeCss({ primary: asset.preview.accent, background: asset.preview.background })}
    ${PREVIEW_RUNTIME_CSS}
  </style>
</head>
<body>${asset.html}</body>
</html>`;
}

export const TemplateLibraryPanel: React.FC<TemplateLibraryPanelProps> = ({ onInsert }) => {
  const [source, setSource] = useState<'eventos' | 'aceternity'>('eventos');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<(typeof WEBSITE_COMPONENT_ASSET_GROUPS)[number]>('All');
  const [aceternityCategory, setAceternityCategory] = useState<(typeof ACETERNITY_CATEGORIES)[number]>('All');

  const assets = useMemo(() => searchWebsiteComponentAssets(query, group), [query, group]);
  const templateCount = useMemo(() => assets.filter((asset) => asset.kind === 'template').length, [assets]);
  const aceternityAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ACETERNITY_CATALOG.filter((asset) => {
      if (aceternityCategory !== 'All' && asset.category !== aceternityCategory) return false;
      if (!normalizedQuery) return true;
      return [asset.title, asset.name, asset.description, asset.category, ...asset.dependencies]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [aceternityCategory, query]);
  const aceternityReadyCount = useMemo(
    () => aceternityAssets.filter(asset => Boolean(getAceternityBuilderAsset(asset.name))).length,
    [aceternityAssets],
  );

  return (
    <div className="wb-template-library">
      <div className="wb-template-library__source-tabs" role="tablist" aria-label="Component source">
        <button type="button" className={source === 'eventos' ? 'active' : ''} onClick={() => setSource('eventos')}>
          <LayoutTemplate size={15} /> EVENTOS
        </button>
        <button type="button" className={source === 'aceternity' ? 'active' : ''} onClick={() => setSource('aceternity')}>
          <Sparkles size={15} /> Aceternity
          <span>{ACETERNITY_CATALOG.length}</span>
        </button>
      </div>

      <div className="wb-template-library__search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={source === 'eventos' ? 'Search templates and sections' : 'Search official Aceternity source packages'}
        />
      </div>

      <div className="wb-template-library__filters" role="tablist" aria-label="Template library filters">
        {(source === 'eventos' ? WEBSITE_COMPONENT_ASSET_GROUPS : ACETERNITY_CATEGORIES).map((item) => (
          <button
            key={item}
            type="button"
            className={(source === 'eventos' ? group === item : aceternityCategory === item) ? 'active' : ''}
            onClick={() => {
              if (source === 'eventos') setGroup(item as (typeof WEBSITE_COMPONENT_ASSET_GROUPS)[number]);
              else setAceternityCategory(item as (typeof ACETERNITY_CATEGORIES)[number]);
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="wb-template-library__summary">
        {source === 'eventos' ? (
          <>
            <span><LayoutTemplate size={14} /> {templateCount} templates</span>
            <span><Boxes size={14} /> {assets.length} assets</span>
          </>
        ) : (
          <>
            <span><PackageCheck size={14} /> {aceternityAssets.length} source packages</span>
            <span>{aceternityReadyCount} fidelity reviewed</span>
          </>
        )}
      </div>

      {source === 'aceternity' && (
        <div className="wb-template-library__notice">
          <Info size={14} />
          <span>Official React source is synced locally. Only fidelity-reviewed components are insertable; the remaining packages stay searchable with their official preview and source until their exact builder renderer and settings are complete.</span>
        </div>
      )}

      <div className="wb-template-library__list">
        {source === 'eventos' && assets.map((asset) => (
          <article
            key={asset.id}
            className="wb-template-card"
            draggable={true}
            onDragStart={(e) => {
              const payload = JSON.stringify({ type: 'template', data: asset });
              e.dataTransfer.setData('application/x-eventos-builder-drag', payload);
              (window as any).__wb_dragged_item__ = { type: 'template', data: asset };
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => {
              (window as any).__wb_dragged_item__ = null;
            }}
          >
            <div className="wb-template-card__preview" style={{ background: asset.preview.background }}>
              <iframe title={`${asset.name} preview`} srcDoc={buildPreviewDocument(asset)} sandbox="" />
            </div>
            <div className="wb-template-card__body">
              <div>
                <div className="wb-template-card__meta">
                  <span>{asset.kind}</span>
                  <span style={{ background: asset.preview.accent }} />
                </div>
                <h3>{asset.name}</h3>
                <p>{asset.description}</p>
              </div>
              <button type="button" onClick={() => onInsert(asset)}>
                <Plus size={14} />
                {asset.kind === 'template' ? 'Apply site' : 'Insert'}
              </button>
            </div>
          </article>
        ))}

        {source === 'aceternity' && aceternityAssets.map((asset) => {
          const builderAsset = getAceternityBuilderAsset(asset.name);
          return (
          <article
            key={asset.id}
            className={`wb-template-card wb-template-card--aceternity ${builderAsset ? 'is-builder-ready' : ''}`}
            draggable={Boolean(builderAsset)}
            onDragStart={(e) => {
              if (!builderAsset) return;
              const payload = JSON.stringify({ type: 'template', data: builderAsset });
              e.dataTransfer.setData('application/x-eventos-builder-drag', payload);
              (window as any).__wb_dragged_item__ = { type: 'template', data: builderAsset };
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => {
              (window as any).__wb_dragged_item__ = null;
            }}
          >
            <div className="wb-template-card__image-preview">
              {builderAsset ? (
                <iframe title={`${asset.title} builder preview`} srcDoc={buildPreviewDocument(builderAsset)} sandbox="" loading="lazy" />
              ) : asset.previewUrl ? (
                <img src={asset.previewUrl} alt={asset.title} loading="lazy" />
              ) : (
                <Sparkles size={28} />
              )}
              <a href={asset.documentationUrl} target="_blank" rel="noreferrer" aria-label={`Open ${asset.title} documentation`}>
                <ExternalLink size={13} /> Official preview
              </a>
            </div>
            <div className="wb-template-card__body">
              <div>
                <div className="wb-template-card__meta">
                  <span>{asset.category}</span>
                  <span className={`wb-template-card__sync-state ${builderAsset ? 'is-ready' : ''}`}><PackageCheck size={11} /> {builderAsset ? 'Fidelity reviewed' : 'Source synced'}</span>
                </div>
                <h3>{asset.title}</h3>
                <p>{asset.description}</p>
                <div className="wb-template-card__dependencies">
                  {asset.dependencies.length > 0 ? `${asset.dependencies.length} package ${asset.dependencies.length === 1 ? 'dependency' : 'dependencies'}` : 'No package dependencies'}
                </div>
              </div>
              <div className="wb-template-card__actions">
                <a className="wb-template-card__source-link" href={asset.registryUrl} target="_blank" rel="noreferrer">
                  Source <ExternalLink size={13} />
                </a>
                {builderAsset && (
                  <button type="button" onClick={() => onInsert(builderAsset)}>
                    <Plus size={13} /> Insert
                  </button>
                )}
              </div>
            </div>
          </article>
          );
        })}

        {((source === 'eventos' && assets.length === 0) || (source === 'aceternity' && aceternityAssets.length === 0)) && (
          <div className="wb-template-library__empty">
            <Search size={18} />
            <strong>No components found</strong>
            <span>Try a broader search or another category.</span>
          </div>
        )}
      </div>
    </div>
  );
};
