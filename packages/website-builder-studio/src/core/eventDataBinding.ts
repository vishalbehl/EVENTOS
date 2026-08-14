import type { ComponentInstance, DataBinding, EventDataSnapshot, WebsiteDocument } from '../types';

type EventField = keyof EventDataSnapshot;

function cloneDocument(document: WebsiteDocument): WebsiteDocument {
  return JSON.parse(JSON.stringify(document)) as WebsiteDocument;
}

function attributesOf(instance: ComponentInstance): Record<string, unknown> {
  const attributes = instance.props.attributes;
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    return { ...(attributes as Record<string, unknown>) };
  }
  return {};
}

function isManual(instance: ComponentInstance) {
  const attributes = attributesOf(instance);
  return attributes['data-source'] === 'manual'
    || instance.bindings.some(binding => binding.source === 'manual' || binding.isOverridden);
}

function formatDateRange(snapshot: EventDataSnapshot) {
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  };
  const start = format(snapshot.startDate);
  const end = format(snapshot.endDate);
  return start === end ? start : `${start} - ${end}`;
}

function locationOf(snapshot: EventDataSnapshot) {
  return [snapshot.venue?.name, snapshot.venue?.city, snapshot.venue?.country].filter(Boolean).join(', ');
}

function binding(
  instance: ComponentInstance,
  fieldPath: EventField,
  snapshot: EventDataSnapshot,
  source: DataBinding['source'],
  fallbackStatus: DataBinding['fallbackStatus'],
): DataBinding {
  const existing = instance.bindings.find(candidate => candidate.fieldPath === fieldPath);
  return {
    id: existing?.id || `binding_${instance.id}_${fieldPath}`,
    source,
    fieldPath,
    snapshotId: snapshot.snapshotId,
    lastSyncedAt: snapshot.snapshotCreatedAt,
    isOverridden: existing?.isOverridden || false,
    fallbackStatus,
  };
}

function applyFields(
  instance: ComponentInstance,
  snapshot: EventDataSnapshot,
  values: Record<string, unknown>,
  fields: EventField[],
  source: DataBinding['source'],
  fallbackStatus: DataBinding['fallbackStatus'],
) {
  const attributes = { ...attributesOf(instance), ...values, 'data-source': source };
  instance.props = { ...instance.props, attributes };
  instance.bindings = [
    ...instance.bindings.filter(item => !fields.includes(item.fieldPath as EventField)),
    ...fields.map(field => binding(instance, field, snapshot, source, fallbackStatus)),
  ];
}

