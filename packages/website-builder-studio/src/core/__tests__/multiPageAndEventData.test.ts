import { beforeEach, describe, expect, it } from 'vitest';
import type { WebsiteProjectData } from '../../types';
import {
  buildWebsiteDocumentFromProject,
  validateWebsiteDocument,
} from '../documentModel';
import { useWebsiteDocumentStore } from '../websiteDocumentStore';
import {
  applyEventSnapshotToDocument,
  disconnectInstanceFromEvent,
  isInstanceManual,
  reconnectInstanceToEvent,
} from '../eventDataBinding';
import { mockEventSnapshot } from '../eventMockData';

const multiPageProject: WebsiteProjectData = {
  name: 'Multi-Page Event Test',
  activePageId: 'home',
  theme: {
    primary: '#7c3aed',
    secondary: '#22d3ee',
    background: '#080912',
    surface: '#111827',
    card: '#151629',
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      html: '',
      css: '',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      components: [
        {
          type: 'hero',
          tagName: 'section',
          attributes: { 'data-wb-instance-id': 'hero-1', id: 'hero-section' },
          components: [
            {
              type: 'button',
              tagName: 'a',
              attributes: {
                'data-wb-instance-id': 'speakers-cta',
                href: '/speakers',
                'data-link-type': 'page',
                'data-page-id': 'speakers',
              },
              components: 'See Speakers',
            },
            {
              type: 'button',
              tagName: 'a',
              attributes: {
                'data-wb-instance-id': 'keynotes-cta',
                href: '/speakers#keynotes',
                'data-link-type': 'page',
                'data-page-id': 'speakers',
                'data-anchor-id': 'keynotes',
              },
              components: 'Keynotes',
            },
            {
              type: 'button',
              tagName: 'a',
              attributes: {
                'data-wb-instance-id': 'register-cta',
                href: '/registration',
                'data-link-type': 'registration',
              },
              components: 'Register',
            },
          ],
        },
      ],
    },
    {
      id: 'speakers',
      name: 'Speakers',
      slug: 'speakers',
      isHomePage: false,
      html: '',
      css: '',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      components: [
        {
          type: 'speaker-grid',
          tagName: 'section',
          attributes: { 'data-wb-instance-id': 'speaker-grid-1', id: 'keynotes' },
          components: [],
        },
      ],
    },
    {
      id: 'agenda',
      name: 'Agenda',
      slug: 'agenda',
      isHomePage: false,
      html: '',
      css: '',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      components: [
        {
          type: 'agenda',
          tagName: 'section',
          attributes: { 'data-wb-instance-id': 'agenda-1', id: 'schedule' },
          components: [],
        },
      ],
    },
  ],
};

describe('Phase 5: Multi-Page Slug Routing & Section Anchor Pickers', () => {
  beforeEach(() => {
    useWebsiteDocumentStore.setState({ document: null, activePageId: '', selectedInstanceId: undefined });
  });

  it('correctly creates structured page links and cross-page anchor links', () => {
    useWebsiteDocumentStore.getState().initialize(multiPageProject);
    const store = useWebsiteDocumentStore.getState();

    // Update link to cross-page anchor
    store.updateLink('speakers-cta', {
      type: 'page',
      pageId: 'agenda',
      anchorId: 'schedule',
    });

    const doc = useWebsiteDocumentStore.getState().document!;
    const ctaAttrs = doc.instances['speakers-cta'].props.attributes as Record<string, unknown>;
    expect(ctaAttrs.href).toBe('/agenda#schedule');
    expect(ctaAttrs['data-link-type']).toBe('page');
    expect(ctaAttrs['data-page-id']).toBe('agenda');
    expect(ctaAttrs['data-anchor-id']).toBe('schedule');
    expect(doc.instances['speakers-cta'].props.link).toEqual({
      type: 'page',
      pageId: 'agenda',
      anchorId: 'schedule',
    });
  });

  it('cascades page rename to all incoming links and preserves section anchor hashes', () => {
    useWebsiteDocumentStore.getState().initialize(multiPageProject);
    const store = useWebsiteDocumentStore.getState();

    // Rename 'speakers' page to 'Special Guests' -> slug becomes 'special-guests'
    store.renamePage('speakers', 'Special Guests');

    const doc = useWebsiteDocumentStore.getState().document!;
    const keynotesAttrs = doc.instances['keynotes-cta'].props.attributes as Record<string, unknown>;
    expect(keynotesAttrs.href).toBe('/special-guests#keynotes');
    expect(keynotesAttrs['data-page-id']).toBe('speakers');

    const speakersAttrs = doc.instances['speakers-cta'].props.attributes as Record<string, unknown>;
    expect(speakersAttrs.href).toBe('/special-guests');
    expect(validateWebsiteDocument(doc)).toEqual([]);
  });

  it('safely cleans up incoming links when a non-home page is deleted', () => {
    useWebsiteDocumentStore.getState().initialize(multiPageProject);
    const store = useWebsiteDocumentStore.getState();

    // Delete 'speakers' page
    store.deletePage('speakers');

    const doc = useWebsiteDocumentStore.getState().document!;
    expect(doc.pages.some(p => p.id === 'speakers')).toBe(false);

    // Links that pointed to 'speakers' should have href and data-page-id removed cleanly
    const keynotesAttrs = doc.instances['keynotes-cta'].props.attributes as Record<string, unknown>;
    expect(keynotesAttrs.href).toBeUndefined();
    expect(keynotesAttrs['data-page-id']).toBeUndefined();
    expect(validateWebsiteDocument(doc)).toEqual([]);
  });

  it('guards home page from deletion', () => {
    useWebsiteDocumentStore.getState().initialize(multiPageProject);
    const store = useWebsiteDocumentStore.getState();

    // Attempt to delete home page
    store.deletePage('home');

    const doc = useWebsiteDocumentStore.getState().document!;
    expect(doc.pages.some(p => p.id === 'home')).toBe(true);
  });
});

