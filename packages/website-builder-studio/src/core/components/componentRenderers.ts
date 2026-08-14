import type { Component } from 'grapesjs';
import qrcode from 'qrcode-generator';
import { lucideIconUrl, SOCIAL_ICON_OPTIONS, socialIconName } from '../iconLibrary';

function attrs(component: Component) {
  return component.getAttributes() as Record<string, string>;
}

function setText(component: Component, selector: string, value?: string) {
  if (!value) return;
  const target = component.find(selector)?.[0];
  if (target) target.components(value);
}

function setFirstText(component: Component, selectors: string[], value?: string) {
  if (!value) return;
  for (const selector of selectors) {
    const target = component.find(selector)?.[0];
    if (target) {
      target.components(value);
      return;
    }
  }
}

function setFirstAttribute(component: Component, selectors: string[], name: string, value?: string) {
  if (!value) return;
  for (const selector of selectors) {
    const tagName = String(component.get('tagName') || '').toLowerCase();
    if (selector.split(',').map(item => item.trim().toLowerCase()).includes(tagName)) {
      component.addAttributes({ [name]: value });
      return;
    }
    const target = component.find(selector)?.[0];
    if (target) {
      target.addAttributes({ [name]: value });
      return;
    }
  }
}

function setDisplay(component: Component, selector: string, visible: boolean) {
  if (selector === ':self') {
    component.addStyle({ display: visible ? '' : 'none' });
    return;
  }
  component.find(selector).forEach(child => child.addStyle({ display: visible ? '' : 'none' }));
}

function parseBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === '1';
}

function parseJsonArray(value?: string): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type SocialIconItem = {
  platform: string;
  label?: string;
  url?: string;
};

function defaultSocialIcons(): SocialIconItem[] {
  return SOCIAL_ICON_OPTIONS.slice(0, 4).map(option => ({
    platform: option.platform,
    label: option.label,
    url: option.url,
  }));
}

function parseSocialIcons(value?: string): SocialIconItem[] {
  if (!value) return defaultSocialIcons();
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return defaultSocialIcons();
    return parsed.map((item, index) => {
      if (typeof item === 'string') {
        const option = SOCIAL_ICON_OPTIONS.find(candidate => candidate.platform === item.toLowerCase());
        return { platform: option?.platform || item.toLowerCase(), label: option?.label || item, url: option?.url || '#' };
      }
      const platform = String(item.platform || item.name || item.icon || `social-${index + 1}`).toLowerCase();
      const option = SOCIAL_ICON_OPTIONS.find(candidate => candidate.platform === platform);
      return {
        platform,
        label: String(item.label || option?.label || platform),
        url: String(item.url || item.href || option?.url || '#'),
      };
    });
  } catch {
    return defaultSocialIcons();
  }
}

function renderSocialIcon(item: SocialIconItem, iconStyle = 'filled', shape = 'soft') {
  const option = SOCIAL_ICON_OPTIONS.find(candidate => candidate.platform === item.platform);
  const label = item.label || option?.label || item.platform || 'Social link';
  const href = item.url || option?.url || '#';
  const icon = socialIconName(item.platform);
  const radius = shape === 'circle' ? '999px' : shape === 'square' ? '0' : '10px';
  const background = iconStyle === 'plain' ? 'transparent' : iconStyle === 'outline' ? 'transparent' : 'var(--border-subtle, var(--muted))';
  const border = iconStyle === 'plain' ? '1px solid transparent' : '1px solid var(--border-default, var(--border))';
  return `<a data-gjs-type="social-icon" data-platform="${escapeHtml(item.platform)}" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" target="_blank" rel="noopener noreferrer" style="width:40px;height:40px;border-radius:${radius};background:${background};border:${border};display:inline-flex;align-items:center;justify-content:center;color:var(--pri,var(--primary));text-decoration:none;box-sizing:border-box;">
    <span aria-hidden="true" style="display:block;width:18px;height:18px;background:currentColor;-webkit-mask:url('${lucideIconUrl(icon)}') center / contain no-repeat;mask:url('${lucideIconUrl(icon)}') center / contain no-repeat;"></span>
  </a>`;
}

function applySingleSocialIcon(component: Component) {
  const a = attrs(component);
  const platform = a['data-platform'] || 'link';
  const icon = socialIconName(platform);
  const label = a['aria-label'] || SOCIAL_ICON_OPTIONS.find(option => option.platform === platform)?.label || platform;
  component.addAttributes({ title: label, 'aria-label': label, target: a.target || '_blank', rel: a.rel || 'noopener noreferrer' });
  component.components(`<span aria-hidden="true" style="display:block;width:18px;height:18px;background:currentColor;-webkit-mask:url('${lucideIconUrl(icon)}') center / contain no-repeat;mask:url('${lucideIconUrl(icon)}') center / contain no-repeat;"></span>`);
}

