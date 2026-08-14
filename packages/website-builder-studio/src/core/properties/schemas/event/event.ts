import type { ComponentManifest } from '../../PropertyRegistry';

export const HeroManifest: ComponentManifest = {
  id: 'hero',
  title: 'Hero Header',
  icon: 'star',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-event-name', type: 'Text', label: 'Event Name', defaultValue: '{{event.name}}', target: { kind: 'content', selector: '[data-role="event-name"],h1' } },
          { id: 'data-tagline', type: 'Text', label: 'Tagline', target: { kind: 'content', selector: '[data-role="tagline"],p' } },
          { id: 'data-date', type: 'Text', label: 'Date', defaultValue: '{{event.date}}', target: { kind: 'attribute', name: 'data-date' } },
          { id: 'data-location', type: 'Text', label: 'Location', defaultValue: '{{event.location}}', target: { kind: 'attribute', name: 'data-location' } },
          { id: 'data-banner', type: 'Asset', label: 'Banner Asset', target: { kind: 'attribute', name: 'data-banner' } },
          { id: 'data-video-src', type: 'Text', label: 'Video URL', placeholder: 'https://...mp4 or YouTube embed URL', target: { kind: 'attribute', name: 'data-video-src' } },
          { id: 'data-primary-cta', type: 'Text', label: 'Primary CTA Text', defaultValue: 'Register Now', target: { kind: 'content', selector: '[data-role="primary-cta"],a' } },
          { id: 'data-secondary-cta', type: 'Text', label: 'Secondary CTA Text', target: { kind: 'attribute', name: 'data-secondary-cta' } },
          {
            id: 'data-variant',
            type: 'Select',
            label: 'Variant Preset',
            target: { kind: 'attribute', name: 'data-variant' },
            options: [
              { value: 'classic', label: 'Classic' },
              { value: 'split', label: 'Split (Left/Right)' },
              { value: 'video', label: 'Video Background' },
              { value: 'glass', label: 'Glassmorphism' },
            ],
            defaultValue: 'classic'
          },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-align',
            type: 'Select',
            label: 'Content Alignment',
            target: { kind: 'attribute', name: 'data-align' },
            options: [
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ],
            defaultValue: 'center'
          },
          {
            id: 'data-valign',
            type: 'Select',
            label: 'Vertical Alignment',
            target: { kind: 'attribute', name: 'data-valign' },
            options: [
              { value: 'top', label: 'Top' },
              { value: 'middle', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' },
            ],
            defaultValue: 'middle'
          },
          { id: 'data-full-height', type: 'Toggle', label: 'Full Height (100vh)', defaultValue: true, target: { kind: 'attribute', name: 'data-full-height' } },
        ],
      },
    ]
  }
};

export const SpeakerGridManifest: ComponentManifest = {
  id: 'speaker-grid',
  title: 'Speaker Grid',
  icon: 'users',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'current-event', target: { kind: 'attribute', name: 'data-source' } },
          { id: 'data-title', type: 'Text', label: 'Section Title', defaultValue: 'Featured Speakers', target: { kind: 'content', selector: '[data-role="section-title"]' } },
          { id: 'data-subtitle', type: 'Text', label: 'Subtitle', target: { kind: 'content', selector: '[data-role="section-subtitle"]' } },
          { id: 'data-limit', type: 'Number', label: 'Display Limit', min: 1, max: 100, target: { kind: 'attribute', name: 'data-limit' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-cols',
            type: 'Select',
            label: 'Columns',
            target: { kind: 'attribute', name: 'data-cols' },
            options: [
              { value: '2', label: '2 Columns' },
              { value: '3', label: '3 Columns' },
              { value: '4', label: '4 Columns' },
              { value: '5', label: '5 Columns' },
            ],
            defaultValue: '4'
          },
          {
            id: 'data-card-style',
            type: 'Select',
            label: 'Card Style',
            target: { kind: 'attribute', name: 'data-card-style' },
            options: [
              { value: 'minimal', label: 'Minimal' },
              { value: 'glass', label: 'Glass' },
              { value: 'bordered', label: 'Bordered' },
            ],
            defaultValue: 'minimal'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-show-bio', type: 'Toggle', label: 'Show Bio', target: { kind: 'attribute', name: 'data-show-bio' } },
          { id: 'data-show-company', type: 'Toggle', label: 'Show Company', defaultValue: true, target: { kind: 'attribute', name: 'data-show-company' } },
          { id: 'data-show-socials', type: 'Toggle', label: 'Show Social Links', defaultValue: true, target: { kind: 'attribute', name: 'data-show-socials' } },
          {
            id: 'data-image-crop',
            type: 'Select',
            label: 'Image Crop',
            target: { kind: 'attribute', name: 'data-image-crop' },
            options: [
              { value: 'square', label: 'Square' },
              { value: 'circle', label: 'Circle' },
              { value: 'portrait', label: 'Portrait' },
            ],
            defaultValue: 'square'
          },
        ],
      },
    ]
  }
};