describe('Phase 6: Event Live Data Bindings vs Manual Override Workflows', () => {
  it('applies live snapshot data to connected event components', () => {
    const document = buildWebsiteDocumentFromProject(multiPageProject);
    const resolved = applyEventSnapshotToDocument(document, mockEventSnapshot, 'snapshot');

    const heroAttrs = resolved.instances['hero-1'].props.attributes as Record<string, unknown>;
    expect(heroAttrs['data-event-name']).toBe(mockEventSnapshot.eventName);
    expect(heroAttrs['data-source']).toBe('snapshot');

    const speakerAttrs = resolved.instances['speaker-grid-1'].props.attributes as Record<string, unknown>;
    expect(speakerAttrs['data-source']).toBe('snapshot');
    expect(JSON.parse(speakerAttrs['data-items'] as string)).toHaveLength(mockEventSnapshot.speakers!.length);
  });

  it('freezes component into manual mode on disconnect and preserves manual edits across subsequent syncs', () => {
    const document = buildWebsiteDocumentFromProject(multiPageProject);
    const synced = applyEventSnapshotToDocument(document, mockEventSnapshot, 'snapshot');

    // User edits speaker grid manually and disconnects
    const disconnected = disconnectInstanceFromEvent(synced, 'speaker-grid-1');
    expect(isInstanceManual(disconnected.instances['speaker-grid-1'])).toBe(true);

    // Manually edit the speaker data
    const manualSpeakers = [{ name: 'Custom Local Speaker', role: 'Keynote Speaker' }];
    (disconnected.instances['speaker-grid-1'].props.attributes as Record<string, unknown>)['data-items'] = JSON.stringify(manualSpeakers);

    // Now trigger a new event sync with different event data
    const updatedSnapshot = {
      ...mockEventSnapshot,
      eventName: 'Updated Global Summit 2027',
      speakers: [
        { id: 'spk-1', name: 'Remote Speaker 1', designation: 'Lead AI Engineer', speakerType: 'KEYNOTE' as const, bio: '', company: 'TechCorp' },
        { id: 'spk-2', name: 'Remote Speaker 2', designation: 'Chief Scientist', speakerType: 'REGULAR' as const, bio: '', company: 'OpenLab' },
      ],
    };

    const nextSync = applyEventSnapshotToDocument(disconnected, updatedSnapshot, 'snapshot');

    // Hero was connected, so it updated
    const heroAttrs = nextSync.instances['hero-1'].props.attributes as Record<string, unknown>;
    expect(heroAttrs['data-event-name']).toBe('Updated Global Summit 2027');

    // Speaker grid was disconnected/manual, so it preserved manual edits!
    const speakerAttrs = nextSync.instances['speaker-grid-1'].props.attributes as Record<string, unknown>;
    expect(JSON.parse(speakerAttrs['data-items'] as string)).toEqual(manualSpeakers);
  });

  it('reconnects a manual instance back to the live event snapshot', () => {
    const document = buildWebsiteDocumentFromProject(multiPageProject);
    const synced = applyEventSnapshotToDocument(document, mockEventSnapshot, 'snapshot');
    const disconnected = disconnectInstanceFromEvent(synced, 'speaker-grid-1');

    // Reconnect speaker grid
    const reconnected = reconnectInstanceToEvent(disconnected, 'speaker-grid-1', mockEventSnapshot, 'snapshot');
    expect(isInstanceManual(reconnected.instances['speaker-grid-1'])).toBe(false);

    const speakerAttrs = reconnected.instances['speaker-grid-1'].props.attributes as Record<string, unknown>;
    expect(speakerAttrs['data-source']).toBe('snapshot');
    expect(JSON.parse(speakerAttrs['data-items'] as string)).toHaveLength(mockEventSnapshot.speakers!.length);
  });
});