function formatCountdown(targetDate?: string, expiredMessage?: string) {
  const target = targetDate ? new Date(targetDate).getTime() : NaN;
  if (!Number.isFinite(target)) return { values: ['45', '12', '38', '52'], expired: false };
  const diff = target - Date.now();
  if (diff <= 0) return { values: [expiredMessage || 'Started', '', '', ''], expired: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { values: [days, hours, minutes, seconds].map(v => String(v).padStart(2, '0')), expired: false };
}

function applyImage(component: Component) {
  const a = attrs(component);
  const target = component.get('tagName') === 'img' ? component : component.find('img')?.[0];
  if (!target) return;
  if (a['data-object-fit']) target.addStyle({ 'object-fit': a['data-object-fit'] });
  if (a['data-aspect-ratio'] && a['data-aspect-ratio'] !== 'auto') target.addStyle({ 'aspect-ratio': a['data-aspect-ratio'], height: 'auto' });
  if (a['data-object-position']) target.addStyle({ 'object-position': a['data-object-position'] });
  const scale = Number.parseFloat(a['data-scale'] || '1');
  const rotate = Number.parseFloat(a['data-rotate'] || '0');
  if (Number.isFinite(scale) || Number.isFinite(rotate)) {
    target.addStyle({
      transform: `scale(${Number.isFinite(scale) ? scale : 1}) rotate(${Number.isFinite(rotate) ? rotate : 0}deg)`,
      'transform-origin': a['data-object-position'] || 'center center',
    });
  }
  if (a['data-shape']) {
    const radius = {
      square: '0',
      rounded: '16px',
      circle: '999px',
      arch: '999px 999px 24px 24px',
    }[a['data-shape']] || '16px';
    target.addStyle({ 'border-radius': radius });
  }
  if (a['data-filter']) {
    const filter = {
      none: '',
      grayscale: 'grayscale(1)',
      sepia: 'sepia(0.8)',
      blur: 'blur(3px)',
      warm: 'sepia(0.25) saturate(1.2) brightness(1.04)',
      cool: 'saturate(1.1) hue-rotate(8deg) brightness(0.98)',
    }[a['data-filter']] ?? '';
    target.addStyle({ filter });
  }
  if (a['data-image-animation']) {
    const animation = {
      none: '',
      float: 'wb-float 4s ease-in-out infinite',
      pulse: 'wb-soft-pulse 2.8s ease-in-out infinite',
      'zoom-in': 'wb-slow-zoom 12s ease-in-out infinite alternate',
    }[a['data-image-animation']] || '';
    target.addStyle({ animation });
  }
  if (a['data-caption']) setText(component, '[data-role="caption"]', a['data-caption']);
  if (a.src) target.addAttributes({ src: a.src });
  if (a.alt) target.addAttributes({ alt: a.alt });
}

function applyVideo(component: Component) {
  const a = attrs(component);
  const current = component.find('iframe,video')?.[0];
  const source = a['data-src'] || (current ? attrs(current).src : '');
  if (!source) return;
  const youtubeId = source.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)?.[1];
  const vimeoId = source.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
  const useIframe = Boolean(youtubeId || vimeoId || /\/embed\//.test(source));
  const resolvedSource = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}`
    : vimeoId
      ? `https://player.vimeo.com/video/${vimeoId}`
      : source;
  let media = current;
  if (!media || String(media.get('tagName')).toLowerCase() !== (useIframe ? 'iframe' : 'video')) {
    current?.remove();
    component.components().add({
      tagName: useIframe ? 'iframe' : 'video',
      attributes: { 'data-role': 'video-media' },
      style: { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0', 'object-fit': 'cover' },
    });
    media = component.find('iframe,video')?.[0];
  }
  if (!media) return;
  const mediaAttrs: Record<string, string | boolean> = { src: resolvedSource, title: 'Website video' };
  if (useIframe) {
    mediaAttrs.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    mediaAttrs.allowfullscreen = true;
  } else {
    mediaAttrs.autoplay = parseBool(a['data-autoplay']);
    mediaAttrs.loop = parseBool(a['data-loop']);
    mediaAttrs.muted = parseBool(a['data-muted'], true);
    mediaAttrs.controls = parseBool(a['data-controls'], true);
    if (a['data-poster']) mediaAttrs.poster = a['data-poster'];
  }
  media.addAttributes(mediaAttrs);
  component.addStyle({ position: component.getStyle().position || 'relative', 'padding-bottom': component.getStyle()['padding-bottom'] || '56.25%', height: '0', overflow: 'hidden' });
}

function applySection(component: Component) {
  const a = attrs(component);
  const width = { full: '100%', xl: '1280px', lg: '1024px', md: '768px', sm: '640px' }[a['data-container-width'] || ''];
  const container = component.find('[data-gjs-type="container"]')?.[0];
  if (container && width) container.addStyle({ width: '100%', 'max-width': width, margin: '0 auto' });
  if (a['data-height']) component.addStyle({ 'min-height': a['data-height'] === 'screen' ? '100vh' : a['data-height'] === 'fixed' ? (component.getStyle()['min-height'] || '600px') : 'auto' });
  if (a['data-html-tag']) component.set('tagName', a['data-html-tag']);
}

function applyContainer(component: Component) {
  const a = attrs(component);
  component.addStyle({
    width: '100%',
    'max-width': parseBool(a['data-fluid']) ? 'none' : (component.getStyle()['max-width'] || '1200px'),
    margin: parseBool(a['data-center'], true) ? '0 auto' : (component.getStyle().margin || '0'),
  });
}

function applyGrid(component: Component) {
  const a = attrs(component);
  const columns = Math.max(1, Math.min(12, Number(a['data-columns']) || 2));
  component.addStyle({
    display: 'grid',
    'grid-template-columns': `repeat(${columns}, minmax(0, 1fr))`,
    'row-gap': a['data-row-gap'] || component.getStyle()['row-gap'] || component.getStyle().gap || '16px',
    'column-gap': a['data-col-gap'] || component.getStyle()['column-gap'] || component.getStyle().gap || '16px',
    'align-items': a['data-align-items'] || component.getStyle()['align-items'] || 'stretch',
    'justify-items': a['data-justify-items'] || component.getStyle()['justify-items'] || 'stretch',
    '--wb-grid-tablet': String(Math.max(1, Math.min(12, Number(a['data-cols-tablet']) || Math.min(columns, 2)))),
    '--wb-grid-mobile': String(Math.max(1, Math.min(12, Number(a['data-cols-mobile']) || (parseBool(a['data-collapse-mobile'], true) ? 1 : columns)))),
  });
  component.addAttributes({ 'data-responsive-grid': 'true' });
}

function applyCard(component: Component) {
  const a = attrs(component);
  const style = a['data-card-style'];
  if (style === 'minimal') component.addStyle({ background: 'transparent', border: '1px solid var(--border)', 'box-shadow': 'none' });
  if (style === 'glass') component.addStyle({ background: 'color-mix(in srgb, var(--surface) 72%, transparent)', 'backdrop-filter': 'blur(18px)', border: '1px solid color-mix(in srgb, var(--border) 78%, transparent)' });
  if (style === 'feature') component.addStyle({ background: 'var(--card)', border: '1px solid var(--border)', 'box-shadow': '0 18px 48px rgba(0,0,0,.16)' });
  if (style === 'pricing') component.addStyle({ background: 'var(--card)', border: '2px solid var(--primary)', 'box-shadow': '0 20px 54px color-mix(in srgb, var(--primary) 16%, transparent)' });
  if (a['data-hover-style'] && a['data-hover-style'] !== 'none') {
    component.addAttributes({ 'data-hover-effect': a['data-hover-style'] });
    component.addStyle({ transition: 'transform .22s ease, box-shadow .22s ease, border-color .22s ease' });
  }
}

function applySpacer(component: Component) {
  const a = attrs(component);
  if (a['data-height-tablet']) component.addAttributes({ 'data-responsive-height-tablet': a['data-height-tablet'] });
  if (a['data-height-mobile']) component.addAttributes({ 'data-responsive-height-mobile': a['data-height-mobile'] });
  component.addStyle({
    '--wb-height-tablet': a['data-height-tablet'] || component.getStyle().height || '40px',
    '--wb-height-mobile': a['data-height-mobile'] || component.getStyle().height || '24px',
  });
}

function applyTabs(component: Component) {
  const a = attrs(component);
  const items = parseJsonArray(a['data-tabs']);
  if (items.length) {
    const instanceKey = String(a['data-wb-instance-id'] || component.getId() || 'tabs').replace(/[^a-zA-Z0-9_-]/g, '-');
    const active = a['data-active-color'] || 'var(--primary)';
    const inactive = a['data-inactive-color'] || 'var(--muted-foreground)';
    const buttons = items.map((item, index) => `<button type="button" id="wb-tab-${instanceKey}-${index}" role="tab" aria-selected="${index === 0}" aria-controls="wb-panel-${instanceKey}-${index}" style="padding:10px 16px;border:0;border-bottom:2px solid ${index === 0 ? active : 'transparent'};background:transparent;color:${index === 0 ? active : inactive};font:inherit;font-weight:700;cursor:pointer;">${escapeHtml(item.title || item.label || `Tab ${index + 1}`)}</button>`).join('');
    const panels = items.map((item, index) => `<div id="wb-panel-${instanceKey}-${index}" role="tabpanel" aria-labelledby="wb-tab-${instanceKey}-${index}"${index ? ' hidden' : ''} style="padding:20px 0;color:var(--foreground);">${escapeHtml(item.content || item.desc || '')}</div>`).join('');
    component.components(`<div role="tablist" style="display:flex;justify-content:${a['data-tab-align'] === 'center' ? 'center' : 'flex-start'};gap:8px;flex-wrap:wrap;">${buttons}</div>${panels}`);
  }
  component.addAttributes({ 'data-wb-runtime': 'tabs', 'data-tab-style': a['data-tab-style'] || 'underline' });
}

function applyAccordion(component: Component) {
  const a = attrs(component);
  const items = parseJsonArray(a['data-items']);
  if (items.length) {
    const openIndex = Number(a['data-default-open']);
    const continuous = a['data-border-style'] === 'continuous';
    component.components(items.map((item, index) => `<details${index === openIndex ? ' open' : ''} style="background:var(--muted);border:1px solid var(--border);border-radius:${continuous ? '0' : '10px'};overflow:hidden;"><summary style="padding:14px 18px;font-weight:700;cursor:pointer;color:var(--foreground);">${escapeHtml(item.title || `Item ${index + 1}`)}</summary><div style="padding:0 18px 16px;color:var(--muted-foreground);line-height:1.6;">${escapeHtml(item.desc || item.content || '')}</div></details>`).join(''));
  }
  component.addAttributes({
    'data-wb-runtime': 'accordion',
    'data-allow-multiple': String(parseBool(a['data-allow-multiple'])),
    'data-chevron': a['data-chevron'] || 'arrow',
  });
}

function applyTypography(component: Component) {
  const a = attrs(component);
  if (a['data-tag'] && /^h[1-6]$/.test(a['data-tag'])) component.set('tagName', a['data-tag']);
  if (a['data-columns']) component.addStyle({ 'column-count': a['data-columns'], 'column-gap': '2em' });
  if (a['data-stroke']) component.addStyle({ '-webkit-text-stroke': a['data-stroke'] });
  if (parseBool(a['data-gradient'])) component.addStyle({ background: 'linear-gradient(90deg,var(--primary),var(--secondary))', color: 'transparent', 'background-clip': 'text', '-webkit-background-clip': 'text' });
  if (a['data-avatar']) setFirstAttribute(component, ['img'], 'src', a['data-avatar']);
  if (a['data-variable']) component.components(escapeHtml(a['data-variable']));
  const quoteIcon = component.find('[data-role="quote-icon"]')?.[0];
  if (quoteIcon && a['data-icon-placement']) {
    quoteIcon.addStyle({ display: a['data-icon-placement'] === 'hidden' ? 'none' : '', 'align-self': a['data-icon-placement'] === 'top-right' ? 'flex-end' : 'flex-start' });
  }
}

function applyCounter(component: Component) {
  const a = attrs(component);
  const start = Number(a['data-start'] || 0);
  const end = Number(a['data-end'] || 1200);
  const prefix = a['data-prefix'] || '';
  const suffix = a['data-suffix'] || '+';
  const value = component.find('[data-role="counter-value"]')?.[0] || component.components().at(0);
  value?.components(`${escapeHtml(prefix)}${Number.isFinite(end) ? end.toLocaleString() : '0'}${escapeHtml(suffix)}`);
  component.addAttributes({
    'data-wb-runtime': 'counter',
    'data-counter-start': String(Number.isFinite(start) ? start : 0),
    'data-counter-end': String(Number.isFinite(end) ? end : 0),
    'data-counter-prefix': prefix,
    'data-counter-suffix': suffix,
    'data-counter-duration': a['data-duration'] || '1200',
  });
}

function applyImageText(component: Component) {
  const a = attrs(component);
  const layout = a['data-layout'] || 'image-left';
  component.addStyle({
    'flex-direction': layout === 'image-right' ? 'row-reverse' : layout === 'stacked' ? 'column' : 'row',
  });
}

function applyFeaturedSpeaker(component: Component) {
  const a = attrs(component);
  const speaker = parseJsonArray(`[${a['data-speaker-data'] || '{}'}]`)[0];
  if (speaker) {
    setFirstText(component, ['[data-role="speaker-name"]', 'h2', 'h3'], String(speaker.name || ''));
    setFirstText(component, ['[data-role="designation"]'], String(speaker.designation || ''));
    setFirstText(component, ['[data-role="company"]'], String(speaker.organization || ''));
    setFirstText(component, ['[data-role="bio"]'], String(speaker.bio || ''));
    setFirstText(component, ['[data-role="session"]'], String(speaker.talkTitle || ''));
    setFirstAttribute(component, ['[data-role="speaker-photo"]', 'img'], 'src', String(speaker.photo || ''));
  }
  const layout = a['data-layout'] || 'split';
  const layoutNode = component.components().at(0) || component;
  layoutNode.addStyle({
    display: layout === 'card' ? 'block' : 'flex',
    'flex-direction': layout === 'spotlight' ? 'column' : 'row',
    'align-items': 'center',
  });
  setDisplay(component, '[data-role="bio"]', parseBool(a['data-show-bio'], true));
  setDisplay(component, '[data-role="session"]', parseBool(a['data-show-session'], true));
}

function applyRegistrationCta(component: Component) {
  const a = attrs(component);
  if (a['data-deadline']) setFirstText(component, ['[data-role="deadline"]'], a['data-deadline']);
  if (a['data-price']) setFirstText(component, ['[data-role="price"]'], a['data-price']);
}

function applyContactFooter(component: Component) {
  const a = attrs(component);
  if (a['data-email']) {
    setFirstText(component, ['[data-role="email"]', 'a[href^="mailto:"]'], a['data-email']);
    setFirstAttribute(component, ['[data-role="email"]', 'a[href^="mailto:"]'], 'href', `mailto:${a['data-email']}`);
  }
  if (a['data-phone']) {
    setFirstText(component, ['[data-role="phone"]', 'a[href^="tel:"]'], a['data-phone']);
    setFirstAttribute(component, ['[data-role="phone"]', 'a[href^="tel:"]'], 'href', `tel:${a['data-phone']}`);
  }
  const socials = component.find('[data-gjs-type="social-icons"]')?.[0];
  if (socials && a['data-social-links']) {
    socials.addAttributes({ 'data-platforms': a['data-social-links'] });
    applySocialIcons(socials);
  }
}

function applyIconBlock(component: Component) {
  const a = attrs(component);
  const iconContainer = component.components().at(0);
  if (!iconContainer) return;
  const shape = a['data-icon-shape'] || 'soft';
  iconContainer.addStyle({ 'border-radius': shape === 'circle' ? '999px' : shape === 'square' ? '0' : '14px' });
  if (a['data-icon']) {
    iconContainer.components(`<span aria-hidden="true" style="display:block;width:24px;height:24px;background:currentColor;-webkit-mask:url('${lucideIconUrl(a['data-icon'])}') center / contain no-repeat;mask:url('${lucideIconUrl(a['data-icon'])}') center / contain no-repeat;"></span>`);
  }
}

function applyBreadcrumb(component: Component) {
  const a = attrs(component);
  const separator = a['data-separator'] || '/';
  component.find('span').forEach((node, index) => {
    if (index < component.find('span').length - 1) node.components(escapeHtml(separator));
  });
  const home = component.find('a')?.[0];
  if (home) setDisplay(home, ':self', parseBool(a['data-show-home'], true));
}

function applyProgressBar(component: Component) {
  const a = attrs(component);
  const value = Math.max(0, Number(a['data-value']) || 0);
  const max = Math.max(1, Number(a['data-max']) || 100);
  const fill = component.components().at(0);
  fill?.addStyle({ width: `${Math.min(100, (value / max) * 100)}%` });
  component.addAttributes({
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': String(max),
    'aria-valuenow': String(value),
    'aria-label': a['data-label'] || 'Page progress',
    'data-wb-runtime': parseBool(a['data-animated'], true) ? 'progress' : '',
  });
}

function applyMap(component: Component) {
  const a = attrs(component);
  const frame = component.find('iframe')?.[0];
  if (!frame) return;
  const location = a['data-address'] || (a['data-latitude'] && a['data-longitude'] ? `${a['data-latitude']},${a['data-longitude']}` : 'San Francisco, CA');
  const zoom = Math.max(1, Math.min(20, Number(a['data-zoom']) || 13));
  frame.addAttributes({
    src: `https://www.google.com/maps?q=${encodeURIComponent(location)}&z=${zoom}&output=embed`,
    title: `Map of ${location}`,
    'data-map-type': a['data-map-type'] || 'roadmap',
  });
}

function applyQrCode(component: Component) {
  const a = attrs(component);
  const size = Math.max(80, Math.min(640, Number(a['data-size']) || 160));
  const data = a['data-qr-data'] || 'https://eventos.example';
  const holder = component.components().at(0);
  if (!holder) return;
  holder.addStyle({ width: `${size}px`, height: `${size}px` });
  const code = qrcode(0, 'M');
  code.addData(data);
  code.make();
  holder.components(`<div data-role="qr-image" role="img" aria-label="QR code for ${escapeHtml(data)}" style="display:block;width:100%;height:100%;">${code.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>`);
}

function applyBadge(component: Component) {
  const a = attrs(component);
  if (a['data-icon']) {
    const label = component.get('content') || component.components().map((child: Component) => child.get('content')).join('') || 'Badge';
    component.components(`<span aria-hidden="true" style="display:inline-block;width:13px;height:13px;background:currentColor;-webkit-mask:url('${lucideIconUrl(a['data-icon'])}') center / contain no-repeat;mask:url('${lucideIconUrl(a['data-icon'])}') center / contain no-repeat;"></span><span>${escapeHtml(label)}</span>`);
    component.addStyle({ display: 'inline-flex', 'align-items': 'center', gap: '6px' });
  }
}

function applyAlert(component: Component) {
  const a = attrs(component);
  const palette = {
    info: ['#2563eb', '#eff6ff'],
    success: ['#15803d', '#f0fdf4'],
    warning: ['#b45309', '#fffbeb'],
    danger: ['#b91c1c', '#fef2f2'],
  }[a['data-type'] || 'info'] || ['var(--primary)', 'var(--muted)'];
  component.addStyle({ color: palette[0], background: palette[1], 'border-color': `color-mix(in srgb, ${palette[0]} 28%, transparent)` });
  if (parseBool(a['data-dismissible'])) component.addAttributes({ 'data-wb-runtime': 'alert' });
}

function applyGallery(component: Component) {
  const a = attrs(component);
  const images = parseJsonArray(a['data-images']);
  if (images.length) {
    component.components(images.map((item, index) => {
      const src = String(item.url || item.src || '');
      const alt = String(item.alt || item.title || `Gallery image ${index + 1}`);
      const image = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" style="width:100%;height:220px;object-fit:cover;border-radius:${escapeHtml(a['data-rounded'] || '10px')};display:block;" />`;
      return parseBool(a['data-lightbox']) ? `<a href="${escapeHtml(src)}" data-lightbox-item>${image}</a>` : image;
    }).join(''));
  }
  const layout = a['data-layout-type'] || 'grid';
  component.addStyle({
    display: 'grid',
    gap: a['data-gap'] || '12px',
    'grid-template-columns': layout === 'slider' ? 'none' : 'repeat(3,minmax(0,1fr))',
    'grid-auto-flow': layout === 'slider' ? 'column' : 'row',
    'grid-auto-columns': layout === 'slider' ? 'minmax(280px,70%)' : '',
    overflow: layout === 'slider' ? 'auto' : 'visible',
  });
  if (parseBool(a['data-lightbox'])) component.addAttributes({ 'data-wb-runtime': 'gallery' });
}

function applyAnimation(component: Component) {
  const a = attrs(component);
  const entrance = a['data-aos'];
  if (!entrance || entrance === 'none') {
    component.addStyle({ animation: '' });
    return;
  }
  const duration = Number.parseInt(a['data-aos-duration'] || '400', 10);
  const delay = Number.parseInt(a['data-aos-delay'] || '0', 10);
  const repeat = parseBool(a['data-aos-repeat']);
  const name = {
    fade: 'wb-fade-in',
    slide: 'wb-slide-up',
    zoom: 'wb-zoom-in',
    rotate: 'wb-rotate-in',
  }[entrance] || 'wb-fade-in';
  component.addStyle({
    animation: `${name} ${Number.isFinite(duration) ? duration : 400}ms ease ${Number.isFinite(delay) ? delay : 0}ms ${repeat ? 'infinite' : 'both'}`,
  });
}

function applyHero(component: Component) {
  const a = attrs(component);
  setFirstText(component, ['[data-role="event-name"]', 'h1'], a['data-event-name']);
  setFirstText(component, ['[data-role="tagline"]', 'p'], a['data-tagline']);
  setFirstText(component, ['[data-role="event-date"]'], a['data-date']);
  setFirstText(component, ['[data-role="event-location"]'], a['data-location']);
  setFirstText(component, ['[data-role="primary-cta"]', 'a'], a['data-primary-cta']);
  setFirstText(component, ['[data-role="secondary-cta"]', 'a:nth-of-type(2)'], a['data-secondary-cta']);
  setFirstAttribute(component, ['img'], 'src', a['data-banner']);
  if (a['data-video-src']) {
    const rawSource = a['data-video-src'].trim();
    const youtubeId = rawSource.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)?.[1];
    const vimeoId = rawSource.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    const embedSource = youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&playsinline=1`
      : vimeoId
        ? `https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&background=1`
        : rawSource;
    const useIframe = Boolean(youtubeId || vimeoId || /\/embed\//.test(rawSource));
    let media: Component | undefined = component.find('[data-role="hero-video"]')?.[0];
    if (media && String(media.get('tagName')).toLowerCase() !== (useIframe ? 'iframe' : 'video')) {
      media.remove();
      media = undefined;
    }
    if (!media) {
      component.components().add({
        tagName: useIframe ? 'iframe' : 'video',
        attributes: useIframe ? {
          'data-role': 'hero-video',
          'data-builder-generated': 'true',
          src: embedSource,
          title: 'Hero background video',
          allow: 'autoplay; fullscreen; picture-in-picture',
          frameborder: '0',
        } : {
          'data-role': 'hero-video',
          'data-builder-generated': 'true',
          src: embedSource,
          autoplay: true,
          muted: true,
          loop: true,
          playsinline: true,
        },
        style: {
          position: 'absolute',
          inset: '0',
          width: '100%',
          height: '100%',
          'object-fit': 'cover', 'z-index': '0', opacity: '.44', border: '0',
        },
      }, { at: 0 });
      media = component.find('[data-role="hero-video"]')?.[0];
    }
    media?.addAttributes({ src: embedSource });
    component.components().forEach((child: Component) => {
      if (child !== media && child.getStyle().position !== 'absolute') child.addStyle({ position: 'relative', 'z-index': '1' });
    });
  }
  if (a['data-align']) component.addStyle({ 'text-align': a['data-align'] });
  if (a['data-valign']) component.addStyle({ 'justify-content': { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[a['data-valign']] || 'center' });
  if (a['data-full-height']) component.addStyle({ 'min-height': parseBool(a['data-full-height'], true) ? '100vh' : 'auto' });
  if (a['data-variant'] === 'glass') {
    const content = component.find('[data-role="hero-content"]')?.[0]
      || component.components().models.find((child: Component) => child !== component.find('[data-role="hero-video"]')?.[0] && child.getStyle().position !== 'absolute');
    content?.addStyle({ background: 'color-mix(in srgb,var(--surface) 70%,transparent)', 'backdrop-filter': 'blur(18px)', border: '1px solid var(--border)', padding: '32px', 'border-radius': '16px' });
  }
}

function applyNavigation(component: Component) {
  const a = attrs(component);
  setFirstText(component, ['[data-role="logo"]', '[data-gjs-type="heading"]'], a['data-logo-text']);
  setFirstText(component, ['[data-role="cta"]', 'a:last-child'], a['data-cta-text']);
  if (a['data-position']) component.addStyle({ position: a['data-position'], top: a['data-position'] === 'static' ? '' : '0' });
  if (a['data-logo']) setFirstAttribute(component, ['img'], 'src', a['data-logo']);
  if (parseBool(a['data-glassmorphism'])) component.addStyle({ 'backdrop-filter': 'blur(18px)', background: 'color-mix(in srgb, var(--background) 78%, transparent)' });
  if (!parseBool(a['data-transparent-top'], true) && !parseBool(a['data-glassmorphism'])) component.addStyle({ background: 'var(--background)' });
  component.addAttributes({ 'data-wb-runtime': 'navigation', 'data-menu-style': a['data-menu-style'] || 'inline' });
}

function applyHeader(component: Component) {
  const a = attrs(component);
  setFirstText(component, ['[data-role="logo-text"]', '[data-role="logo"]', '[data-gjs-type="heading"]'], a['data-logo-text']);
  setFirstText(component, ['[data-role="cta"]', 'a:last-child'], a['data-cta-text']);
  if (a['data-cta-link']) setFirstAttribute(component, ['[data-role="cta"]', 'a:last-child'], 'href', a['data-cta-link']);
  if (a['data-logo']) {
    const logo = component.find('[data-role="logo"]')?.[0];
    const existing = component.find('[data-role="logo-image"]')?.[0];
    if (existing) {
      existing.addAttributes({ src: a['data-logo'], alt: a['data-logo-text'] || 'Logo' });
    } else if (logo) {
      logo.components(`
        <img data-role="logo-image" src="${escapeHtml(a['data-logo'])}" alt="${escapeHtml(a['data-logo-text'] || 'Logo')}" style="width:34px;height:34px;object-fit:contain;display:block;" />
        <span data-role="logo-text">${escapeHtml(a['data-logo-text'] || 'EVENTOS')}</span>
      `);
    }
  }
  if (a['data-position']) {
    component.addStyle({
      position: a['data-position'],
      top: a['data-position'] === 'static' ? '' : '0',
      'z-index': a['data-position'] === 'static' ? '' : '80',
    });
  }
  if (a['data-links']) {
    try {
      const parsed = JSON.parse(a['data-links']);
      if (Array.isArray(parsed)) {
        const menu = component.find('[data-role="menu"]')?.[0];
        if (menu) {
          menu.components(parsed.map(item => `<a data-gjs-type="button" href="${escapeHtml(item.href || item.url || '#')}" style="color:var(--muted-foreground);text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(item.label || 'Link')}</a>`).join(''));
        }
      }
    } catch {
      // Keep current menu when JSON is invalid.
    }
  }
}

