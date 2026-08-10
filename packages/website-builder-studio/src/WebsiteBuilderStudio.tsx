import React, { useEffect, useRef, useState, useCallback } from 'react';
import grapesjs, { Editor } from 'grapesjs';
import grapesjsBlocksBasic from 'grapesjs-blocks-basic';
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Code2,
  Save,
  Rocket,
  ArrowLeft,
  Blocks,
  Layers,
  Palette,
  Eye,
  Trash2,
  Database,
  FileText,
  Type,
  Settings2,
} from 'lucide-react';
import type { WebsiteBuilderStudioProps } from './types';
import { registerAllBlocks } from './blocks';
import { applyThemePlugin } from './plugins/themePlugin';
import { useEventImport } from './hooks/useEventImport';
import './core/properties/schemas/index'; // Register all Component Manifests
import './styles/gjs-sm-theme.css'; // GrapesJS Style Manager dark theme
import { useMultiPage } from './hooks/useMultiPage';
import { ImportDataPanel } from './components/ImportDataPanel';
import { BlockSearchFilter } from './components/BlockSearchFilter';
import { MultiPageManager } from './components/MultiPageManager';
import { PropertyStudio } from './components/PropertyStudio';
import { registerComponentTypes } from './core/components/typeRegistry';

type SidebarTab = 'blocks' | 'pages' | 'layers' | 'theme' | 'import';

