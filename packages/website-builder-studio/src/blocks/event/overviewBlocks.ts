import type { Editor } from 'grapesjs';
import type { EventDataSnapshot } from '../../types';

const icon = (paths: string) => `<svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `<div class="gjs-block-custom"><div class="gjs-block-icon-wrapper">${svg}</div><div class="gjs-block-label">${label}</div></div>`;

export function registerOverviewBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const desc = s?.description || 'Join thousands of experts, innovators, and thought leaders for three transformative days of discovery, debate, and deep collaboration. This premier gathering brings together the brightest minds to shape the future.';
  const objectives = s?.objectives || ['Advance the frontiers of research and innovation', 'Foster cross-disciplinary collaboration and exchange', 'Showcase cutting-edge technologies and discoveries', 'Build lasting professional networks and partnerships'];
  const organizer = s?.organizer || { name: 'Prof. Robert Marshall', designation: 'Conference Chair', message: 'It is my distinct honor to invite you to this landmark event. We have curated an outstanding program of keynotes, workshops, and panel discussions that promise to inspire and challenge. I look forward to welcoming you.', photo: '' };
  const banner = s?.banner || 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&auto=format&fit=crop';

  bm.add('overview-split', {
    label: card(icon('<rect x="2" y="3" width="9" height="18" rx="2"/><line x1="14" y1="7" x2="22" y2="7"/><line x1="14" y1="12" x2="22" y2="12"/><line x1="14" y1="17" x2="18" y2="17"/>'), 'About Split'),
    category: 'Event Overview',
    content: `
      <section data-gjs-type="event-overview" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto; display: flex; gap: 64px; align-items: center; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 280px;">
            <img data-gjs-type="image" src="${banner}" alt="About event" loading="lazy" style="width: 100%; height: 400px; object-fit: cover; border-radius: 24px; display: block;" />
          </div>
          <div style="flex: 1; min-width: 280px;">
            <p data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">About the Event</p>
            <h2 data-gjs-type="heading" style="font-size: 38px; font-weight: 900; color: var(--foreground); line-height: 1.15; margin: 0 0 20px 0; letter-spacing: -0.02em;">A Conference That Changes Everything</h2>
            <p data-gjs-type="paragraph" style="font-size: 16px; color: var(--muted-foreground); line-height: 1.75; margin: 0 0 28px 0;">${desc}</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${objectives.map(obj => `<div style="display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: var(--foreground); line-height: 1.5;"><span style="color: var(--pri, var(--primary)); font-size: 18px; flex-shrink: 0; line-height: 1.3;">✓</span>${obj}</div>`).join('')}
            </div>
          </div>
        </div>
      </section>`,
  });

  bm.add('overview-centered', {
    label: card(icon('<path d="M3 12h18M3 6h18M3 18h12"/>'), 'About Centered'),
    category: 'Event Overview',
    content: `
      <section data-gjs-type="event-overview" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box; text-align: center;">
        <div style="max-width: 760px; margin: 0 auto 56px auto;">
          <p data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">About the Conference</p>
          <h2 data-gjs-type="heading" style="font-size: 42px; font-weight: 900; color: var(--foreground); line-height: 1.15; margin: 0 0 20px 0; letter-spacing: -0.02em;">Where Innovation Meets Academia</h2>
          <p data-gjs-type="paragraph" style="font-size: 17px; color: var(--muted-foreground); line-height: 1.75; margin: 0;">${desc}</p>
        </div>
        <div style="max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px;">
          ${objectives.map((obj, i) => `
            <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 16px; padding: 24px; text-align: left;">
              <div style="width: 40px; height: 40px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 15%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; color: var(--pri, var(--primary)); margin-bottom: 14px;">${(i + 1).toString().padStart(2, '0')}</div>
              <p style="font-size: 14px; color: var(--foreground); line-height: 1.6; margin: 0;">${obj}</p>
            </div>`).join('')}
        </div>
      </section>`,
  });

  bm.add('organizer-message', {
    label: card(icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M8 11 L4 21"/>'), 'Organizer Message'),
    category: 'Event Overview',
    content: `
      <section data-gjs-type="organizer-message" style="padding: 80px 24px; background: var(--muted); border-top: 1px solid color-mix(in srgb, var(--primary) 10%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--primary) 10%, transparent); box-sizing: border-box;">
        <div style="max-width: 860px; margin: 0 auto; display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap;">
          <div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; width: 160px;">
            <div style="width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, var(--muted), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 900; color: var(--background); overflow: hidden; border: 3px solid color-mix(in srgb, var(--primary) 30%, transparent);">${organizer.photo ? `<img src="${organizer.photo}" alt="${organizer.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : organizer.name.charAt(0)}</div>
            <div style="text-align: center;">
              <div data-role="name" data-gjs-type="heading" style="font-size: 15px; font-weight: 800; color: var(--foreground);">${organizer.name}</div>
              <div data-gjs-type="paragraph" style="font-size: 13px; color: var(--muted-foreground); margin-top: 2px;">${organizer.designation || 'Conference Chair'}</div>
            </div>
          </div>
          <div style="flex: 1; min-width: 240px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Message from the Chair</p>
            <svg viewBox="0 0 40 32" fill="none" style="width: 40px; height: 32px; margin-bottom: 12px; opacity: 0.3;"><path d="M0 32V20.8C0 14.4 2.13333 8.66667 6.4 3.6L10.4 0 16 4.8l-4.8 5.6C8.53333 13.3333 7.2 16.6667 7.2 20.8V32H0zm21.6 0V20.8c0-6.4 2.1333-12.13333 6.4-17.2L32 0l5.6 4.8-4.8 5.6C30.1333 13.3333 28.8 16.6667 28.8 20.8V32h-7.2z" fill="var(--primary)"/></svg>
            <blockquote data-role="message" data-gjs-type="blockquote" style="font-size: 17px; font-style: italic; color: var(--foreground); line-height: 1.75; margin: 0 0 20px 0; border: none; padding: 0;">${organizer.message || 'Welcome to this landmark event. We have curated an outstanding program and I look forward to welcoming you.'}</blockquote>
            <div style="font-size: 14px; font-weight: 700; color: var(--muted-foreground);">— ${organizer.name}, ${organizer.designation || 'Conference Chair'}</div>
          </div>
        </div>
      </section>`,
  });
}