function applyFooter(component: Component) {
  const a = attrs(component);
  setFirstText(component, ['[data-role="footer-brand"]', '[data-gjs-type="heading"]'], a['data-logo-text']);
  setFirstText(component, ['[data-role="copyright"]', 'p:last-child', 'p'], a['data-copyright']);
  if (a['data-email']) {
    const email = component.find('a[href^="mailto:"]')?.[0];
    email?.addAttributes({ href: `mailto:${a['data-email']}` });
    email?.components(a['data-email']);
  }
  if (a['data-phone']) {
    const phone = component.find('a[href^="tel:"]')?.[0];
    phone?.addAttributes({ href: `tel:${a['data-phone']}` });
    phone?.components(a['data-phone']);
  }
  const columns = component.find('[data-role="footer-columns"]')?.[0];
  if (columns && a['data-layout-cols']) columns.addStyle({ 'grid-template-columns': `repeat(${Math.max(2, Number(a['data-layout-cols']) || 4)},minmax(0,1fr))` });
  if (a['data-logo']) setFirstAttribute(component, ['[data-role="logo-image"]', 'img'], 'src', a['data-logo']);
  const socials = component.find('[data-gjs-type="social-icons"]')?.[0];
  if (socials && a['data-socials']) socials.addAttributes({ 'data-social-links': a['data-socials'] });
}

