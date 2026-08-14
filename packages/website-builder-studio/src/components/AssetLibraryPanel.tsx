import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Search, Upload, Shapes, Smile } from 'lucide-react';
import type { WebsiteAsset } from '../types';
import { UNDRAW_CATALOG, UNDRAW_LIBRARY_COUNT, createSvgAsset, renderUndrawSvg, type UndrawIllustration } from '../core/assetLibrary';
import { LUCIDE_ICON_NAMES, lucideIconUrl, toIconTitle } from '../core/iconLibrary';

type AssetTab = 'uploads' | 'images' | 'svg' | 'icons';

interface AssetLibraryPanelProps {
  assets: WebsiteAsset[];
  onAssetInsert: (asset: WebsiteAsset) => void;
  onAssetSave: (asset: WebsiteAsset) => Promise<WebsiteAsset> | WebsiteAsset | void;
  onSearchImages?: (query: string) => Promise<WebsiteAsset[]>;
  onUploadAsset?: (file: File) => Promise<WebsiteAsset>;
}

const tabs: { id: AssetTab; label: string; icon: React.ReactNode }[] = [
  { id: 'uploads', label: 'Uploads', icon: <Upload size={13} /> },
  { id: 'images', label: 'Images', icon: <Image size={13} /> },
  { id: 'svg', label: 'SVGs', icon: <Shapes size={13} /> },
  { id: 'icons', label: 'Icons', icon: <Smile size={13} /> },
];

const SVG_PREVIEW_LIMIT = 96;
const ICON_PREVIEW_LIMIT = 180;

const renderSvgCatalogButton = (item: UndrawIllustration, previewSvg: string | undefined, isLoading: boolean, onInsert: () => void) => (
  <button
    key={item.id}
    type="button"
    onClick={onInsert}
    {...(isLoading ? { disabled: true } : {})}
    className="text-left rounded-md border border-border bg-background hover:bg-muted/40 overflow-hidden transition-colors disabled:cursor-wait disabled:opacity-70"
    title={item.title}
  >
    <div className="h-24 bg-muted/30 flex items-center justify-center overflow-hidden">
      {previewSvg ? (
        <div className="w-full h-full p-2 [&_svg]:w-full [&_svg]:h-full [&_svg]:max-h-full" dangerouslySetInnerHTML={{ __html: previewSvg }} />
      ) : (
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-background text-primary">
        <Shapes size={24} />
      </div>
      )}
    </div>
    <div className="p-2">
      <div className="text-[11px] font-semibold text-foreground truncate">{item.title}</div>
      <div className="text-[9px] text-muted-foreground truncate">{isLoading ? 'Loading SVG...' : 'unDraw SVG'}</div>
    </div>
  </button>
);