export function registerStatisticsBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const stats = [
    { value: s?.stats?.totalDelegates?.toLocaleString() || '1,200+', label: 'Attending Delegates' },
    { value: s?.stats?.totalSpeakers?.toString() || '85+', label: 'Expert Speakers' },
    { value: s?.stats?.totalSessions?.toString() || '48', label: 'Sessions & Workshops' },
    { value: s?.stats?.totalCountries?.toString() || '30+', label: 'Countries Represented' },
  ];

  bm.add('stats-4col', {
    label: card(icon('<path d="M18 20V10M12 20V4M6 20v-6"/>'), 'Stats 4 Column'),
    category: 'Event Statistics',
    content: `
      <section data-gjs-type="statistics" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <h2 data-role="stats-title" data-gjs-type="heading" style="text-align:center;font-size:36px;font-weight:900;color:var(--foreground);margin:0 0 36px;">By The Numbers</h2>
        <div data-role="stats-grid" style="max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px;">
          ${stats.map(st => `
            <div data-gjs-type="counter" style="text-align: center; padding: 32px 20px; background: var(--muted); border: 1px solid var(--muted); border-radius: 20px;">
              <div style="font-size: 52px; font-weight: 900; color: var(--pri, var(--primary)); line-height: 1; letter-spacing: -0.03em; margin-bottom: 8px;">${st.value}</div>
              <div style="font-size: 14px; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.08em;">${st.label}</div>
            </div>`).join('')}
        </div>
      </section>`,
  });

  bm.add('stats-banner', {
    label: card(icon('<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 12h12"/>'), 'Stats Banner'),
    category: 'Event Statistics',
    content: `
      <section data-gjs-type="statistics" style="padding: 48px 24px; background: linear-gradient(135deg, var(--pri, var(--primary)) 0%, var(--primary) 100%); box-sizing: border-box;">
        <div data-role="stats-grid" style="max-width: 1000px; margin: 0 auto; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 0;">
          ${stats.map((st, i) => `
            <div data-gjs-type="counter" style="flex: 1; min-width: 160px; text-align: center; padding: 20px; ${i > 0 ? 'border-left: 1px solid var(--muted);' : ''}">
              <div style="font-size: 44px; font-weight: 900; color: var(--foreground); line-height: 1; margin-bottom: 6px; letter-spacing: -0.03em;">${st.value}</div>
              <div style="font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em;">${st.label}</div>
            </div>`).join('')}
        </div>
      </section>`,
  });
}

