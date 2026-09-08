'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { WebsiteAsset, WebsiteProjectData, EventDataSnapshot, WebsiteBuilderStudioProps, WebsitePublishOptions } from '@eventos/website-builder-studio/studio';
import { eventWebsiteBuilder, type WebsiteDeploymentRecord, type WebsiteDraftRecord, type WebsiteEditorSessionRecord, type WebsiteRevisionSummary } from '@/services/website-builder-service';

// Dynamically import WebsiteBuilderStudio with SSR disabled for GrapesJS DOM compatibility
const WebsiteBuilderStudio = dynamic<WebsiteBuilderStudioProps>(
  () => import('@eventos/website-builder-studio/studio').then((mod) => mod.WebsiteBuilderStudio),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-screen flex items-center justify-center bg-[#080912] text-white">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="ml-3 font-semibold text-slate-300">Initializing GrapesJS Website Studio...</span>
      </div>
    ),
  }
);

export default function OrganiserWebsiteBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<WebsiteDraftRecord | null>(null);
  const [deployment, setDeployment] = useState<WebsiteDeploymentRecord | null>(null);
  const [revisions, setRevisions] = useState<WebsiteRevisionSummary[]>([]);
  const [editorSession, setEditorSession] = useState<WebsiteEditorSessionRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<WebsiteProjectData | undefined>(undefined);
  const [portalReady, setPortalReady] = useState(false);
  const draftVersionRef = useRef<number>(1);

  useEffect(() => {
    setPortalReady(true);
  }, []);
  const [eventSnapshot, setEventSnapshot] = useState<EventDataSnapshot>({
    eventName: 'Annual Innovation Summit 2026',
    startDate: '2026-10-24T10:00:00Z',
    endDate: '2026-10-26T18:00:00Z',
    snapshotId: `snap-${Date.now()}`,
    snapshotCreatedAt: new Date().toISOString(),
    venue: {
      name: 'Grand Tech Convention Center',
      address: '123 Tech Blvd',
      city: 'San Francisco',
      country: 'USA',
    },
    speakers: [
      { id: 'spk1', name: 'Dr. Jane Smith', designation: 'AI Researcher', speakerType: 'KEYNOTE', photo: 'https://i.pravatar.cc/150?u=jane' },
      { id: 'spk2', name: 'John Doe', designation: 'CTO', speakerType: 'INVITED', photo: 'https://i.pravatar.cc/150?u=john' },
    ],
    sessions: [
      { id: 'sess1', title: 'Future of Tech', date: '2026-10-24', startTime: '10:00', endTime: '11:00', sessionType: 'KEYNOTE', track: 'Main Track', speakerIds: ['spk1'] },
    ],
    sponsors: [
      { id: 'spo1', name: 'TechCorp', tier: 'PLATINUM', logoUrl: 'https://ui-avatars.com/api/?name=TC&background=random' },
    ],
    ticketCategories: [
      { id: 't1', name: 'Standard', price: 299, currency: 'USD', benefits: ['Full Access'] },
    ],
    importantDates: [
      { id: 'd1', label: 'Early Bird Ends', date: '2026-09-01', type: 'EARLY_BIRD' },
    ],
    stats: { totalDelegates: 1200, totalCountries: 15 },
  });

  useEffect(() => {
    let mounted = true;

    async function loadWebsiteDraft() {
      if (!eventId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const record = await eventWebsiteBuilder.getDraft(eventId);
        if (!mounted) return;
        draftVersionRef.current = record.version;
        setDraft(record);
        setInitialData({
          id: record.site_id,
          publishSlug: record.site_slug,
          name: record.document.site.siteName || 'Event website',
          document: record.document,
          siteSettings: record.document.site,
          assets: record.document.assets,
          theme: record.document.tokens.theme,
          updatedAt: record.updated_at,
        });
        try {
          const snapshot = await eventWebsiteBuilder.fetchEventSnapshot(eventId);
          if (mounted) setEventSnapshot(snapshot);
        } catch (snapshotError) {
          console.warn('[Organiser Portal] Event snapshot unavailable; using the visible mock fallback.', snapshotError);
        }
        try {
          const activeDeployment = await eventWebsiteBuilder.getCurrentDeployment(eventId);
          if (mounted) setDeployment(activeDeployment);
        } catch {
          if (mounted) setDeployment(null);
        }
        try {
          const history = await eventWebsiteBuilder.listRevisions(eventId);
          if (mounted) setRevisions(history);
        } catch {
          if (mounted) setRevisions([]);
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[Organiser Portal] Failed to load website draft:', error);
        setLoadError('Draft could not be loaded from the server. Editing with local mock data until the connection is restored.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadWebsiteDraft();
    return () => {
      mounted = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let mounted = true;

    const heartbeat = async () => {
      try {
        const session = await eventWebsiteBuilder.acquireEditorSession(eventId);
        if (mounted) setEditorSession(session);
      } catch (error) {
        console.error('[Organiser Portal] Website editor lease failed:', error);
        if (mounted) setEditorSession(null);
      }
    };

    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 20_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      void eventWebsiteBuilder.releaseEditorSession(eventId).catch(() => undefined);
    };
  }, [eventId]);

  const handleSave = async (data: WebsiteProjectData) => {
    if (editorSession?.mode !== 'EDITOR') throw new Error('This website is open in read-only mode.');
    if (!data.document) {
      throw new Error('Website document was not generated by the studio.');
    }
    let saved: WebsiteDraftRecord;
    try {
      saved = await eventWebsiteBuilder.saveDraft(eventId, draftVersionRef.current || draft?.version || 1, data.document);
    } catch (error) {
      if ((error as { code?: string }).code !== 'WEBSITE_DRAFT_CONFLICT') throw error;

      const latest = await eventWebsiteBuilder.getDraft(eventId);
      draftVersionRef.current = latest.version;
      saved = await eventWebsiteBuilder.saveDraft(eventId, latest.version, data.document);
    }
    draftVersionRef.current = saved.version;
    setDraft(saved);
    setInitialData({
      id: saved.site_id,
      publishSlug: saved.site_slug,
      name: saved.document.site.siteName || 'Event website',
      document: saved.document,
      siteSettings: saved.document.site,
      assets: saved.document.assets,
      theme: saved.document.tokens.theme,
      updatedAt: saved.updated_at,
    });
  };

  const handlePublish = async (data: WebsiteProjectData, options: WebsitePublishOptions) => {
    if (editorSession?.mode !== 'EDITOR') throw new Error('This website is open in read-only mode.');
    if (!data.document) {
      throw new Error('Website document was not generated by the studio.');
    }
    const validation = await eventWebsiteBuilder.validate(eventId, data.document);
    if (!validation.valid) {
      alert('Publish validation failed. Fix the website diagnostics before publishing.');
      return;
    }
    await handleSave(data);
    const publishedDeployment = await eventWebsiteBuilder.publish(eventId, options);
    setDeployment(publishedDeployment);
    setRevisions(await eventWebsiteBuilder.listRevisions(eventId));
    alert(`Website published as deployment ${publishedDeployment.deployment_id}.`);
  };

  const handleCreatePreview = async (data: WebsiteProjectData, previewId?: string) => {
    if (!data.document) throw new Error('Website document was not generated by the studio.');
    const preview = await eventWebsiteBuilder.createPreview(eventId, data.document, previewId);
    return { previewId: preview.preview_id, url: preview.url, expiresAt: preview.expires_at };
  };

  const handleFetchEventData = async () => {
    const snapshot = await eventWebsiteBuilder.fetchEventSnapshot(eventId);
    setEventSnapshot(snapshot);
    return snapshot;
  };

  const handleSearchImages = async (query: string): Promise<WebsiteAsset[]> => {
    const results = await eventWebsiteBuilder.searchOpenverse(eventId, query);
    return results.map((item): WebsiteAsset => ({
      id: `openverse_${item.id}`,
      type: 'image',
      title: item.title,
      url: item.thumbnail || item.url || undefined,
      source: 'openverse',
      creator: item.creator || undefined,
      license: item.license || undefined,
      attribution: item.attribution || undefined,
      savedAt: new Date().toISOString(),
    }));
  };

  const handlePersistAsset = async (asset: WebsiteAsset): Promise<WebsiteAsset> => {
    const saved = await eventWebsiteBuilder.saveAsset(eventId, asset);
    return {
      ...asset,
      id: saved.id,
      source: (saved.source as WebsiteAsset['source']) || asset.source,
      url: saved.url || asset.url,
      creator: saved.creator || asset.creator,
      license: saved.license || asset.license,
      attribution: saved.attribution || asset.attribution,
      savedAt: saved.created_at,
    };
  };

  const handleUploadAsset = async (file: File): Promise<WebsiteAsset> => {
    const saved = await eventWebsiteBuilder.uploadAsset(eventId, file);
    return {
      id: saved.id,
      type: saved.kind === 'svg' ? 'svg' : 'image',
      title: String(saved.metadata.title || file.name),
      url: saved.url || undefined,
      source: 'upload',
      creator: saved.creator || undefined,
      license: saved.license || undefined,
      attribution: saved.attribution || undefined,
      savedAt: saved.created_at,
    };
  };

  const handleRollback = async (revisionId: string) => {
    const rolledBack = await eventWebsiteBuilder.rollback(eventId, revisionId);
    setDeployment(rolledBack);
    setRevisions(await eventWebsiteBuilder.listRevisions(eventId));
    alert(`Website rolled back to revision ${revisionId}.`);
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#080912] text-white">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="ml-3 font-semibold text-slate-300">Loading website draft...</span>
      </div>
    );
  }

  if (!portalReady) return null;

  // Keep the studio inside the dashboard content card so its rounded frame,
  // scroll boundary, and available height remain owned by the organiser shell.
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#080912]">
      {loadError ? (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100">
          {loadError}
        </div>
      ) : null}
      {editorSession?.mode === 'VIEWER' ? (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-100">
          Read-only session. Another editor currently holds the editing lease; this view will become editable when the lease is released.
        </div>
      ) : null}
      {deployment ? (
        <div className="flex items-center justify-between gap-3 border-b border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-100">
          <span className="uppercase tracking-wide">
            Published deployment active: {deployment.deployment_id} - {deployment.activated_at || 'activation pending'}
          </span>
          {deployment.public_url ? (
            <a
              href={deployment.public_url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-emerald-300/30 px-2 py-1 text-xs normal-case text-emerald-50 hover:bg-emerald-300/10"
            >
              Open live site
            </a>
          ) : null}
          {revisions.length ? (
            <select
              className="max-w-xs rounded border border-emerald-300/30 bg-[#080912] px-2 py-1 text-xs normal-case text-white"
              defaultValue=""
              onChange={(event) => {
                const revisionId = event.target.value;
                event.target.value = "";
                if (revisionId) handleRollback(revisionId);
              }}
            >
              <option value="">Rollback to revision...</option>
              {revisions.map((revision) => (
                <option key={revision.revision_id} value={revision.revision_id}>
                  #{revision.revision_number} {revision.reason} - {new Date(revision.created_at).toLocaleString()}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
      <WebsiteBuilderStudio
        mode="ORGANIZER_TENANT"
        initialData={initialData}
        eventSnapshot={eventSnapshot}
        eventId={eventId}
        onFetchEventData={handleFetchEventData}
        onSearchImages={handleSearchImages}
        onPersistAsset={handlePersistAsset}
        onUploadAsset={handleUploadAsset}
        onSave={handleSave}
        onPublish={handlePublish}
        onCreatePreview={handleCreatePreview}
        onBack={handleBack}
        readOnly={!editorSession || editorSession.mode !== 'EDITOR'}
      />
    </div>
  );
}