function applyButton(component: Component) {
  const a = attrs(component);
  const variant = a['data-variant'];
  const size = a['data-size'];
  const sizeMap: Record<string, Record<string, string>> = {
    sm: { padding: '9px 18px', 'font-size': '13px' },
    md: { padding: '13px 28px', 'font-size': '14px' },
    lg: { padding: '16px 36px', 'font-size': '16px' },
  };
  if (size && sizeMap[size]) component.addStyle(sizeMap[size]);
  if (variant === 'primary') component.addStyle({ background: 'var(--pri, var(--primary))', color: 'var(--background)', border: '1px solid transparent' });
  if (variant === 'secondary') component.addStyle({ background: 'var(--border-subtle, var(--muted))', color: 'var(--foreground)', border: '1px solid var(--border)' });
  if (variant === 'outline') component.addStyle({ background: 'transparent', color: 'var(--pri, var(--primary))', border: '1px solid var(--pri, var(--primary))' });
  if (variant === 'ghost') component.addStyle({ background: 'transparent', color: 'var(--foreground)', border: '1px solid transparent', 'box-shadow': 'none' });
  if (a['data-hover-anim'] === 'lift') component.addStyle({ transition: 'transform 0.2s, box-shadow 0.2s' });
  if (a['data-hover-anim'] === 'glow') component.addStyle({ 'box-shadow': '0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent), 0 12px 28px color-mix(in srgb, var(--primary) 28%, transparent)' });
  if (a['data-hover-anim'] && a['data-hover-anim'] !== 'none') component.addAttributes({ 'data-hover-effect': a['data-hover-anim'] });
  if (a['data-left-icon'] || a['data-right-icon']) {
    const label = component.getView()?.el?.textContent?.trim() || component.get('content') || 'Button';
    const iconMarkup = (name?: string) => name ? `<span aria-hidden="true" style="display:inline-block;width:1em;height:1em;background:currentColor;mask:url('${lucideIconUrl(name)}') center/contain no-repeat;-webkit-mask:url('${lucideIconUrl(name)}') center/contain no-repeat;"></span>` : '';
    component.addStyle({ display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', gap: '8px' });
    component.components(`${iconMarkup(a['data-left-icon'])}<span data-role="button-label">${escapeHtml(label)}</span>${iconMarkup(a['data-right-icon'])}`);
  }
}

function applyButtonGroup(component: Component) {
  const a = attrs(component);
  if (a['data-orientation']) component.addStyle({ 'flex-direction': a['data-orientation'] === 'vertical' ? 'column' : 'row' });
  if (a['data-spacing']) component.addStyle({ gap: a['data-spacing'] });
  if (!a['data-buttons']) return;
  try {
    const parsed = JSON.parse(a['data-buttons']);
    if (!Array.isArray(parsed)) return;
    component.components(parsed.map(item => `
      <a data-gjs-type="button" href="${item.link || '#'}" style="display:inline-flex;align-items:center;justify-content:center;background:var(--pri,var(--primary));color:var(--background);padding:13px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:14px;">${item.label || 'Button'}</a>
    `).join(''));
  } catch {
    // Keep existing buttons when JSON is invalid.
  }
}

function applyContactForm(component: Component) {
  const a = attrs(component);
  setFirstText(component, ['button[type="submit"]', 'button'], a['data-btn-label']);
  const fieldRules: Array<[string, string[]]> = [
    ['data-field-name', ['input[name="name"]', 'input[placeholder*="name"]', 'input[placeholder*="Name"]', 'input[placeholder*="John"]']],
    ['data-field-email', ['input[type="email"]']],
    ['data-field-company', ['input[name="company"]', 'input[placeholder*="company"]', 'input[placeholder*="Company"]']],
    ['data-field-phone', ['input[type="tel"]', 'input[placeholder*="phone"]', 'input[placeholder*="Phone"]']],
    ['data-field-message', ['textarea']],
  ];
  fieldRules.forEach(([key, selectors]) => {
    selectors.forEach(selector => {
      component.find(selector).forEach(field => {
        const wrapper = field.parent() || field;
        setDisplay(wrapper, ':self', parseBool(a[key], key === 'data-field-company' || key === 'data-field-phone' ? false : true));
      });
    });
  });
  const inputStyle = a['data-input-style'] || 'outline';
  component.find('input,textarea,select').forEach(field => {
    if (inputStyle === 'filled') field.addStyle({ background: 'var(--muted)', border: '1px solid transparent', 'border-radius': '8px' });
    if (inputStyle === 'underline') field.addStyle({ background: 'transparent', border: '0', 'border-bottom': '1px solid var(--border)', 'border-radius': '0' });
    if (inputStyle === 'outline') field.addStyle({ background: 'transparent', border: '1px solid var(--border)', 'border-radius': '8px' });
  });
  if (a['data-success-msg']) component.addAttributes({ 'data-success-message': a['data-success-msg'] });
}

function applyNewsletter(component: Component) {
  const a = attrs(component);
  setFirstAttribute(component, ['input[type="email"]', 'input'], 'placeholder', a['data-placeholder']);
  setFirstText(component, ['button[type="submit"]', 'button'], a['data-btn-text']);
  const form = component.get('tagName') === 'form' ? component : component.find('form')?.[0];
  if (form && a['data-layout']) {
    form.addStyle({
      display: 'flex',
      'flex-direction': a['data-layout'] === 'stacked' ? 'column' : 'row',
      'align-items': a['data-layout'] === 'stacked' ? 'stretch' : 'center',
    });
  }
}

function applyCountdown(component: Component) {
  const a = attrs(component);
  const result = formatCountdown(a['data-target'] || a['data-countdown'], a['data-expired-msg']);
  setText(component, '[data-role="countdown-title"]', a['data-title']);
  ['days', 'hours', 'minutes', 'seconds'].forEach((role, index) => setText(component, `[data-role="${role}"]`, result.values[index]));
  setDisplay(component, '[data-role="countdown-label"]', parseBool(a['data-show-labels'], true) && !result.expired);
  if (a['data-orientation']) {
    component.addStyle({ 'flex-direction': a['data-orientation'] === 'vertical' ? 'column' : 'row' });
  }
  component.find('[data-role="days"],[data-role="hours"],[data-role="minutes"],[data-role="seconds"]').forEach(number => {
    if (a['data-number-style'] === 'outlined') number.addStyle({ background: 'transparent', border: '1px solid var(--primary)', padding: '12px', 'border-radius': '10px' });
    if (a['data-number-style'] === 'solid') number.addStyle({ background: 'var(--primary)', color: 'var(--text-on-primary,#fff)', border: '1px solid transparent', padding: '12px', 'border-radius': '10px' });
    if (a['data-number-style'] === 'minimal') number.addStyle({ background: 'transparent', border: '0', padding: '0' });
  });
}

function applyScroller(component: Component) {
  const a = attrs(component);
  const speed = Number.parseInt(a['data-speed'] || '20', 10);
  const direction = a['data-direction'] === 'right' ? 'reverse' : 'normal';
  const duration = `${Number.isFinite(speed) ? speed : 20}s`;
  const candidates = component.find('span, [data-role="marquee-track"], [style*="animation"]');
  const targets = candidates.length ? candidates : [component];
  targets.forEach(target => {
    target.addStyle({
      animation: `wb-marquee ${duration} linear infinite`,
      'animation-direction': direction,
    });
  });
  if (parseBool(a['data-grayscale'] || a['data-greyscale'])) {
    component.find('img').forEach(img => img.addStyle({ filter: 'grayscale(1)' }));
  }
}

function applyAceternityTypewriter(component: Component) {
  const a = attrs(component);
  const duration = Number.parseFloat(a['data-speed'] || '4');
  const text = component.find('.wb-ac-typewriter-text')?.[0];
  if (!text) return;
  text.addStyle({
    'animation-duration': `${Number.isFinite(duration) ? Math.max(0.4, duration) : 4}s, .8s`,
  });
}

function applySocialIcons(component: Component) {
  const a = attrs(component);
  const items = parseSocialIcons(a['data-platforms'] || a['data-social-links']);
  component.addStyle({
    display: 'flex',
    gap: a['data-gap'] || '12px',
    'align-items': 'center',
    'flex-wrap': 'wrap',
  });
  component.components(items.map(item => renderSocialIcon(item, a['data-icon-style'] || 'filled', a['data-shape'] || 'soft')).join(''));
}

function applyStatistics(component: Component) {
  const a = attrs(component);
  setText(component, '[data-role="stats-title"]', a['data-title']);
  if (!a['data-stats']) return;
  try {
    const parsed = JSON.parse(a['data-stats']);
    if (!Array.isArray(parsed)) return;
    const grid = component.find('[data-role="stats-grid"]')?.[0];
    if (!grid) return;
    grid.components(parsed.map(item => `
      <div data-gjs-type="counter" style="text-align:center;padding:24px;background:var(--muted);border:1px solid var(--border);border-radius:16px;">
        <div data-stat-value="${escapeHtml(item.value || '')}" style="font-size:44px;font-weight:900;color:var(--pri,var(--primary));line-height:1;">${escapeHtml(item.value || '')}</div>
        <div style="font-size:12px;font-weight:700;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.08em;margin-top:8px;">${item.label || ''}</div>
      </div>
    `).join(''));
  } catch {
    // Keep existing stats when JSON is invalid.
  }
  component.addAttributes({ 'data-animate-counter': String(parseBool(a['data-animate'], true)) });
  const grid = component.find('[data-role="stats-grid"]')?.[0];
  if (grid && a['data-layout']) grid.addStyle({ display: a['data-layout'] === 'flex' ? 'flex' : 'grid', 'flex-wrap': 'wrap' });
}

function applyEventCards(component: Component) {
  const a = attrs(component);
  setText(component, '[data-role="section-title"]', a['data-title']);
  setText(component, '[data-role="section-subtitle"]', a['data-subtitle']);
  const cols = a['data-cols'];
  const grid = component.find('[data-role="cards-grid"]')?.[0];
  const items = parseJsonArray(a['data-items']);
  if (grid && items.length && attrs(grid)['data-rendered-items'] !== a['data-items']) {
    const type = String(component.get('type') || a['data-gjs-type']);
    const cardStyle = 'background:var(--card);border:1px solid var(--border);border-radius:14px;padding:22px;color:var(--foreground);box-sizing:border-box;';
    const imageStyle = 'width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;margin-bottom:16px;';
    const renderCard = (item: Record<string, unknown>) => {
      if (type === 'speaker-grid') return `<article data-gjs-type="card" data-role="card" style="${cardStyle}">${item.photo ? `<img data-gjs-type="image" data-role="speaker-photo" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.name)}" style="${imageStyle}" />` : ''}<h3 data-gjs-type="heading" data-role="speaker-name" style="margin:0 0 6px;font-size:20px;">${escapeHtml(item.name)}</h3><p data-gjs-type="paragraph" data-role="designation" style="margin:0;color:var(--primary);font-weight:700;">${escapeHtml(item.designation)}</p><p data-gjs-type="paragraph" data-role="company" style="margin:6px 0 0;color:var(--muted-foreground);">${escapeHtml(item.organization)}</p><p data-gjs-type="paragraph" data-role="bio" style="margin:14px 0 0;color:var(--muted-foreground);line-height:1.6;">${escapeHtml(item.bio)}</p></article>`;
      if (type === 'committee') return `<article data-gjs-type="card" data-role="card" data-role-name="${escapeHtml(item.committeeType)}" style="${cardStyle}">${item.photo ? `<img data-gjs-type="image" data-role="speaker-photo" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.name)}" style="${imageStyle}" />` : ''}<h3 data-gjs-type="heading" style="margin:0 0 6px;font-size:20px;">${escapeHtml(item.name)}</h3><p data-gjs-type="paragraph" style="margin:0;color:var(--primary);font-weight:700;">${escapeHtml(item.designation)}</p><p data-gjs-type="paragraph" data-role="company" style="margin:6px 0 0;color:var(--muted-foreground);">${escapeHtml(item.institution)}</p></article>`;
      if (type === 'sponsor-grid') return `<article data-gjs-type="card" data-role="card" data-tier="${escapeHtml(item.tier)}" style="${cardStyle}text-align:center;">${item.logoUrl ? `<a data-gjs-type="button" href="${escapeHtml(item.websiteUrl || '#')}" aria-label="${escapeHtml(item.name)}"><img data-gjs-type="image" src="${escapeHtml(item.logoUrl)}" alt="${escapeHtml(item.name)}" style="width:100%;height:72px;object-fit:contain;" /></a>` : ''}<h3 data-gjs-type="heading" style="margin:14px 0 0;font-size:16px;">${escapeHtml(item.name)}</h3><p data-gjs-type="paragraph" style="margin:5px 0 0;color:var(--muted-foreground);">${escapeHtml(item.tier)}</p></article>`;
      if (type === 'agenda') return `<article data-gjs-type="card" data-role="card" style="${cardStyle}display:grid;grid-template-columns:minmax(105px,auto) 1fr;gap:20px;"><div data-gjs-type="paragraph" data-role="session-time" style="color:var(--primary);font-weight:800;">${escapeHtml(`${item.startTime || ''} - ${item.endTime || ''}`)}</div><div><h3 data-gjs-type="heading" style="margin:0;font-size:20px;">${escapeHtml(item.title)}</h3><p data-gjs-type="paragraph" data-role="track" style="margin:7px 0 0;color:var(--muted-foreground);">${escapeHtml(item.track || item.room)}</p><span data-gjs-type="badge" data-role="session-tag" style="display:inline-block;margin-top:12px;padding:5px 9px;border-radius:999px;background:var(--muted);">${escapeHtml(item.sessionType)}</span></div></article>`;
      return `<article data-gjs-type="card" data-role="card" data-highlighted="${Boolean(item.isHighlighted)}" style="${cardStyle}"><h3 data-gjs-type="heading" style="margin:0;font-size:22px;">${escapeHtml(item.name)}</h3><div style="display:flex;align-items:baseline;gap:5px;margin:18px 0;"><span data-gjs-type="paragraph" data-role="currency">${escapeHtml(item.currency)}</span><strong data-gjs-type="heading" style="font-size:38px;">${escapeHtml(item.price)}</strong></div><p data-gjs-type="paragraph" style="color:var(--muted-foreground);">${escapeHtml(item.description)}</p><ul data-role="features">${Array.isArray(item.benefits) ? item.benefits.map(feature => `<li data-gjs-type="paragraph">${escapeHtml(feature)}</li>`).join('') : ''}</ul><a data-gjs-type="button" href="${escapeHtml(item.registrationUrl || '#')}" style="display:inline-flex;margin-top:16px;padding:12px 20px;border-radius:9px;background:var(--primary);color:var(--background);text-decoration:none;font-weight:800;">Register</a></article>`;
    };
    grid.components(items.map(renderCard).join(''));
    grid.addAttributes({ 'data-rendered-items': a['data-items'] });
  }
  if (grid && cols) grid.addStyle({ 'grid-template-columns': `repeat(${cols}, minmax(0, 1fr))` });
  setDisplay(component, '[data-role="company"]', parseBool(a['data-show-company'], true));
  setDisplay(component, '[data-role="bio"]', parseBool(a['data-show-bio'], false));
  setDisplay(component, '[data-role="socials"]', parseBool(a['data-show-socials'], true));
  setDisplay(component, '[data-role="tracks"],[data-role="track"]', parseBool(a['data-show-tracks'], true));
  setDisplay(component, '[data-role="headshot"],[data-role="speaker-photo"]', parseBool(a['data-show-heads'], true));
  setDisplay(component, '[data-role="tags"],[data-role="session-tag"]', parseBool(a['data-show-tags'], true));
  setDisplay(component, '[data-role="features"]', parseBool(a['data-features'], true));
  if (a['data-logo-size']) component.find('img').forEach(image => image.addStyle({ 'max-height': a['data-logo-size'] === 'small' ? '48px' : a['data-logo-size'] === 'large' ? '96px' : '68px', 'object-fit': 'contain' }));
  if (a['data-image-crop']) component.find('img').forEach(image => image.addStyle({
    'object-fit': 'cover',
    'object-position': 'center',
    'aspect-ratio': a['data-image-crop'] === 'portrait' ? '3/4' : '1/1',
    'border-radius': a['data-image-crop'] === 'circle' ? '999px' : image.getStyle()['border-radius'] || '12px',
  }));
  if (a['data-image-shape']) component.find('img').forEach(image => image.addStyle({ 'border-radius': a['data-image-shape'] === 'circle' ? '999px' : a['data-image-shape'] === 'square' ? '0' : '14px' }));
  if (a['data-layout-type'] === 'list' && grid) grid.addStyle({ 'grid-template-columns': '1fr' });
  if (a['data-layout-type'] === 'carousel' && grid) grid.addStyle({ 'grid-auto-flow': 'column', 'grid-auto-columns': 'minmax(260px,34%)', overflow: 'auto' });
  if (a['data-layout-type'] === 'masonry' && grid) grid.addStyle({ 'grid-template-columns': 'repeat(3,minmax(0,1fr))', 'align-items': 'start' });
  if (a['data-card-style'] === 'minimal') component.find('[data-role="card"]').forEach(card => card.addStyle({ background: 'transparent', 'box-shadow': 'none' }));
  if (a['data-view-type'] && grid) {
    grid.addStyle({
      display: a['data-view-type'] === 'timeline' ? 'flex' : 'grid',
      'flex-direction': a['data-view-type'] === 'timeline' ? 'column' : '',
      'grid-template-columns': a['data-view-type'] === 'grid' ? 'repeat(2,minmax(0,1fr))' : '1fr',
    });
  }
  if (a['data-limit']) component.find('[data-role="card"],article').forEach((card, index) => setDisplay(card, ':self', index < Number(a['data-limit'])));
  if (a['data-hover-effect']) component.find('[data-role="card"],article').forEach(card => card.addAttributes({ 'data-hover-effect': a['data-hover-effect'] === 'zoom' ? 'scale' : a['data-hover-effect'] }));
  if (a['data-tiers']) {
    const tiers = a['data-tiers'].split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    component.find('[data-tier]').forEach(card => setDisplay(card, ':self', tiers.length === 0 || tiers.includes(String(attrs(card)['data-tier'] || '').toLowerCase())));
  }
  if (a['data-roles']) {
    const roles = a['data-roles'].split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    component.find('[data-role-name]').forEach(card => setDisplay(card, ':self', roles.length === 0 || roles.includes(String(attrs(card)['data-role-name'] || '').toLowerCase())));
  }
  if (!parseBool(a['data-show-sold-out'], true)) component.find('[data-sold-out="true"]').forEach(card => setDisplay(card, ':self', false));
}