export function registerCountdownBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const startDate = s?.startDate || '2026-10-24T09:00:00';
  const city = s?.venue?.city || 'San Francisco';

  bm.add('countdown-minimal', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'), 'Countdown Minimal'),
    category: 'Countdown Timers',
    content: `
      <section data-gjs-type="countdown" data-target="${startDate}" data-title="Conference Starts In" data-show-labels="true" style="padding: 60px 24px; background: var(--base, var(--background)); text-align: center; box-sizing: border-box;">
        <p data-role="countdown-title" data-gjs-type="subheading" style="font-size: 14px; font-weight: 700; color: var(--muted-foreground); margin: 0 0 24px 0; text-transform: uppercase; letter-spacing: 0.1em;">Conference Starts In</p>
        <div style="display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap;">
          ${[['45', 'Days'], ['12', 'Hours'], ['38', 'Min'], ['52', 'Sec']].map(([n, l], i) => `
            <div style="text-align: center;">
              <div data-role="${l.toLowerCase() === 'min' ? 'minutes' : l.toLowerCase() === 'sec' ? 'seconds' : l.toLowerCase()}" style="font-size: 56px; font-weight: 900; color: var(--foreground); line-height: 1; font-variant-numeric: tabular-nums;">${n}</div>
              <div data-role="countdown-label" style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground); margin-top: 4px;">${l}</div>
            </div>
            ${i < 3 ? `<div style="font-size: 40px; font-weight: 300; color: var(--border-strong, var(--muted)); line-height: 1; margin-bottom: 16px;">:</div>` : ''}`).join('')}
        </div>
      </section>`,
  });

  bm.add('countdown-glass', {
    label: card(icon('<rect x="2" y="3" width="20" height="18" rx="4"/><polyline points="12 7 12 12 15 14"/>'), 'Countdown Glass'),
    category: 'Countdown Timers',
    content: `
      <section data-gjs-type="countdown" data-target="${startDate}" data-title="Event Starts In" data-show-labels="true" style="padding: 80px 24px; background: linear-gradient(135deg, var(--background) 0%, var(--background) 100%); text-align: center; box-sizing: border-box;">
        <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Don't Miss It</p>
        <h2 data-role="countdown-title" data-gjs-type="heading" style="font-size: 32px; font-weight: 900; color: var(--foreground); margin: 0 0 40px 0; letter-spacing: -0.02em;">Event Starts In</h2>
        <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; max-width: 600px; margin: 0 auto 40px auto;">
          ${[['45', 'Days'], ['12', 'Hours'], ['38', 'Minutes'], ['52', 'Seconds']].map(([n, l]) => `
            <div style="flex: 1; min-width: 100px; background: var(--bg-surface-hover, var(--muted)); backdrop-filter: blur(16px); border: 1px solid var(--border-default, var(--muted)); border-radius: 20px; padding: 24px 16px; text-align: center; box-shadow: 0 8px 24px var(--muted);">
              <div data-role="${l.toLowerCase()}" style="font-size: 52px; font-weight: 900; color: var(--pri, var(--primary)); line-height: 1; font-variant-numeric: tabular-nums;">${n}</div>
              <div data-role="countdown-label" style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground); margin-top: 8px;">${l}</div>
            </div>`).join('')}
        </div>
        <a data-gjs-type="button" href="#register" style="display: inline-block; background: var(--pri, var(--primary)); color: var(--background); padding: 14px 36px; border-radius: 10px; font-weight: 800; font-size: 15px; text-decoration: none; box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 35%, transparent);">Register Now</a>
      </section>`,
  });

  bm.add('countdown-banner', {
    label: card(icon('<rect x="1" y="8" width="22" height="8" rx="2"/>'), 'Countdown Banner'),
    category: 'Countdown Timers',
    content: `
      <div data-gjs-type="countdown" data-target="${startDate}" data-show-labels="true" style="background: linear-gradient(135deg, var(--pri, var(--primary)) 0%, #7c3aed 100%); padding: 16px 24px; display: flex; align-items: center; justify-content: center; gap: 24px; flex-wrap: wrap; box-sizing: border-box;">
        <p style="color: var(--muted); font-size: 14px; font-weight: 700; margin: 0; white-space: nowrap;">📅 ${city} Conference Begins In:</p>
        <div style="display: flex; gap: 16px; align-items: center;">
          ${[['45', 'Days'], ['12', 'Hrs'], ['38', 'Min']].map(([n, l], i) => `
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 900; color: var(--background); line-height: 1; font-variant-numeric: tabular-nums;">${n}</div>
              <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--muted);">${l}</div>
            </div>
            ${i < 2 ? `<div style="font-size: 24px; color: var(--muted);">:</div>` : ''}`).join('')}
        </div>
        <a href="#register" style="background: var(--border-strong, var(--muted)); border: 1px solid var(--muted); color: var(--background); padding: 8px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none; white-space: nowrap;">Register →</a>
      </div>`,
  });
}