export const SponsorGridManifest: ComponentManifest = {
  id: 'sponsor-grid',
  title: 'Sponsor Grid',
  icon: 'award',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'current-event', target: { kind: 'attribute', name: 'data-source' } },
          { id: 'data-title', type: 'Text', label: 'Section Title', defaultValue: 'Our Sponsors', target: { kind: 'content', selector: '[data-role="section-title"]' } },
          { id: 'data-tiers', type: 'Text', label: 'Included Tiers (comma separated)', placeholder: 'e.g. Platinum, Gold', target: { kind: 'attribute', name: 'data-tiers' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-type',
            type: 'Select',
            label: 'Layout Type',
            target: { kind: 'attribute', name: 'data-layout-type' },
            options: [
              { value: 'grid', label: 'Grid' },
              { value: 'marquee', label: 'Infinite Marquee Slider' },
            ],
            defaultValue: 'grid'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-logo-size',
            type: 'Select',
            label: 'Logo Sizing',
            target: { kind: 'attribute', name: 'data-logo-size' },
            options: [
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ],
            defaultValue: 'medium'
          },
          { id: 'data-greyscale', type: 'Toggle', label: 'Greyscale Logos', target: { kind: 'attribute', name: 'data-greyscale' } },
          { id: 'data-speed', type: 'Number', label: 'Scroll Duration (seconds)', defaultValue: 30, min: 5, max: 120, step: 1, target: { kind: 'attribute', name: 'data-speed' } },
          {
            id: 'data-direction',
            type: 'Select',
            label: 'Scroll Direction',
            target: { kind: 'attribute', name: 'data-direction' },
            options: [
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ],
            defaultValue: 'left',
          },
        ],
      },
    ]
  }
};

export const AgendaManifest: ComponentManifest = {
  id: 'agenda',
  title: 'Agenda / Schedule',
  icon: 'calendar',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'current-event', target: { kind: 'attribute', name: 'data-source' } },
          { id: 'data-title', type: 'Text', label: 'Section Title', defaultValue: 'Event Schedule', target: { kind: 'content', selector: '[data-role="section-title"]' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-view-type',
            type: 'Select',
            label: 'View Type',
            target: { kind: 'attribute', name: 'data-view-type' },
            options: [
              { value: 'list', label: 'List' },
              { value: 'timeline', label: 'Timeline' },
              { value: 'grid', label: 'Grid' },
            ],
            defaultValue: 'list'
          },
          { id: 'data-show-tracks', type: 'Toggle', label: 'Show Tracks / Stages', defaultValue: true, target: { kind: 'attribute', name: 'data-show-tracks' } },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-show-heads', type: 'Toggle', label: 'Show Speaker Headshots', defaultValue: true, target: { kind: 'attribute', name: 'data-show-heads' } },
          { id: 'data-show-tags', type: 'Toggle', label: 'Show Session Tags', defaultValue: true, target: { kind: 'attribute', name: 'data-show-tags' } },
        ],
      },
    ]
  }
};

export const PricingManifest: ComponentManifest = {
  id: 'pricing',
  title: 'Ticketing & Pricing',
  icon: 'ticket',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'current-event', target: { kind: 'attribute', name: 'data-source' } },
          { id: 'data-currency', type: 'Text', label: 'Currency', defaultValue: 'USD', target: { kind: 'attribute', name: 'data-currency' } },
          { id: 'data-show-sold-out', type: 'Toggle', label: 'Show Sold Out Tickets', defaultValue: true, target: { kind: 'attribute', name: 'data-show-sold-out' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-type',
            type: 'Select',
            label: 'Layout',
            target: { kind: 'attribute', name: 'data-layout-type' },
            options: [
              { value: 'cards', label: 'Horizontal Cards' },
              { value: 'list', label: 'Vertical List' },
              { value: 'table', label: 'Comparison Table' },
            ],
            defaultValue: 'cards'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-highlight', type: 'Toggle', label: 'Highlight Popular Tier', defaultValue: true, target: { kind: 'attribute', name: 'data-highlight' } },
          { id: 'data-features', type: 'Toggle', label: 'Show Features List', defaultValue: true, target: { kind: 'attribute', name: 'data-features' } },
        ],
      },
    ]
  }
};