/** Resolve event data into plain component props so save, canvas, preview and export share one result. */
export function applyEventSnapshotToDocument(
  document: WebsiteDocument,
  snapshot: EventDataSnapshot,
  source: DataBinding['source'] = 'snapshot',
): WebsiteDocument {
  const next = cloneDocument(document);
  const fallbackStatus: DataBinding['fallbackStatus'] = source === 'mock' ? 'mock' : 'resolved';
  const dateRange = formatDateRange(snapshot);
  const location = locationOf(snapshot);
  const socialLinks = Object.entries(snapshot.socialLinks || {}).map(([platform, url]) => ({ platform, url }));

  Object.values(next.instances).forEach(instance => {
    if (isManual(instance)) return;
    switch (instance.componentType) {
      case 'hero':
        applyFields(instance, snapshot, {
          'data-event-name': snapshot.eventName,
          'data-tagline': snapshot.tagline || snapshot.description || '',
          'data-date': dateRange,
          'data-location': location,
          'data-banner': snapshot.banner || '',
        }, ['eventName', 'tagline', 'description', 'startDate', 'endDate', 'venue', 'banner'], source, fallbackStatus);
        break;
      case 'countdown':
        applyFields(instance, snapshot, { 'data-target': snapshot.startDate }, ['startDate'], source, fallbackStatus);
        break;
      case 'event-overview':
        applyFields(instance, snapshot, {
          'data-title': snapshot.eventName,
          'data-description': snapshot.description || snapshot.tagline || '',
          'data-objectives': JSON.stringify(snapshot.objectives || []),
        }, ['eventName', 'description', 'tagline', 'objectives'], source, fallbackStatus);
        break;
      case 'organizer-message':
        applyFields(instance, snapshot, {
          'data-name': snapshot.organizer?.name || '',
          'data-designation': snapshot.organizer?.designation || '',
          'data-photo': snapshot.organizer?.photo || '',
          'data-message': snapshot.organizer?.message || snapshot.welcomeNote || '',
        }, ['organizer', 'welcomeNote'], source, fallbackStatus);
        break;
      case 'statistics': {
        const stats = snapshot.stats || {};
        const items = [
          ['Delegates', stats.totalDelegates], ['Speakers', stats.totalSpeakers],
          ['Sessions', stats.totalSessions], ['Countries', stats.totalCountries],
          ['Sponsors', stats.totalSponsors], ['Exhibitors', stats.totalExhibitors],
        ].filter(([, value]) => value !== undefined).map(([label, value]) => ({ label, value: String(value) }));
        applyFields(instance, snapshot, { 'data-stats': JSON.stringify(items) }, ['stats'], source, fallbackStatus);
        break;
      }
      case 'speaker-grid':
        applyFields(instance, snapshot, { 'data-items': JSON.stringify(snapshot.speakers || []) }, ['speakers'], source, fallbackStatus);
        break;
      case 'featured-speaker':
        applyFields(instance, snapshot, { 'data-speaker-data': JSON.stringify(snapshot.speakers?.[0] || {}) }, ['speakers'], source, fallbackStatus);
        break;
      case 'committee':
        applyFields(instance, snapshot, { 'data-items': JSON.stringify(snapshot.committee || []) }, ['committee'], source, fallbackStatus);
        break;
      case 'agenda':
        applyFields(instance, snapshot, { 'data-items': JSON.stringify(snapshot.sessions || []) }, ['sessions'], source, fallbackStatus);
        break;
      case 'sponsor-grid':
        applyFields(instance, snapshot, { 'data-items': JSON.stringify(snapshot.sponsors || []) }, ['sponsors'], source, fallbackStatus);
        break;
      case 'pricing':
        applyFields(instance, snapshot, { 'data-items': JSON.stringify(snapshot.ticketCategories || []) }, ['ticketCategories'], source, fallbackStatus);
        break;
      case 'venue':
      case 'map':
        applyFields(instance, snapshot, {
          'data-venue-name': snapshot.venue?.name || '',
          'data-address': snapshot.venue?.address || location,
          'data-description': snapshot.venue?.description || '',
          'data-map-url': snapshot.venue?.mapEmbedUrl || '',
          'data-photo': snapshot.venue?.photos?.[0] || '',
        }, ['venue'], source, fallbackStatus);
        break;
      case 'gallery':
        applyFields(instance, snapshot, { 'data-images': JSON.stringify(snapshot.gallery || []) }, ['gallery'], source, fallbackStatus);
        break;
      case 'footer':
      case 'contact-footer':
        applyFields(instance, snapshot, {
          'data-logo-text': snapshot.eventName,
          'data-logo': snapshot.logo || '',
          'data-email': snapshot.organizer?.email || '',
          'data-phone': snapshot.organizer?.phone || '',
          'data-social-links': JSON.stringify(socialLinks),
        }, ['eventName', 'logo', 'organizer', 'socialLinks'], source, fallbackStatus);
        break;
      default:
        break;
    }
  });

  const dataSource = {
    id: 'current-event',
    type: source === 'mock' ? 'mock' as const : 'event-snapshot' as const,
    label: source === 'mock' ? 'Mock event data' : snapshot.eventName,
    snapshotId: snapshot.snapshotId,
    lastSyncedAt: snapshot.snapshotCreatedAt,
    status: source === 'mock' ? 'mock' as const : snapshot.disconnectedAt ? 'snapshot' as const : 'connected' as const,
  };
  next.dataSources = [...next.dataSources.filter(item => item.id !== dataSource.id), dataSource];
  next.updatedAt = new Date().toISOString();
  delete next.checksum;
  return next;
}