export function registerVenueBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const venue = s?.venue || { name: 'Moscone Center', address: '747 Howard St', city: 'San Francisco', country: 'USA', description: 'One of the largest convention centers in the United States, featuring world-class facilities and stunning views of downtown San Francisco.', photos: [], mapEmbedUrl: '' };
  const hotels = s?.hotels?.length ? s.hotels : [
    { id: '1', name: 'Marriott Marquis', distance: '0.2 miles', bookingUrl: '#', photo: '', rating: 5, priceRange: '$299–$450/night' },
    { id: '2', name: 'Hilton Union Square', distance: '0.5 miles', bookingUrl: '#', photo: '', rating: 4, priceRange: '$220–$380/night' },
    { id: '3', name: 'Parc 55 San Francisco', distance: '0.8 miles', bookingUrl: '#', photo: '', rating: 4, priceRange: '$189–$320/night' },
  ];

  bm.add('venue-split', {
    label: card(icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'), 'Venue Info'),
    category: 'Venue & Travel',
    content: `
      <section data-gjs-type="venue" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto; display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 280px;">
            <p data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Conference Venue</p>
            <h2 data-role="venue-title" data-gjs-type="heading" style="font-size: 36px; font-weight: 900; color: var(--foreground); margin: 0 0 12px 0; letter-spacing: -0.02em;">${venue.name}</h2>
            <p data-gjs-type="paragraph" style="font-size: 15px; color: var(--muted-foreground); margin: 0 0 20px 0; line-height: 1.7;">${venue.description || ''}</p>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px;">
              <div style="display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--foreground);">
                <span style="font-size: 18px;">📍</span><span>${venue.address}, ${venue.city}, ${venue.country}</span>
              </div>
              ${venue.visaInfo ? `<div style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--foreground);"><span style="font-size: 18px; flex-shrink: 0;">🛂</span><span>${venue.visaInfo}</span></div>` : ''}
              ${venue.transportInfo ? `<div style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; color: var(--foreground);"><span style="font-size: 18px; flex-shrink: 0;">🚌</span><span>${venue.transportInfo}</span></div>` : ''}
            </div>
            <a data-gjs-type="button" href="https://maps.google.com/?q=${encodeURIComponent(venue.address + ', ' + venue.city)}" target="_blank" style="display: inline-flex; align-items: center; gap: 8px; color: var(--pri, var(--primary)); font-weight: 700; font-size: 14px; text-decoration: none; border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); padding: 10px 18px; border-radius: 8px; background: var(--muted);">Open in Maps →</a>
          </div>
          <div style="flex: 1; min-width: 280px; min-height: 360px; border-radius: 20px; overflow: hidden; border: 1px solid var(--border);">
            ${venue.mapEmbedUrl ? `<iframe data-role="venue-map" src="${venue.mapEmbedUrl}" width="100%" height="100%" style="border: 0; display: block; min-height: 360px;" allowfullscreen loading="lazy"></iframe>` : venue.photos?.[0] ? `<img data-gjs-type="image" src="${venue.photos[0]}" alt="${venue.name}" style="width: 100%; height: 100%; min-height: 360px; object-fit: cover; display: block;" />` : `<div style="width: 100%; min-height: 360px; background: var(--muted); display: flex; align-items: center; justify-content: center; color: var(--foreground); font-size: 14px;">Map / Venue Photo</div>`}
          </div>
        </div>
      </section>`,
  });

  bm.add('hotel-information', {
    label: card(icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'), 'Hotels'),
    category: 'Venue & Travel',
    content: `
      <section data-gjs-type="gallery" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1000px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 48px;">
            <h2 style="font-size: 36px; font-weight: 900; color: var(--foreground); margin: 0 0 8px 0; letter-spacing: -0.02em;">Recommended Hotels</h2>
            <p style="font-size: 15px; color: var(--muted-foreground);">Specially negotiated rates for conference attendees</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
            ${hotels.map(h => `
              <div style="background: var(--muted); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; box-sizing: border-box;">
                <div style="height: 180px; background: var(--bg-surface-hover, var(--muted)); overflow: hidden;">${h.photo ? `<img src="${h.photo}" alt="${h.name}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 40px; color: var(--border-default, var(--muted));">🏨</div>`}</div>
                <div style="padding: 20px; display: flex; flex-direction: column; gap: 8px;">
                  <h3 style="font-size: 17px; font-weight: 800; color: var(--foreground); margin: 0;">${h.name}</h3>
                  <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: var(--muted-foreground);">
                    ${h.distance ? `<span>📍 ${h.distance} from venue</span>` : ''}
                    ${h.rating ? `<span>${'⭐'.repeat(h.rating)}</span>` : ''}
                  </div>
                  ${h.priceRange ? `<div style="font-size: 14px; font-weight: 700; color: var(--pri, var(--primary));">${h.priceRange}</div>` : ''}
                  <a href="${h.bookingUrl || '#'}" target="_blank" style="display: block; text-align: center; background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--pri, var(--primary)); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); padding: 10px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none; margin-top: 8px;">Book Now</a>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });
}

export function registerGalleryBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const photos = s?.gallery?.filter(g => g.type === 'PHOTO')?.map(g => g.url) || [
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600',
    'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=600',
    'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=600',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=600',
    'https://images.unsplash.com/photo-1560523159-4a9692d222ef?w=600',
    'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=600',
  ];

  bm.add('gallery-grid', {
    label: card(icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'), 'Photo Gallery'),
    category: 'Gallery & Media',
    content: `
      <section data-gjs-type="section" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 48px;">
            <h2 data-role="section-title" data-gjs-type="heading" style="font-size: 38px; font-weight: 900; color: var(--foreground); margin: 0 0 8px 0; letter-spacing: -0.02em;">Gallery</h2>
            <p data-role="section-subtitle" data-gjs-type="paragraph" style="font-size: 15px; color: var(--muted-foreground);">Highlights from past editions</p>
          </div>
          <div data-role="cards-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            ${photos.map((url, i) => `<div data-gjs-type="card" style="aspect-ratio: ${i === 0 || i === 5 ? '1/1' : '1/1'}; overflow: hidden; border-radius: 14px; cursor: pointer;"><img data-gjs-type="image" src="${url}&auto=format&fit=crop" alt="Gallery photo ${i + 1}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s;" /></div>`).join('')}
          </div>
        </div>
      </section>`,
  });
}

export function registerContactFooterBlocks(editor: Editor, s?: EventDataSnapshot) {
  const bm = editor.BlockManager;
  const org = s?.organizer || { name: '', email: 'info@conference2026.com', phone: '+1 (555) 234-5678', officeAddress: '747 Howard St, San Francisco, CA 94103' };
  const eventName = s?.eventName || 'Global Summit 2026';
  const socials = s?.socialLinks || { twitter: '#', linkedin: '#', instagram: '#' };

  bm.add('contact-split', {
    label: card(icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 15c-.9-2.25-1.37-4.56-1.35-6.96A2 2 0 0 1 5.82 6h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.91 13.91a16 16 0 0 0 6.16 6.16l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 24 21"/>'), 'Contact Split'),
    category: 'Contact & Footer',
    content: `
      <section data-gjs-type="footer" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1000px; margin: 0 auto; display: flex; gap: 64px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 240px;">
            <p data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Get In Touch</p>
            <h2 data-gjs-type="heading" style="font-size: 34px; font-weight: 900; color: var(--foreground); margin: 0 0 20px 0; letter-spacing: -0.02em;">Contact Us</h2>
            <div style="display: flex; flex-direction: column; gap: 16px;">
              ${org.email ? `<div style="display: flex; align-items: flex-start; gap: 12px;"><div style="width: 40px; height: 40px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">📧</div><div><div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); margin-bottom: 2px;">Email</div><a href="mailto:${org.email}" style="font-size: 15px; color: var(--foreground); text-decoration: none;">${org.email}</a></div></div>` : ''}
              ${org.phone ? `<div style="display: flex; align-items: flex-start; gap: 12px;"><div style="width: 40px; height: 40px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">📞</div><div><div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); margin-bottom: 2px;">Phone</div><a href="tel:${org.phone}" style="font-size: 15px; color: var(--foreground); text-decoration: none;">${org.phone}</a></div></div>` : ''}
              ${org.officeAddress ? `<div style="display: flex; align-items: flex-start; gap: 12px;"><div style="width: 40px; height: 40px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 18px;">📍</div><div><div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted-foreground); margin-bottom: 2px;">Address</div><div style="font-size: 15px; color: var(--foreground); line-height: 1.5;">${org.officeAddress}</div></div></div>` : ''}
            </div>
          </div>
          <div style="flex: 1; min-width: 280px; background: var(--muted); border: 1px solid var(--border); border-radius: 20px; padding: 28px; box-sizing: border-box;">
            <h3 style="font-size: 18px; font-weight: 700; color: var(--foreground); margin: 0 0 20px 0;">Send us a message</h3>
            <form data-gjs-type="contact-form" style="display: flex; flex-direction: column; gap: 14px;">
              <input type="text" placeholder="Your name" style="width: 100%; padding: 11px 14px; border-radius: 8px; border: 1px solid var(--border-default, var(--muted)); background: var(--bg-surface-hover, var(--muted)); color: var(--foreground); font-size: 14px; box-sizing: border-box; outline: none;" />
              <input type="email" placeholder="Email address" style="width: 100%; padding: 11px 14px; border-radius: 8px; border: 1px solid var(--border-default, var(--muted)); background: var(--bg-surface-hover, var(--muted)); color: var(--foreground); font-size: 14px; box-sizing: border-box; outline: none;" />
              <textarea rows="4" placeholder="Your message..." style="width: 100%; padding: 11px 14px; border-radius: 8px; border: 1px solid var(--border-default, var(--muted)); background: var(--bg-surface-hover, var(--muted)); color: var(--foreground); font-size: 14px; box-sizing: border-box; outline: none; resize: vertical;"></textarea>
              <button data-gjs-type="button" type="submit" style="background: var(--pri, var(--primary)); color: var(--background); border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; align-self: flex-start;">Send Message</button>
            </form>
          </div>
        </div>
      </section>`,
  });

  bm.add('footer-multi-column', {
    label: card(icon('<path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 7v14M15 7v14"/>'), 'Footer Full'),
    category: 'Contact & Footer',
    content: `
      <footer data-gjs-type="footer" style="background: var(--surface); border-top: 1px solid var(--border-subtle, var(--muted)); padding: 60px 24px 32px; box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 48px; flex-wrap: wrap;">
            <div>
              <div data-gjs-type="heading" style="font-size: 22px; font-weight: 900; color: var(--background); margin-bottom: 12px; letter-spacing: -0.02em;">${eventName}</div>
              <p data-gjs-type="paragraph" style="font-size: 14px; color: var(--muted-foreground); line-height: 1.7; margin: 0 0 20px 0; max-width: 280px;">The premier international conference bringing together the world's leading researchers and practitioners.</p>
              <form data-gjs-type="newsletter" style="display: flex; gap: 8px; margin: 0 0 18px 0; max-width: 300px;">
                <input type="email" placeholder="Email address" style="flex: 1; min-width: 0; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--muted); color: var(--foreground); font-size: 13px; box-sizing: border-box;" />
                <button data-gjs-type="button" type="submit" style="padding: 10px 14px; border: none; border-radius: 8px; background: var(--pri, var(--primary)); color: var(--background); font-weight: 700; cursor: pointer;">Join</button>
              </form>
              <div data-gjs-type="social-icons" style="display: flex; gap: 10px;">
                ${Object.entries(socials).filter(([, v]) => v).map(([platform]) => `<a href="#" aria-label="${platform}" style="width: 36px; height: 36px; border-radius: 8px; background: var(--border-subtle, var(--muted)); border: 1px solid var(--border-default, var(--muted)); display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); text-decoration: none; font-size: 14px;">${platform === 'twitter' ? '𝕏' : platform === 'linkedin' ? 'in' : platform === 'instagram' ? '📷' : '🔗'}</a>`).join('')}
              </div>
            </div>
            ${[
              { title: 'Conference', links: ['About', 'Speakers', 'Program', 'Workshops', 'Posters'] },
              { title: 'Attend', links: ['Registration', 'Venue', 'Hotels', 'Visa Info', 'Travel'] },
              { title: 'Submit', links: ['Call for Papers', 'Guidelines', 'Proceedings', 'Awards', 'Contact'] },
            ].map(col => `
              <div>
                <h4 data-gjs-type="subheading" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted-foreground); margin: 0 0 16px 0;">${col.title}</h4>
                <div data-gjs-type="button-group" style="display: flex; flex-direction: column; gap: 10px;">
                  ${col.links.map(l => `<a href="#" style="font-size: 14px; color: var(--muted-foreground); text-decoration: none; transition: color 0.2s;">${l}</a>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <div style="border-top: 1px solid var(--border-subtle, var(--muted)); padding-top: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <p style="font-size: 13px; color: var(--foreground); margin: 0;">© ${new Date().getFullYear()} ${eventName}. All rights reserved.</p>
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
              ${['Privacy Policy', 'Terms of Use', 'Cookie Policy'].map(l => `<a href="#" style="font-size: 13px; color: var(--foreground); text-decoration: none;">${l}</a>`).join('')}
            </div>
          </div>
        </div>
      </footer>`,
  });

  bm.add('footer-simple', {
    label: card(icon('<line x1="3" y1="18" x2="21" y2="18"/><path d="M3 6h18M3 12h18"/>'), 'Footer Simple'),
    category: 'Contact & Footer',
    content: `
      <footer data-gjs-type="footer" style="background: var(--surface); border-top: 1px solid var(--border-subtle, var(--muted)); padding: 28px 24px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div style="font-size: 18px; font-weight: 900; color: var(--background); letter-spacing: -0.02em;">${eventName}</div>
        <p style="font-size: 13px; color: var(--foreground); margin: 0;">© ${new Date().getFullYear()} ${eventName}. All rights reserved.</p>
        <div style="display: flex; gap: 10px;">
          ${Object.keys(socials).map(platform => `<a href="#" aria-label="${platform}" style="width: 32px; height: 32px; border-radius: 8px; background: var(--bg-surface-2, var(--muted)); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); text-decoration: none; font-size: 12px;">${platform === 'twitter' ? '𝕏' : platform === 'linkedin' ? 'in' : '🔗'}</a>`).join('')}
        </div>
      </footer>`,
  });

  bm.add('marketing-cta-register', {
    label: card(icon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4"/><polyline points="22,6 12,13 2,6"/>'), 'Register CTA Section'),
    category: 'Marketing & CTA',
    content: `
      <section data-gjs-type="registration-cta" style="padding: 80px 24px; text-align: center; background: linear-gradient(135deg, var(--background) 0%, var(--muted) 50%, var(--background) 100%); box-sizing: border-box;">
        <div style="max-width: 660px; margin: 0 auto;">
          <h2 style="font-size: 44px; font-weight: 900; color: var(--foreground); margin: 0 0 16px 0; letter-spacing: -0.02em;">Don't Miss Out</h2>
          <p style="font-size: 18px; color: var(--muted-foreground); line-height: 1.65; margin: 0 0 36px 0;">Join thousands of professionals, researchers, and innovators. Early bird pricing ends soon — register today and save up to 30%.</p>
          <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
            <a href="#register" style="background: var(--pri, var(--primary)); color: var(--background); padding: 16px 40px; border-radius: 12px; font-weight: 800; font-size: 16px; text-decoration: none; box-shadow: 0 12px 28px var(--muted);">Register Now</a>
            <a href="#sponsors" style="background: var(--border-subtle, var(--muted)); color: var(--foreground); border: 1px solid var(--muted); padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 16px; text-decoration: none; backdrop-filter: blur(8px);">Become a Sponsor</a>
          </div>
        </div>
      </section>`,
  });

  bm.add('marketing-downloads', {
    label: card(icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'), 'Downloads'),
    category: 'Marketing & CTA',
    content: `
      <section data-gjs-type="section" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 800px; margin: 0 auto;">
          <h2 style="font-size: 36px; font-weight: 900; color: var(--foreground); margin: 0 0 40px 0; letter-spacing: -0.02em; text-align: center;">Downloads & Resources</h2>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${(s?.downloads?.length ? s.downloads : [
              { id: '1', name: 'Conference Brochure 2026', url: '#', type: 'BROCHURE', sizeLabel: '2.4 MB' },
              { id: '2', name: 'Technical Program (PDF)', url: '#', type: 'PROGRAM', sizeLabel: '1.8 MB' },
              { id: '3', name: 'Abstract Guidelines', url: '#', type: 'ABSTRACT', sizeLabel: '340 KB' },
            ]).map(f => `
              <div style="display: flex; align-items: center; gap: 16px; background: var(--muted); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px; box-sizing: border-box;">
                <div style="width: 44px; height: 44px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid var(--muted); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📄</div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 15px; font-weight: 700; color: var(--foreground);">${f.name}</div>
                  ${f.sizeLabel ? `<div style="font-size: 12px; color: var(--muted-foreground); margin-top: 2px;">${f.type} · ${f.sizeLabel}</div>` : ''}
                </div>
                <a href="${f.url}" download style="display: flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--primary) 15%, transparent); color: var(--pri, var(--primary)); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none; flex-shrink: 0; white-space: nowrap;">↓ Download</a>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });

  bm.add('committee-grid', {
    label: card(icon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'), 'Committee Grid'),
    category: 'Speakers & Committee',
    content: `
      <section data-gjs-type="section" style="padding: 80px 24px; background: var(--base, var(--background)); box-sizing: border-box;">
        <div style="max-width: 1100px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 56px;">
            <p style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--pri, var(--primary)); margin: 0 0 12px 0;">Scientific & Organizing</p>
            <h2 style="font-size: 38px; font-weight: 900; color: var(--foreground); margin: 0 0 8px 0; letter-spacing: -0.02em;">Conference Committee</h2>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
            ${(s?.committee?.length ? s.committee : [
              { id: '1', name: 'Prof. Ana Lima', designation: 'Chair', institution: 'MIT', committeeType: 'SCIENTIFIC' as const },
              { id: '2', name: 'Dr. Wei Zhang', designation: 'Co-Chair', institution: 'Stanford', committeeType: 'SCIENTIFIC' as const },
              { id: '3', name: 'Dr. Raj Patel', designation: 'Secretary', institution: 'Oxford', committeeType: 'ORGANIZING' as const },
              { id: '4', name: 'Prof. Elena Kim', designation: 'Treasurer', institution: 'Harvard', committeeType: 'ORGANIZING' as const },
              { id: '5', name: 'Dr. Ahmed Hassan', designation: 'Program Chair', institution: 'ETH Zurich', committeeType: 'SCIENTIFIC' as const },
              { id: '6', name: 'Prof. Yuki Tanaka', designation: 'Publicity Chair', institution: 'Tokyo Univ.', committeeType: 'ORGANIZING' as const },
            ]).map(m => `
              <div style="background: var(--muted); border: 1px solid var(--muted); border-radius: 14px; padding: 20px 16px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; box-sizing: border-box;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, transparent), var(--muted)); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: var(--background);">${m.name.charAt(0)}</div>
                <div>
                  <div style="font-size: 14px; font-weight: 700; color: var(--foreground);">${m.name}</div>
                  <div style="font-size: 12px; color: var(--muted-foreground); margin-top: 2px;">${m.designation}</div>
                  ${m.institution ? `<div style="font-size: 11px; color: var(--muted-foreground); margin-top: 1px;">${m.institution}</div>` : ''}
                </div>
                <span style="background: ${m.committeeType === 'SCIENTIFIC' ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--muted)'}; color: ${m.committeeType === 'SCIENTIFIC' ? 'var(--pri, var(--primary))' : 'var(--success)'}; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase;">${m.committeeType}</span>
              </div>`).join('')}
          </div>
        </div>
      </section>`,
  });
}