export const CountdownManifest: ComponentManifest = {
  id: 'countdown',
  title: 'Countdown Timer',
  icon: 'clock',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-target', type: 'DateTime', label: 'Target Date & Time', target: { kind: 'attribute', name: 'data-target' } },
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'Event starts in', target: { kind: 'content', selector: '[data-role="countdown-title"]' } },
          { id: 'data-expired-msg', type: 'Text', label: 'Expired Message', defaultValue: 'The event has started!', target: { kind: 'attribute', name: 'data-expired-msg' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-orientation',
            type: 'Select',
            label: 'Orientation',
            target: { kind: 'attribute', name: 'data-orientation' },
            options: [
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ],
            defaultValue: 'horizontal'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-number-style',
            type: 'Select',
            label: 'Number Style',
            target: { kind: 'attribute', name: 'data-number-style' },
            options: [
              { value: 'outlined', label: 'Outlined' },
              { value: 'solid', label: 'Solid Box' },
              { value: 'minimal', label: 'Minimal' },
            ],
            defaultValue: 'solid'
          },
          { id: 'data-show-labels', type: 'Toggle', label: 'Show Labels (Days, Hours...)', defaultValue: true, target: { kind: 'attribute', name: 'data-show-labels' } },
        ],
      },
    ]
  }
};

export const VenueManifest: ComponentManifest = {
  id: 'venue',
  title: 'Venue / Location',
  icon: 'map-pin',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'Location', target: { kind: 'content', selector: 'h1,h2,h3,[data-role="section-title"]' } },
          { id: 'data-address', type: 'Textarea', label: 'Address', target: { kind: 'content', selector: '[data-role="address"]' } },
          { id: 'data-map-url', type: 'Text', label: 'Embed Map URL', target: { kind: 'attribute', name: 'src', selector: 'iframe' } },
          {
            id: 'data-map-type',
            type: 'Select',
            label: 'Map Type',
            target: { kind: 'attribute', name: 'data-map-type' },
            options: [
              { value: 'google', label: 'Google Maps' },
              { value: 'mapbox', label: 'Mapbox' },
            ],
            defaultValue: 'google'
          },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout',
            type: 'Select',
            label: 'Layout',
            target: { kind: 'attribute', name: 'data-layout' },
            options: [
              { value: 'left', label: 'Map on Left' },
              { value: 'right', label: 'Map on Right' },
              { value: 'stacked', label: 'Stacked' },
            ],
            defaultValue: 'left'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-theme',
            type: 'Select',
            label: 'Map Theme',
            target: { kind: 'attribute', name: 'data-theme' },
            options: [
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'satellite', label: 'Satellite' },
              { value: 'brand', label: 'Brand Colors' },
            ],
            defaultValue: 'light'
          },
        ],
      },
    ]
  }
};

export const StatisticsManifest: ComponentManifest = {
  id: 'statistics',
  title: 'Statistics / Metrics',
  icon: 'bar-chart',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'By The Numbers', target: { kind: 'content', selector: '[data-role="stats-title"]' } },
          { id: 'data-stats', type: 'Textarea', label: 'Stats (JSON)', placeholder: '[{"value": "10k+", "label": "Attendees"}]', target: { kind: 'attribute', name: 'data-stats' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout',
            type: 'Select',
            label: 'Layout',
            target: { kind: 'attribute', name: 'data-layout' },
            options: [
              { value: 'grid', label: 'Grid' },
              { value: 'flex', label: 'Horizontal Flex' },
            ],
            defaultValue: 'grid'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-animate', type: 'Toggle', label: 'Animate on Scroll (Count up)', defaultValue: true, target: { kind: 'attribute', name: 'data-animate' } },
          {
            id: 'data-icon-placement',
            type: 'Select',
            label: 'Icon Placement',
            target: { kind: 'attribute', name: 'data-icon-placement' },
            options: [
              { value: 'top', label: 'Top' },
              { value: 'left', label: 'Left' },
            ],
            defaultValue: 'top'
          },
        ],
      },
    ]
  }
};

export const CommitteeManifest: ComponentManifest = {
  id: 'committee',
  title: 'Committee / Team',
  icon: 'users',
  category: 'Event',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'current-event', target: { kind: 'attribute', name: 'data-source' } },
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'Organizing Committee', target: { kind: 'content', selector: '[data-role="section-title"]' } },
          { id: 'data-roles', type: 'Text', label: 'Roles to Include (comma separated)', target: { kind: 'attribute', name: 'data-roles' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-cols',
            type: 'Select',
            label: 'Columns',
            target: { kind: 'attribute', name: 'data-cols' },
            options: [
              { value: '3', label: '3 Columns' },
              { value: '4', label: '4 Columns' },
              { value: '5', label: '5 Columns' },
              { value: '6', label: '6 Columns' },
            ],
            defaultValue: '4'
          },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-image-shape',
            type: 'Select',
            label: 'Image Shape',
            target: { kind: 'attribute', name: 'data-image-shape' },
            options: [
              { value: 'circle', label: 'Circle' },
              { value: 'square', label: 'Square' },
            ],
            defaultValue: 'circle'
          },
          {
            id: 'data-hover-effect',
            type: 'Select',
            label: 'Hover Effect',
            target: { kind: 'attribute', name: 'data-hover-effect' },
            options: [
              { value: 'zoom', label: 'Zoom' },
              { value: 'grayscale', label: 'Grayscale to Color' },
              { value: 'none', label: 'None' },
            ],
            defaultValue: 'zoom'
          },
        ],
      },
    ]
  }
};