export const WebsiteBuilderStudio: React.FC<WebsiteBuilderStudioProps> = ({
  mode,
  initialData,
  theme,
  eventData,
  eventSnapshot: initialSnapshot,
  onSave,
  onPublish,
  onBack,
  logoUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const [activeTab, setActiveTab] = useState<SidebarTab>('blocks');
  const [inspectorTab, setInspectorTab] = useState<'content' | 'style'>('style');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [exportedCode, setExportedCode] = useState({ html: '', css: '' });
  const [editorReady, setEditorReady] = useState(false);

  // ── Phase 4: Event Import State ─────────────────────────────────────────
  const eventImport = useEventImport(initialSnapshot, (_snap) => {
    // When snapshot changes, re-register blocks with new data
    if (editorRef.current && _snap) {
      // Clear existing blocks and re-register with fresh snapshot
      editorRef.current.BlockManager.getAll().reset();
      registerAllBlocks(editorRef.current, _snap);
    }
  });

  // ── Phase 6: Multi-Page State ───────────────────────────────────────────
  const multiPage = useMultiPage(initialData);

  // ── GrapesJS Init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: '100%',
      storageManager: false,
      noticeOnUnload: false,
      panels: { defaults: [] },
      plugins: [grapesjsBlocksBasic as any],
      pluginsOpts: {
        [grapesjsBlocksBasic as unknown as string]: {
          flexGrid: true,
        },
      },
      deviceManager: {
        devices: [
          { name: 'desktop', width: '' },
          { name: 'tablet', width: '768px', widthMedia: '992px' },
          { name: 'mobile', width: '375px', widthMedia: '480px' },
        ],
      },
      blockManager: { appendTo: '#gjs-blocks-container' },
      layerManager: { appendTo: '#gjs-layers-container' },
      traitManager: { appendTo: '' },
      styleManager: {
        appendTo: '#gjs-sm-container',
        sectors: [
          {
            name: 'Typography',
            open: true,
            properties: [
              {
                name: 'Font Family', property: 'font-family', type: 'select',
                options: [
                  { id: '', name: '— Inherited —' },
                  { id: "'Inter', sans-serif", name: 'Inter' },
                  { id: "'Roboto', sans-serif", name: 'Roboto' },
                  { id: "'Outfit', sans-serif", name: 'Outfit' },
                  { id: "'Poppins', sans-serif", name: 'Poppins' },
                  { id: "'Montserrat', sans-serif", name: 'Montserrat' },
                  { id: "'Playfair Display', serif", name: 'Playfair Display' },
                  { id: "'Georgia', serif", name: 'Georgia' },
                  { id: "'JetBrains Mono', monospace", name: 'JetBrains Mono' },
                ],
              },
              { name: 'Font Size', property: 'font-size', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh', 'vw'], min: 0 },
              {
                name: 'Font Weight', property: 'font-weight', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: '300', name: 'Light' },
                  { id: '400', name: 'Normal' },
                  { id: '500', name: 'Medium' },
                  { id: '600', name: 'Semi Bold' },
                  { id: '700', name: 'Bold' },
                  { id: '800', name: 'Extra Bold' },
                  { id: '900', name: 'Black' },
                ],
              },
              { name: 'Text Color', property: 'color', type: 'color' },
              {
                name: 'Text Align', property: 'text-align', type: 'radio',
                options: [
                  { id: 'left', name: '←' },
                  { id: 'center', name: '↔' },
                  { id: 'right', name: '→' },
                  { id: 'justify', name: '≡' },
                ],
              },
              { name: 'Line Height', property: 'line-height', type: 'integer', units: ['', 'px', 'em', '%'], min: 0 },
              { name: 'Letter Spacing', property: 'letter-spacing', type: 'integer', units: ['px', 'em'], min: -10 },
              {
                name: 'Text Transform', property: 'text-transform', type: 'select',
                options: [
                  { id: '', name: '— None —' },
                  { id: 'uppercase', name: 'Uppercase' },
                  { id: 'lowercase', name: 'Lowercase' },
                  { id: 'capitalize', name: 'Capitalize' },
                ],
              },
              {
                name: 'Decoration', property: 'text-decoration', type: 'select',
                options: [
                  { id: '', name: '— None —' },
                  { id: 'underline', name: 'Underline' },
                  { id: 'line-through', name: 'Strikethrough' },
                ],
              },
            ],
          },
          {
            name: 'Spacing',
            open: false,
            properties: [
              {
                name: 'Margin', property: 'margin', type: 'composite',
                properties: [
                  { name: 'Top', property: 'margin-top', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Right', property: 'margin-right', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                  { name: 'Bottom', property: 'margin-bottom', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Left', property: 'margin-left', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                ],
              },
              {
                name: 'Padding', property: 'padding', type: 'composite',
                properties: [
                  { name: 'Top', property: 'padding-top', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Right', property: 'padding-right', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                  { name: 'Bottom', property: 'padding-bottom', type: 'integer', units: ['px', 'em', 'rem', '%', 'vh'] },
                  { name: 'Left', property: 'padding-left', type: 'integer', units: ['px', 'em', 'rem', '%'] },
                ],
              },
            ],
          },
          {
            name: 'Dimensions',
            open: false,
            properties: [
              {
                name: 'Display', property: 'display', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'block', name: 'Block' },
                  { id: 'flex', name: 'Flex' },
                  { id: 'inline-flex', name: 'Inline Flex' },
                  { id: 'grid', name: 'Grid' },
                  { id: 'inline-block', name: 'Inline Block' },
                  { id: 'none', name: 'Hidden' },
                ],
              },
              {
                name: 'Flex Direction', property: 'flex-direction', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'row', name: 'Row (Horizontal)' },
                  { id: 'row-reverse', name: 'Row Reverse' },
                  { id: 'column', name: 'Column (Vertical)' },
                  { id: 'column-reverse', name: 'Column Reverse' },
                ],
              },
              {
                name: 'Justify Content', property: 'justify-content', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'flex-start', name: 'Start' },
                  { id: 'center', name: 'Center' },
                  { id: 'flex-end', name: 'End' },
                  { id: 'space-between', name: 'Space Between' },
                  { id: 'space-around', name: 'Space Around' },
                  { id: 'space-evenly', name: 'Space Evenly' },
                ],
              },
              {
                name: 'Align Items', property: 'align-items', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'stretch', name: 'Stretch' },
                  { id: 'flex-start', name: 'Start' },
                  { id: 'center', name: 'Center' },
                  { id: 'flex-end', name: 'End' },
                  { id: 'baseline', name: 'Baseline' },
                ],
              },
              {
                name: 'Flex Wrap', property: 'flex-wrap', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'nowrap', name: 'No Wrap' },
                  { id: 'wrap', name: 'Wrap' },
                  { id: 'wrap-reverse', name: 'Wrap Reverse' },
                ],
              },
              { name: 'Gap', property: 'gap', type: 'integer', units: ['px', 'em', 'rem', '%'], min: 0 },
              { name: 'Width', property: 'width', type: 'integer', units: ['px', '%', 'em', 'rem', 'vw', 'vh'], min: 0 },
              { name: 'Height', property: 'height', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh', 'vw'], min: 0 },
              { name: 'Max Width', property: 'max-width', type: 'integer', units: ['px', '%', 'em', 'rem', 'vw'], min: 0 },
              { name: 'Min Height', property: 'min-height', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh'], min: 0 },
            ],
          },
          {
            name: 'Background',
            open: false,
            properties: [
              { name: 'Background Color', property: 'background-color', type: 'color' },
              { name: 'Background Image', property: 'background-image', type: 'text' },
              {
                name: 'Background Size', property: 'background-size', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'cover', name: 'Cover' },
                  { id: 'contain', name: 'Contain' },
                  { id: 'auto', name: 'Auto' },
                  { id: '100% 100%', name: 'Stretch' },
                ],
              },
              {
                name: 'Background Position', property: 'background-position', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'center center', name: 'Center' },
                  { id: 'top center', name: 'Top Center' },
                  { id: 'top left', name: 'Top Left' },
                  { id: 'top right', name: 'Top Right' },
                  { id: 'bottom center', name: 'Bottom Center' },
                ],
              },
              {
                name: 'Background Repeat', property: 'background-repeat', type: 'select',
                options: [
                  { id: 'no-repeat', name: 'No Repeat' },
                  { id: 'repeat', name: 'Repeat' },
                  { id: 'repeat-x', name: 'Repeat X' },
                  { id: 'repeat-y', name: 'Repeat Y' },
                ],
              },
            ],
          },
          {
            name: 'Border',
            open: false,
            properties: [
              {
                name: 'Border Style', property: 'border-style', type: 'select',
                options: [
                  { id: '', name: '— None —' },
                  { id: 'solid', name: 'Solid' },
                  { id: 'dashed', name: 'Dashed' },
                  { id: 'dotted', name: 'Dotted' },
                  { id: 'double', name: 'Double' },
                ],
              },
              { name: 'Border Width', property: 'border-width', type: 'integer', units: ['px'], min: 0 },
              { name: 'Border Color', property: 'border-color', type: 'color' },
              { name: 'Border Radius', property: 'border-radius', type: 'integer', units: ['px', '%'], min: 0 },
              { name: 'Box Shadow', property: 'box-shadow', type: 'text' },
            ],
          },
          {
            name: 'Effects',
            open: false,
            properties: [
              { name: 'Opacity', property: 'opacity', type: 'slider', min: 0, max: 1, step: 0.01 },
              { name: 'Transform', property: 'transform', type: 'text' },
              { name: 'Transition', property: 'transition', type: 'text' },
              { name: 'Filter', property: 'filter', type: 'text' },
              {
                name: 'Mix Blend Mode', property: 'mix-blend-mode', type: 'select',
                options: [
                  { id: '', name: '— Normal —' },
                  { id: 'multiply', name: 'Multiply' },
                  { id: 'screen', name: 'Screen' },
                  { id: 'overlay', name: 'Overlay' },
                  { id: 'darken', name: 'Darken' },
                  { id: 'lighten', name: 'Lighten' },
                  { id: 'color-dodge', name: 'Color Dodge' },
                ],
              },
              { name: 'Cursor', property: 'cursor', type: 'select', options: [
                { id: 'default', name: 'Default' }, { id: 'pointer', name: 'Pointer' },
                { id: 'not-allowed', name: 'Not Allowed' }, { id: 'grab', name: 'Grab' },
              ]},
            ],
          },
          {
            name: 'Position',
            open: false,
            properties: [
              {
                name: 'Position', property: 'position', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'static', name: 'Static' },
                  { id: 'relative', name: 'Relative' },
                  { id: 'absolute', name: 'Absolute' },
                  { id: 'fixed', name: 'Fixed' },
                  { id: 'sticky', name: 'Sticky' },
                ],
              },
              { name: 'Top', property: 'top', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh'] },
              { name: 'Right', property: 'right', type: 'integer', units: ['px', '%', 'em', 'rem'] },
              { name: 'Bottom', property: 'bottom', type: 'integer', units: ['px', '%', 'em', 'rem', 'vh'] },
              { name: 'Left', property: 'left', type: 'integer', units: ['px', '%', 'em', 'rem'] },
              { name: 'Z-Index', property: 'z-index', type: 'integer' },
              {
                name: 'Overflow', property: 'overflow', type: 'select',
                options: [
                  { id: '', name: '— Default —' },
                  { id: 'visible', name: 'Visible' },
                  { id: 'hidden', name: 'Hidden' },
                  { id: 'auto', name: 'Auto (Scroll)' },
                  { id: 'scroll', name: 'Always Scroll' },
                ],
              },
            ],
          },
        ],
      },
    });

    editorRef.current = editor;

    // Register all custom component types first
    registerComponentTypes(editor);

    // Register all blocks (with snapshot if available)
    registerAllBlocks(editor, eventImport.snapshot || undefined);
    applyThemePlugin(editor, theme);

    // Load initial page content (home page)
    const homePage = multiPage.pages.find(p => p.isHomePage) || multiPage.pages[0];
    if (homePage?.components) {
      editor.setComponents(homePage.components as string);
    } else if (homePage?.html) {
      editor.setComponents(homePage.html);
    } else {
      // Default starter canvas
      editor.setComponents(`
        <section style="position: relative; min-height: 85vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--background) 0%, var(--background) 50%, var(--background) 100%); color: var(--foreground); padding: 80px 24px; text-align: center; overflow: hidden; box-sizing: border-box;">
          <div style="position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(99,102,241,0.2) 0%, transparent 70%); pointer-events: none;"></div>
          <div style="position: relative; max-width: 900px; margin: 0 auto;">
            <div style="display: inline-flex; align-items: center; gap: 8px; background: var(--border); border: 1px solid var(--border-strong, rgba(255,255,255,0.15)); padding: 8px 18px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--primary); margin-bottom: 24px;">
              <span>📅 ${eventData?.eventDates || 'October 24–26, 2026'}</span>
              <span>•</span>
              <span>📍 ${eventData?.location || 'Your Event Location'}</span>
            </div>
            <h1 style="font-size: clamp(36px, 6vw, 64px); font-weight: 900; line-height: 1.1; margin: 0 0 20px 0; letter-spacing: -0.02em; background: linear-gradient(135deg, var(--foreground), var(--primary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
              ${eventData?.eventName || 'Your Event Name'}
            </h1>
            <p style="font-size: 20px; color: var(--muted-foreground); max-width: 680px; margin: 0 auto 36px auto; line-height: 1.65;">
              Drag &amp; drop section blocks from the left sidebar to build your custom event landing page.
            </p>
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--foreground); padding: 16px 36px; border-radius: 12px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 12px 28px color-mix(in srgb, var(--primary) 35%, transparent);">
              Register Now
            </a>
          </div>
        </section>
      `);
    }
    if (homePage?.styles) editor.setStyle(homePage.styles as string);
    else if (homePage?.css) editor.setStyle(homePage.css);

    editor.on('load', () => {
      setEditorReady(true);
      
      // Dynamic Style Sectors based on selected component
      editor.on('component:selected', (model) => {
        // We no longer rely on GrapesJS style manager classes to show/hide sectors.
        // PropertyStudio (React) handles this now via component schemas.
      });
    });

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Device Switcher ─────────────────────────────────────────────────────
  const handleDeviceChange = (d: 'desktop' | 'tablet' | 'mobile') => {
    setDevice(d);
    editorRef.current?.setDevice(d);
  };

  // ── Action Handlers ─────────────────────────────────────────────────────
  const handleUndo = () => editorRef.current?.UndoManager.undo();
  const handleRedo = () => editorRef.current?.UndoManager.redo();
  const handleClear = () => {
    if (window.confirm('Clear the canvas? This cannot be undone.')) {
      editorRef.current?.setComponents('');
    }
  };

  const handleTogglePreview = () => {
    if (!editorRef.current) return;
    if (isPreview) {
      editorRef.current.stopCommand('core:preview');
    } else {
      editorRef.current.runCommand('core:preview');
    }
    setIsPreview(!isPreview);
  };

  const handleViewCode = () => {
    if (!editorRef.current) return;
    setExportedCode({ html: editorRef.current.getHtml(), css: editorRef.current.getCss() || '' });
    setCodeModalOpen(true);
  };

  const handleSaveDraft = useCallback(async () => {
    if (!onSave) return;
    try {
      setIsSaving(true);
      const data = multiPage.buildProjectData(editorRef.current);
      await onSave(data);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, multiPage]);

  const handlePublishClick = useCallback(async () => {
    if (!onPublish) return;
    try {
      setIsSaving(true);
      const data = multiPage.buildProjectData(editorRef.current);
      await onPublish(data);
    } finally {
      setIsSaving(false);
    }
  }, [onPublish, multiPage]);

  // ── Import Panel handlers ────────────────────────────────────────────────
  const handleImport = useCallback(() => {
    if (initialSnapshot) {
      eventImport.importFromProp(initialSnapshot);
    }
  }, [initialSnapshot, eventImport]);

  const handleDisconnect = useCallback(() => {
    eventImport.disconnect();
  }, [eventImport]);

  const handleReconnect = useCallback(() => {
    if (initialSnapshot) {
      eventImport.reconnect(initialSnapshot);
    }
  }, [initialSnapshot, eventImport]);

  // ── Sidebar Tab Config ───────────────────────────────────────────────────
  const tabs: { id: SidebarTab; icon: React.ReactNode; label: string; show: boolean }[] = [
    { id: 'blocks', icon: <Blocks size={14} />, label: 'Blocks', show: true },
    { id: 'pages', icon: <FileText size={14} />, label: 'Pages', show: true },
    { id: 'layers', icon: <Layers size={14} />, label: 'Layers', show: true },
    { id: 'import', icon: <Database size={14} />, label: 'Event', show: mode === 'ORGANIZER_TENANT' || !!initialSnapshot },
    { id: 'theme', icon: <Palette size={14} />, label: 'Theme', show: true },
  ];

  return (
    <div className="gjs-studio-wrapper">
      {/* ── Top Navigation Header ─────────────────────────────────────────── */}
      <header className="gjs-studio-header">
        <div className="gjs-studio-brand">
          {onBack && (
            <button onClick={onBack} className="gjs-action-btn gjs-action-btn-secondary" title="Back">
              <ArrowLeft size={16} />
            </button>
          )}
          {logoUrl
            ? <img src={logoUrl} alt="Logo" style={{ height: 28 }} />
            : <span style={{ color: 'var(--primary)', fontWeight: 800 }}>EVENTOS</span>
          }
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-foreground)' }}>Website Builder</span>
          <span className={`gjs-studio-badge ${mode === 'GLOBAL_ADMIN' ? 'gjs-studio-badge-admin' : 'gjs-studio-badge-tenant'}`}>
            {mode === 'GLOBAL_ADMIN' ? 'Global Admin' : 'Organizer Studio'}
          </span>
          {/* Active page indicator */}
          {multiPage.pages.length > 1 && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', background: 'var(--bg-surface-hover, rgba(255,255,255,0.04))', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 999 }}>
              📄 {multiPage.activePage?.name || 'Home'}
            </span>
          )}
          {/* Import status dot */}
          {eventImport.status === 'connected' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)', display: 'inline-block' }} title="Event data connected" />
          )}
          {eventImport.status === 'disconnected' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} title="Static snapshot" />
          )}
        </div>

        {/* Viewport Device Switcher */}
        <div className="gjs-studio-devices">
          {(['desktop', 'tablet', 'mobile'] as const).map((d, i) => (
            <button
              key={d}
              className={`gjs-device-btn ${device === d ? 'active' : ''}`}
              onClick={() => handleDeviceChange(d)}
            >
              {i === 0 ? <Monitor size={14} /> : i === 1 ? <Tablet size={14} /> : <Smartphone size={14} />}
              <span>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="gjs-studio-actions">
          <button onClick={handleUndo} className="gjs-action-btn gjs-action-btn-secondary" title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
          <button onClick={handleRedo} className="gjs-action-btn gjs-action-btn-secondary" title="Redo (Ctrl+Y)"><Redo2 size={15} /></button>
          <button onClick={handleClear} className="gjs-action-btn gjs-action-btn-secondary" title="Clear Canvas"><Trash2 size={15} /></button>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button onClick={handleTogglePreview} className="gjs-action-btn gjs-action-btn-secondary">
            <Eye size={15} /> {isPreview ? 'Exit' : 'Preview'}
          </button>
          <button onClick={handleViewCode} className="gjs-action-btn gjs-action-btn-secondary">
            <Code2 size={15} /> Export
          </button>
          {onSave && (
            <button onClick={handleSaveDraft} disabled={isSaving} className="gjs-action-btn gjs-action-btn-secondary">
              <Save size={15} /> {isSaving ? 'Saving…' : 'Save Draft'}
            </button>
          )}
          {onPublish && (
            <button onClick={handlePublishClick} disabled={isSaving} className="gjs-action-btn gjs-action-btn-primary">
              <Rocket size={15} /> Publish
            </button>
          )}
        </div>
      </header>

      {/* ── Main Studio Body ──────────────────────────────────────────────── */}
      <div className="gjs-studio-body">

        {/* Left Sidebar */}
        <aside className="gjs-studio-sidebar">
          {/* Tab bar */}
          <div className="gjs-sidebar-tabs">
            {tabs.filter(t => t.show).map(tab => (
              <button
                key={tab.id}
                className={`gjs-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
              >
                {tab.icon}
                <span style={{ fontSize: 10 }}>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="gjs-sidebar-content">
            {/* ── BLOCKS TAB ─────────────────────────────────────────────── */}
            <div style={{ display: activeTab === 'blocks' ? 'block' : 'none' }}>
              <BlockSearchFilter editor={editorReady ? editorRef.current : null} />
              <div id="gjs-blocks-container" />
            </div>

            {/* ── PAGES TAB ──────────────────────────────────────────────── */}
            {activeTab === 'pages' && (
              <MultiPageManager
                editor={editorRef.current}
                pages={multiPage.pages}
                activePageId={multiPage.activePageId}
                onPageChange={(id) => multiPage.switchPage(id, editorRef.current)}
                onPageCreate={() => multiPage.createPage()}
                onPageDelete={(id) => multiPage.deletePage(id)}
                onPageRename={(id, name) => multiPage.renamePage(id, name)}
              />
            )}

            {/* ── LAYERS TAB ─────────────────────────────────────────────── */}
            <div id="gjs-layers-container" style={{ display: activeTab === 'layers' ? 'block' : 'none' }} />

            {/* ── IMPORT TAB ─────────────────────────────────────────────── */}
            {activeTab === 'import' && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted-foreground)', margin: '0 0 12px 0' }}>
                  Event Data Binding
                </p>
                <ImportDataPanel
                  status={eventImport.status}
                  snapshot={eventImport.snapshot}
                  importedAt={eventImport.importedAt}
                  disconnectedAt={eventImport.disconnectedAt}
                  onImport={handleImport}
                  onDisconnect={handleDisconnect}
                  onReconnect={handleReconnect}
                />
              </div>
            )}

            {/* ── THEME TAB ──────────────────────────────────────────────── */}
            {activeTab === 'theme' && (
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted-foreground)', margin: '0 0 16px 0' }}>
                  Brand Theme
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Primary Color', value: theme?.primary || 'var(--primary)' },
                    { label: 'Secondary', value: theme?.secondary || '#f43f5e' },
                    { label: 'Background', value: theme?.background || 'var(--background)' },
                    { label: 'Surface', value: theme?.surface || 'var(--card)' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bg-surface-hover, rgba(255,255,255,0.04))' }}>
                      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{value}</span>
                        <span style={{ width: 22, height: 22, borderRadius: 6, background: value, border: '1px solid var(--border-strong, rgba(255,255,255,0.15))', display: 'inline-block' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid color-mix(in srgb, var(--primary) 15%, transparent)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>ℹ Theme Sync</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
                    Colors are injected as CSS variables into the canvas. All blocks use <code style={{ color: 'var(--primary)' }}>var(--pri)</code>, <code style={{ color: 'var(--primary)' }}>var(--sec)</code> tokens and will automatically match your brand palette.
                  </div>
                </div>
                {(theme?.fontHeading || theme?.fontBody) && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {theme.fontHeading && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Heading Font</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', fontFamily: theme.fontHeading }}>{theme.fontHeading}</span>
                      </div>
                    )}
                    {theme.fontBody && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Body Font</span>
                        <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontFamily: theme.fontBody }}>{theme.fontBody}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Center Canvas */}
        <main className="gjs-studio-canvas-container">
          <div ref={containerRef} id="gjs-canvas" />
        </main>

        {/* Right Inspector Sidebar */}
        <aside className="gjs-studio-inspector flex flex-col h-full bg-card border-l border-white/5 relative z-10 w-[300px] flex-shrink-0">
          {/* Inspector Header + Tabs */}
          <div className="flex-shrink-0 border-b border-white/5">
            <div className="px-4 py-2.5 flex items-center justify-between bg-background/50">
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">Inspector</h3>
            </div>
            {/* Content / Style tab toggle */}
            <div className="flex bg-background/30">
              <button
                onClick={() => setInspectorTab('content')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                  inspectorTab === 'content'
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Settings2 className="w-3 h-3" />
                Content
              </button>
              <button
                onClick={() => setInspectorTab('style')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                  inspectorTab === 'style'
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Type className="w-3 h-3" />
                Style
              </button>
            </div>
          </div>

          {/* Inspector Body */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {/* CONTENT tab — custom React PropertyStudio */}
            <div
              className="absolute inset-0 overflow-y-auto"
              style={{ display: inspectorTab === 'content' ? 'block' : 'none' }}
            >
              <PropertyStudio editor={editorRef.current} />
            </div>

            {/* STYLE tab — native GrapesJS Style Manager */}
            <div
              id="gjs-sm-container"
              className="absolute inset-0 overflow-y-auto"
              style={{ display: inspectorTab === 'style' ? 'block' : 'none' }}
            />
          </div>
        </aside>
      </div>

      {/* ── Code Export Modal ─────────────────────────────────────────────── */}
      {codeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 24 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border-strong, rgba(255,255,255,0.15))', borderRadius: 20, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: 18, fontWeight: 800 }}>Export Code</h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                  Page: <strong style={{ color: 'var(--muted-foreground)' }}>{multiPage.activePage?.name}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(`<!DOCTYPE html>\n<html>\n<head><style>${exportedCode.css}</style></head>\n<body>${exportedCode.html}</body>\n</html>`)}
                  style={{ background: 'color-mix(in srgb, var(--primary) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)', color: 'var(--primary)', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Copy All
                </button>
                <button onClick={() => setCodeModalOpen(false)} style={{ background: 'var(--border-subtle, rgba(255,255,255,0.06))', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', color: 'var(--muted-foreground)', padding: '8px 14px', borderRadius: 8, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ color: 'var(--primary)', margin: 0, fontSize: 13, fontWeight: 700 }}>HTML Output</h4>
                  <button onClick={() => navigator.clipboard.writeText(exportedCode.html)} style={{ background: 'transparent', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', color: 'var(--muted-foreground)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                </div>
                <textarea readOnly value={exportedCode.html} style={{ width: '100%', height: 200, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, boxSizing: 'border-box', resize: 'none' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ color: 'var(--primary)', margin: 0, fontSize: 13, fontWeight: 700 }}>CSS Styles</h4>
                  <button onClick={() => navigator.clipboard.writeText(exportedCode.css)} style={{ background: 'transparent', border: '1px solid var(--border-default, rgba(255,255,255,0.1))', color: 'var(--muted-foreground)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                </div>
                <textarea readOnly value={exportedCode.css} style={{ width: '100%', height: 160, background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, boxSizing: 'border-box', resize: 'none' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
