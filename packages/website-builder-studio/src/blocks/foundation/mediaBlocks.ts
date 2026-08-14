import type { Editor } from 'grapesjs';

const icon = (paths: string) => `
  <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `
  <div class="gjs-block-custom">
    <div class="gjs-block-icon-wrapper">${svg}</div>
    <div class="gjs-block-label">${label}</div>
  </div>`;

export function registerMediaBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('media-image', {
    label: card(icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'), 'Image'),
    category: 'Media',
    content: `<figure data-gjs-type="image" data-object-fit="cover" data-aspect-ratio="16/9" data-caption="Event image caption" style="margin: 0; width: 100%; box-sizing: border-box;">
      <img src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop" alt="Event image" loading="lazy" style="width: 100%; aspect-ratio: 16/9; height: auto; border-radius: 16px; object-fit: cover; display: block;" />
      <figcaption data-role="caption" data-gjs-type="paragraph" style="font-size: 13px; color: var(--muted-foreground); margin-top: 8px; text-align: center;">Event image caption</figcaption>
    </figure>`,
  });

  bm.add('media-video-youtube', {
    label: card(icon('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>'), 'YouTube Video'),
    category: 'Media',
    content: `<div data-gjs-type="video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 16px; background: var(--surface);">
      <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Event Video" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 16px;"></iframe>
    </div>`,
  });

  bm.add('media-gallery-grid', {
    label: card(icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'), 'Photo Gallery'),
    category: 'Media',
    content: `
      <div data-gjs-type="gallery" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px; box-sizing: border-box;">
        ${[
          'photo-1540575467063-178a50c2df87',
          'photo-1515187029135-18ee286d815b',
          'photo-1531058020387-3be344556be6',
          'photo-1475721027785-f74eccf877e2',
          'photo-1540575467063-178a50c2df87',
          'photo-1560523159-4a9692d222ef',
        ].map(id => `<img src="https://images.unsplash.com/${id}?w=400&auto=format&fit=crop" alt="Gallery photo" loading="lazy" style="width: 100%; height: 200px; object-fit: cover; border-radius: 10px; display: block;" />`).join('')}
      </div>`,
  });

  bm.add('media-image-text-left', {
    label: card(icon('<rect x="2" y="4" width="9" height="16" rx="2"/><line x1="14" y1="8" x2="22" y2="8"/><line x1="14" y1="12" x2="22" y2="12"/><line x1="14" y1="16" x2="18" y2="16"/>'), 'Image + Text'),
    category: 'Media',
    content: `
      <div data-gjs-type="image-text" style="display: flex; gap: 48px; align-items: center; flex-wrap: wrap; padding: 40px 24px; box-sizing: border-box;">
        <div style="flex: 1; min-width: 280px;">
          <img src="https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600&auto=format&fit=crop" alt="Section image" loading="lazy" style="width: 100%; height: 360px; object-fit: cover; border-radius: 20px; display: block;" />
        </div>
        <div style="flex: 1; min-width: 280px;">
          <p data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">About the Event</p>
          <h2 data-gjs-type="heading" style="font-size: 36px; font-weight: 800; color: var(--foreground); line-height: 1.2; margin: 0 0 16px 0;">Where Ideas Shape the Future</h2>
          <p data-gjs-type="paragraph" style="font-size: 16px; color: var(--muted-foreground); line-height: 1.75; margin: 0 0 24px 0;">Join thousands of experts, innovators, and thought leaders for three transformative days of discovery, debate, and connection.</p>
          <a data-gjs-type="button" href="#" style="display: inline-flex; align-items: center; background: var(--pri, var(--primary)); color: var(--background); padding: 13px 28px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px;">Learn More</a>
        </div>
      </div>`,
  });

  bm.add('media-logo-marquee', {
    label: card(icon('<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="18" y2="12"/>'), 'Logo Marquee'),
    category: 'Media',
    content: `
      <div data-gjs-type="logo-marquee" style="padding: 24px; overflow: hidden; box-sizing: border-box;">
        <p data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground); text-align: center; margin: 0 0 20px 0;">Supported By</p>
        <div style="display: flex; justify-content: center; align-items: center; gap: 48px; flex-wrap: wrap; opacity: 0.7;">
          ${['MICROSOFT', 'GOOGLE', 'AWS', 'CISCO', 'IBM', 'ORACLE'].map(n => `<div data-gjs-type="heading" style="font-size: 18px; font-weight: 900; letter-spacing: -0.02em; color: var(--foreground);">${n}</div>`).join('')}
        </div>
      </div>`,
  });

  bm.add('media-icon-block', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'), 'Icon Block'),
    category: 'Media',
    content: `
      <div data-gjs-type="icon-block" style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; text-align: center;">
        <div style="width: 52px; height: 52px; border-radius: 14px; background: color-mix(in srgb, var(--primary) 15%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--pri, var(--primary))" stroke-width="2" style="width: 24px; height: 24px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <h4 data-gjs-type="heading" style="font-size: 16px; font-weight: 700; color: var(--foreground); margin: 0;">Feature Title</h4>
        <p data-gjs-type="paragraph" style="font-size: 14px; color: var(--muted-foreground); line-height: 1.6; margin: 0;">Brief description of this feature or benefit.</p>
      </div>`,
  });
}
