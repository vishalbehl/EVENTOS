/** UI copy is local; free-form notification HTML/metadata is never trusted. */
export function realtimeNotification(value: unknown): { title: string; desc: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = (value as { type?: unknown }).type;
  switch (kind) {
    case 'campaign.sent': return { title: 'Campaign sent', desc: 'Open the campaign for delivery results.' };
    case 'file.uploaded': return { title: 'File uploaded', desc: 'A presentation was received.' };
    case 'file.approved': return { title: 'File approved', desc: 'A presentation was approved.' };
    case 'file.rejected': return { title: 'File needs revision', desc: 'Review the presentation status.' };
    case 'import.completed': return { title: 'Import completed', desc: 'Refresh the participant list for the latest result.' };
    case 'import.failed': return { title: 'Import failed', desc: 'Open the import result for details.' };
    default: return null;
  }
}
