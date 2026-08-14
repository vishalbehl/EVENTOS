import dynamicIconImports from 'lucide-react/dynamicIconImports';

export const LUCIDE_ICON_NAMES = Object.keys(dynamicIconImports).sort();

export function lucideIconUrl(name: string) {
  return `https://cdn.jsdelivr.net/npm/lucide-static@0.468.0/icons/${name}.svg`;
}

export function toIconTitle(name: string) {
  return name
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const SOCIAL_ICON_OPTIONS = [
  { platform: 'facebook', label: 'Facebook', icon: 'facebook', url: 'https://facebook.com/' },
  { platform: 'instagram', label: 'Instagram', icon: 'instagram', url: 'https://instagram.com/' },
  { platform: 'linkedin', label: 'LinkedIn', icon: 'linkedin', url: 'https://linkedin.com/company/' },
  { platform: 'x', label: 'X', icon: 'twitter', url: 'https://x.com/' },
  { platform: 'youtube', label: 'YouTube', icon: 'youtube', url: 'https://youtube.com/' },
  { platform: 'github', label: 'GitHub', icon: 'github', url: 'https://github.com/' },
  { platform: 'mail', label: 'Email', icon: 'mail', url: 'mailto:hello@example.com' },
  { platform: 'phone', label: 'Phone', icon: 'phone', url: 'tel:+10000000000' },
  { platform: 'globe', label: 'Website', icon: 'globe', url: 'https://example.com' },
];

export function socialIconName(platform?: string) {
  const normalized = String(platform || '').trim().toLowerCase();
  return SOCIAL_ICON_OPTIONS.find(option => option.platform === normalized)?.icon || normalized || 'link';
}