function applyVenue(component: Component) {
  const a = attrs(component);
  setFirstText(component, ['[data-role="venue-name"]', 'h2', 'h3'], a['data-venue-name']);
  setFirstText(component, ['[data-role="venue-address"]', '[data-role="address"]'], a['data-address']);
  setFirstText(component, ['[data-role="venue-description"]', '[data-role="description"]'], a['data-description']);
  setFirstAttribute(component, ['[data-role="venue-photo"]', 'img'], 'src', a['data-photo']);
  const layout = component.find('[data-role="venue-layout"]')?.[0] || component;
  if (a['data-layout']) layout.addStyle({ 'flex-direction': a['data-layout'] === 'right' ? 'row-reverse' : a['data-layout'] === 'stacked' ? 'column' : 'row' });
  const iframe = component.find('iframe')?.[0];
  if (iframe && a['data-map-url']) iframe.addAttributes({ src: a['data-map-url'] });
  if (iframe && a['data-theme']) {
    iframe.addAttributes({ 'data-map-theme': a['data-theme'], 'data-map-type': a['data-map-type'] || 'google' });
    iframe.addStyle({ filter: {
      light: 'none',
      dark: 'invert(.9) hue-rotate(180deg) brightness(.82) contrast(1.08)',
      satellite: 'saturate(1.45) contrast(1.08)',
      brand: 'hue-rotate(24deg) saturate(1.2)',
    }[a['data-theme']] || 'none' });
  }
}