export const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({ assets, onAssetInsert, onAssetSave, onSearchImages, onUploadAsset }) => {
  const [activeTab, setActiveTab] = useState<AssetTab>('svg');
  const [query, setQuery] = useState('');
  const [openverseResults, setOpenverseResults] = useState<WebsiteAsset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearchedImages, setHasSearchedImages] = useState(false);
  const [imageSearchError, setImageSearchError] = useState<string | null>(null);
  const [svgColor, setSvgColor] = useState('#6c63ff');
  const [iconColor, setIconColor] = useState('#6c63ff');
  const [loadingSvgId, setLoadingSvgId] = useState<string | null>(null);
  const [svgPreviews, setSvgPreviews] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSvg = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UNDRAW_CATALOG;
    return UNDRAW_CATALOG.filter(item => item.title.toLowerCase().includes(q) || item.tags.some(tag => tag.includes(q)));
  }, [query]);

  const visibleSvg = useMemo(() => filteredSvg.slice(0, SVG_PREVIEW_LIMIT), [filteredSvg]);
  const uploadedAssets = useMemo(() => assets.filter(asset => asset.source === 'upload' || asset.type === 'upload'), [assets]);
  const filteredIcons = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = q
      ? LUCIDE_ICON_NAMES.filter(name => name.includes(q) || toIconTitle(name).toLowerCase().includes(q))
      : LUCIDE_ICON_NAMES;
    return names.slice(0, ICON_PREVIEW_LIMIT);
  }, [query]);

  useEffect(() => {
    if (activeTab !== 'svg') return;
    let cancelled = false;
    const missing = visibleSvg.filter(item => !svgPreviews[`${item.exportName}:${svgColor}`]);
    if (!missing.length) return;

    void Promise.all(missing.map(async (item) => {
      try {
        const svg = await renderUndrawSvg(item, svgColor);
        return { key: `${item.exportName}:${svgColor}`, svg };
      } catch {
        return null;
      }
    })).then(results => {
      if (cancelled) return;
      const loaded = results.filter((result): result is { key: string; svg: string } => Boolean(result));
      if (!loaded.length) return;
      setSvgPreviews(current => {
        const next = { ...current };
        loaded.forEach(result => {
          next[result.key] = result.svg;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, svgColor, svgPreviews, visibleSvg]);

  const handleSvgInsert = async (item: UndrawIllustration) => {
    setLoadingSvgId(item.id);
    try {
      const asset = await createSvgAsset(item, svgColor);
      await Promise.resolve(onAssetSave(asset)).then(saved => onAssetInsert(saved || asset));
    } finally {
      setLoadingSvgId(null);
    }
  };

  const searchOpenverse = async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setHasSearchedImages(true);
    setImageSearchError(null);
    try {
      const next = onSearchImages
        ? await onSearchImages(q)
        : await fetchOpenverseImages(q);
      setOpenverseResults(next.filter(asset => Boolean(asset.url)));
    } catch (error) {
      console.error('[WebsiteBuilderStudio] Openverse image search failed:', error);
      setOpenverseResults([]);
      setImageSearchError(error instanceof Error ? error.message : 'Image search failed. Try again in a moment.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUpload = (file?: File) => {
    if (!file) return;
    if (onUploadAsset) {
      void onUploadAsset(file).then(asset => {
        void Promise.resolve(onAssetSave(asset)).then(saved => onAssetInsert(saved || asset));
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const asset: WebsiteAsset = {
        id: `upload_${Date.now()}`,
        type: file.type.includes('svg') ? 'svg' : 'upload',
        title: file.name,
        url: String(ev.target?.result || ''),
        source: 'upload',
        savedAt: new Date().toISOString(),
      };
      void Promise.resolve(onAssetSave(asset)).then(saved => onAssetInsert(saved || asset));
    };
    reader.readAsDataURL(file);
  };

  const handleIconInsert = (name: string) => {
    const asset: WebsiteAsset = {
      id: `lucide_${name}_${Date.now()}`,
      type: 'icon',
      title: toIconTitle(name),
      url: lucideIconUrl(name),
      source: 'manual',
      license: 'ISC',
      attribution: 'Lucide icon library',
      savedAt: new Date().toISOString(),
    };
    void Promise.resolve(onAssetSave(asset)).then(saved => onAssetInsert(saved || asset));
  };

  const renderAssetButton = (asset: WebsiteAsset) => (
    <button
      key={asset.id}
      type="button"
      onClick={() => void Promise.resolve(onAssetSave(asset)).then(saved => onAssetInsert(saved || asset))}
      className="text-left rounded-md border border-border bg-background hover:bg-muted/40 overflow-hidden transition-colors"
      title={asset.attribution || asset.title}
    >
      <div className="h-24 bg-muted/30 flex items-center justify-center overflow-hidden">
        {asset.svg ? (
          <div className="w-full h-full p-2 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: asset.svg }} />
        ) : asset.url ? (
          <img
            src={asset.url}
            alt={asset.title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={event => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <Image size={18} className="text-muted-foreground" />
        )}
      </div>
      <div className="p-2">
        <div className="text-[11px] font-semibold text-foreground truncate">{asset.title}</div>
        <div className="text-[9px] text-muted-foreground truncate">{asset.source || 'asset'} {asset.license ? `- ${asset.license}` : ''}</div>
      </div>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[9px] font-semibold transition-colors ${activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/40'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && activeTab === 'images') void searchOpenverse(); }}
            placeholder={activeTab === 'images' ? 'Search Openverse images...' : activeTab === 'icons' ? 'Search Lucide icons...' : 'Search assets...'}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
        {activeTab === 'images' && (
          <button type="button" onClick={searchOpenverse} {...((isSearching || !query.trim()) ? { disabled: true } : {})} className="rounded-md bg-primary px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isSearching ? '...' : 'Find'}
          </button>
        )}
      </div>

      {activeTab === 'uploads' && (
        <div className="space-y-3">
          <input ref={inputRef} type="file" accept="image/*,.svg" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} />
          <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-md border border-dashed border-border p-4 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">
            Upload image or SVG
          </button>
          <div className="grid grid-cols-2 gap-2">
            {uploadedAssets.length ? uploadedAssets.map(renderAssetButton) : (
              <div className="col-span-2 rounded-md border border-border p-4 text-center text-xs text-muted-foreground">Uploaded images will appear here with previews.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'svg' && (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span>{filteredSvg.length} of {UNDRAW_LIBRARY_COUNT} unDraw SVGs</span>
              <label className="flex items-center gap-2">Color <input type="color" value={svgColor} onChange={e => setSvgColor(e.target.value)} /></label>
            </div>
            <div className="text-[9px]">Event-related illustrations are sorted first. Search to find any illustration in the full library.</div>
            {filteredSvg.length > SVG_PREVIEW_LIMIT ? (
              <div className="mt-1 text-[9px]">Showing first {SVG_PREVIEW_LIMIT} previews. Use search to narrow the full library.</div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {visibleSvg.length ? visibleSvg.map(item => {
              return renderSvgCatalogButton(item, svgPreviews[`${item.exportName}:${svgColor}`], loadingSvgId === item.id, () => void handleSvgInsert(item));
            }) : (
              <div className="col-span-2 rounded-md border border-border p-4 text-center text-xs text-muted-foreground">No SVG illustrations match this search.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'images' && (
        <div className="space-y-2">
          {imageSearchError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {imageSearchError}
            </div>
          ) : null}
          {!hasSearchedImages && !assets.some(a => a.source === 'openverse') ? (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              Search openly licensed images with creator and source metadata.
            </div>
          ) : null}
          {hasSearchedImages && !isSearching && !imageSearchError && !openverseResults.length ? (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              No Openverse images found for this search.
            </div>
          ) : null}
          {isSearching ? (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              Searching Openverse...
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {(openverseResults.length ? openverseResults : assets.filter(a => a.source === 'openverse')).map(renderAssetButton)}
          </div>
        </div>
      )}

      {activeTab === 'icons' && (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/20 p-2 text-[10px] text-muted-foreground">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span>{LUCIDE_ICON_NAMES.length} Lucide icons</span>
              <label className="flex items-center gap-2">Color <input type="color" value={iconColor} onChange={e => setIconColor(e.target.value)} /></label>
            </div>
            <div className="text-[9px]">Search and insert icons from the full library.</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {filteredIcons.map(name => {
              const url = lucideIconUrl(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleIconInsert(name)}
                  className="min-h-[84px] rounded-md border border-border bg-background p-2 text-center hover:bg-muted/40 transition-colors"
                  title={toIconTitle(name)}
                >
                  <span
                    className="mx-auto block h-7 w-7"
                    style={{
                      backgroundColor: iconColor,
                      WebkitMask: `url("${url}") center / contain no-repeat`,
                      mask: `url("${url}") center / contain no-repeat`,
                    }}
                  />
                  <span className="mt-2 block truncate text-[10px] font-semibold text-foreground">{toIconTitle(name)}</span>
                </button>
              );
            })}
            {!filteredIcons.length ? (
              <div className="col-span-3 rounded-md border border-border p-4 text-center text-xs text-muted-foreground">No icons match this search.</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

async function fetchOpenverseImages(query: string): Promise<WebsiteAsset[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: '24',
    mature: 'false',
  });
  const response = await fetch(`https://api.openverse.org/v1/images/?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return fetchWikimediaImages(query);
  }

  const payload = await response.json() as { results?: Array<Record<string, unknown>> };
  return (payload.results || []).map((item): WebsiteAsset | null => {
    const id = String(item.id || item.url || item.foreign_landing_url || '').trim();
    const url = String(item.thumbnail || item.url || '').trim();
    if (!id || !url) return null;
    const title = String(item.title || query);
    const creator = item.creator ? String(item.creator) : undefined;
    const license = item.license ? String(item.license) : undefined;
    const sourceUrl = item.foreign_landing_url ? String(item.foreign_landing_url) : undefined;
    return {
      id: `openverse_${id}`,
      type: 'image',
      title,
      url,
      source: 'openverse',
      creator,
      license,
      attribution: [title, creator, license, sourceUrl].filter(Boolean).join(' - '),
      savedAt: new Date().toISOString(),
    };
  }).filter((asset): asset is WebsiteAsset => Boolean(asset));
}

async function fetchWikimediaImages(query: string): Promise<WebsiteAsset[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrnamespace: '6',
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '640',
    format: 'json',
    origin: '*',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Image search returned ${response.status}. Try another keyword or use Upload.`);
  }

  const payload = await response.json() as {
    query?: {
      pages?: Record<string, {
        pageid?: number;
        title?: string;
        imageinfo?: Array<{
          thumburl?: string;
          url?: string;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }>;
    };
  };

  return Object.values(payload.query?.pages || {}).map((page): WebsiteAsset | null => {
    const info = page.imageinfo?.[0];
    const url = info?.thumburl || info?.url || '';
    if (!url) return null;
    const title = String(page.title || query).replace(/^File:/, '');
    const metadata = info?.extmetadata || {};
    const creator = metadata.Artist?.value?.replace(/<[^>]+>/g, '').trim() || 'Wikimedia Commons';
    const license = metadata.LicenseShortName?.value || metadata.UsageTerms?.value || 'See source';
    return {
      id: `commons_${page.pageid || encodeURIComponent(title)}`,
      type: 'image',
      title,
      url,
      source: 'openverse',
      creator,
      license,
      attribution: [title, creator, license, info?.descriptionurl].filter(Boolean).join(' - '),
      savedAt: new Date().toISOString(),
    };
  }).filter((asset): asset is WebsiteAsset => Boolean(asset));
}