function applyPricing(component: Component) {
  const a = attrs(component);
  if (a['data-currency']) component.find('[data-role="currency"]').forEach(node => node.components(a['data-currency']));
  component.find('[data-highlighted="true"]').forEach(card => {
    const highlighted = parseBool(a['data-highlight'], true);
    card.addStyle({ border: highlighted ? '2px solid var(--primary)' : '1px solid var(--border)' });
    setDisplay(card, '[data-role="popular"]', highlighted);
  });
}

export function applyComponentSettings(component: Component) {
  const type = component.get('type') || attrs(component)['data-gjs-type'];
  if (type === 'section') applySection(component);
  if (type === 'container') applyContainer(component);
  if (type === 'grid') applyGrid(component);
  if (type === 'card') applyCard(component);
  if (type === 'spacer') applySpacer(component);
  if (type === 'tabs') applyTabs(component);
  if (type === 'accordion') applyAccordion(component);
  if (['heading', 'subheading', 'paragraph', 'lead-text', 'highlight', 'blockquote'].includes(String(type))) applyTypography(component);
  if (type === 'counter') applyCounter(component);
  if (type === 'hero') applyHero(component);
  if (type === 'event-overview') {
    const a = attrs(component);
    setFirstText(component, ['[data-role="section-title"]', 'h2'], a['data-title']);
    setFirstText(component, ['[data-role="description"]', 'p'], a['data-description']);
  }
  if (type === 'organizer-message') {
    const a = attrs(component);
    setFirstText(component, ['[data-role="organizer-name"]', 'h3'], a['data-name']);
    setFirstText(component, ['[data-role="designation"]'], a['data-designation']);
    setFirstText(component, ['[data-role="message"]', 'blockquote', 'p'], a['data-message']);
    setFirstAttribute(component, ['[data-role="organizer-photo"]', 'img'], 'src', a['data-photo']);
  }
  if (type === 'video') applyVideo(component);
  if (type === 'header') applyHeader(component);
  if (type === 'navigation') applyNavigation(component);
  if (type === 'footer' || type === 'contact-footer') applyFooter(component);
  if (type === 'contact-footer') applyContactFooter(component);
  if (type === 'button') applyButton(component);
  if (type === 'button-group') applyButtonGroup(component);
  if (type === 'contact-form' || type === 'sponsor-inquiry') applyContactForm(component);
  if (type === 'newsletter') applyNewsletter(component);
  if (type === 'image' || type === 'image-text') applyImage(component);
  if (type === 'image-text') applyImageText(component);
  if (type === 'icon-block') applyIconBlock(component);
  if (type === 'featured-speaker') applyFeaturedSpeaker(component);
  if (type === 'registration-cta') applyRegistrationCta(component);
  if (type === 'gallery') applyGallery(component);
  if (type === 'countdown') applyCountdown(component);
  if (type === 'venue') applyVenue(component);
  if (type === 'breadcrumb') applyBreadcrumb(component);
  if (type === 'progress-bar') applyProgressBar(component);
  if (type === 'map') applyMap(component);
  if (type === 'qr-code') applyQrCode(component);
  if (type === 'badge') applyBadge(component);
  if (type === 'alert') applyAlert(component);
  if (type === 'marquee' || type === 'logo-marquee' || type === 'aceternity-infinite-moving-cards') applyScroller(component);
  if (type === 'aceternity-typewriter-effect') applyAceternityTypewriter(component);
  if (type === 'social-icons') applySocialIcons(component);
  if (type === 'social-icon') applySingleSocialIcon(component);
  if (type === 'statistics') applyStatistics(component);
  if (['speaker-grid', 'sponsor-grid', 'committee', 'agenda', 'pricing'].includes(String(type))) {
    applyEventCards(component);
    if (String(type) === 'sponsor-grid') applyScroller(component);
    if (String(type) === 'pricing') applyPricing(component);
  }
  applyAnimation(component);
}
