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
          { id: 'data-event-name', type: 'Text', label: 'Event Name', defaultValue: '{{event.name}}' },
          { id: 'data-tagline', type: 'Text', label: 'Tagline' },
          { id: 'data-date', type: 'Text', label: 'Date', defaultValue: '{{event.date}}' },
          { id: 'data-location', type: 'Text', label: 'Location', defaultValue: '{{event.location}}' },
          { id: 'data-banner', type: 'Asset', label: 'Banner Asset' },
          { id: 'data-primary-cta', type: 'Text', label: 'Primary CTA Text', defaultValue: 'Register Now' },
          { id: 'data-secondary-cta', type: 'Text', label: 'Secondary CTA Text' },
          {
            id: 'data-variant',
            type: 'Select',
            label: 'Variant Preset',
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
            options: [
              { value: 'top', label: 'Top' },
              { value: 'middle', label: 'Middle' },
              { value: 'bottom', label: 'Bottom' },
            ],
            defaultValue: 'middle'
          },
          { id: 'data-full-height', type: 'Toggle', label: 'Full Height (100vh)', defaultValue: true },
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
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'event-snapshot' },
          { id: 'data-title', type: 'Text', label: 'Section Title', defaultValue: 'Featured Speakers' },
          { id: 'data-subtitle', type: 'Text', label: 'Subtitle' },
          { id: 'data-limit', type: 'Number', label: 'Display Limit', min: 1, max: 100 },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-cols',
            type: 'Select',
            label: 'Columns',
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
          { id: 'data-show-bio', type: 'Toggle', label: 'Show Bio' },
          { id: 'data-show-company', type: 'Toggle', label: 'Show Company', defaultValue: true },
          { id: 'data-show-socials', type: 'Toggle', label: 'Show Social Links', defaultValue: true },
          {
            id: 'data-image-crop',
            type: 'Select',
            label: 'Image Crop',
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
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'event-snapshot' },
          { id: 'data-title', type: 'Text', label: 'Section Title', defaultValue: 'Our Sponsors' },
          { id: 'data-tiers', type: 'Text', label: 'Included Tiers (comma separated)', placeholder: 'e.g. Platinum, Gold' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-type',
            type: 'Select',
            label: 'Layout Type',
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
          { id: 'data-group-tiers', type: 'Toggle', label: 'Group by Tier', defaultValue: true },
          {
            id: 'data-logo-size',
            type: 'Select',
            label: 'Logo Sizing',
            options: [
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ],
            defaultValue: 'medium'
          },
          { id: 'data-greyscale', type: 'Toggle', label: 'Greyscale Logos' },
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
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'event-snapshot' },
          { id: 'data-title', type: 'Text', label: 'Section Title', defaultValue: 'Event Schedule' },
          { id: 'data-active-day', type: 'Number', label: 'Default Active Day (index)', defaultValue: 0 },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-view-type',
            type: 'Select',
            label: 'View Type',
            options: [
              { value: 'list', label: 'List' },
              { value: 'timeline', label: 'Timeline' },
              { value: 'grid', label: 'Grid' },
            ],
            defaultValue: 'list'
          },
          { id: 'data-show-tracks', type: 'Toggle', label: 'Show Tracks / Stages', defaultValue: true },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          { id: 'data-show-heads', type: 'Toggle', label: 'Show Speaker Headshots', defaultValue: true },
          { id: 'data-show-tags', type: 'Toggle', label: 'Show Session Tags', defaultValue: true },
          {
            id: 'data-time-format',
            type: 'Select',
            label: 'Time Format',
            options: [
              { value: '12h', label: '12-hour (AM/PM)' },
              { value: '24h', label: '24-hour' },
            ],
            defaultValue: '12h'
          },
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
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'event-snapshot' },
          { id: 'data-currency', type: 'Text', label: 'Currency', defaultValue: 'USD' },
          { id: 'data-show-sold-out', type: 'Toggle', label: 'Show Sold Out Tickets', defaultValue: true },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout-type',
            type: 'Select',
            label: 'Layout',
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
          { id: 'data-highlight', type: 'Toggle', label: 'Highlight Popular Tier', defaultValue: true },
          { id: 'data-features', type: 'Toggle', label: 'Show Features List', defaultValue: true },
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
          { id: 'data-target', type: 'Text', label: 'Target Date', placeholder: 'YYYY-MM-DDTHH:MM:SSZ' },
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'Event starts in' },
          { id: 'data-expired-msg', type: 'Text', label: 'Expired Message', defaultValue: 'The event has started!' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-orientation',
            type: 'Select',
            label: 'Orientation',
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
            options: [
              { value: 'outlined', label: 'Outlined' },
              { value: 'solid', label: 'Solid Box' },
              { value: 'minimal', label: 'Minimal' },
            ],
            defaultValue: 'solid'
          },
          { id: 'data-show-labels', type: 'Toggle', label: 'Show Labels (Days, Hours...)', defaultValue: true },
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
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'Location' },
          { id: 'data-address', type: 'Textarea', label: 'Address' },
          { id: 'data-map-url', type: 'Text', label: 'Embed Map URL' },
          {
            id: 'data-map-type',
            type: 'Select',
            label: 'Map Type',
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
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'By The Numbers' },
          { id: 'data-stats', type: 'Textarea', label: 'Stats (JSON)', placeholder: '[{"value": "10k+", "label": "Attendees"}]' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout',
            type: 'Select',
            label: 'Layout',
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
          { id: 'data-animate', type: 'Toggle', label: 'Animate on Scroll (Count up)', defaultValue: true },
          {
            id: 'data-icon-placement',
            type: 'Select',
            label: 'Icon Placement',
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
          { id: 'data-source', type: 'EventDataSource', label: 'Data Source', defaultValue: 'event-snapshot' },
          { id: 'data-title', type: 'Text', label: 'Title', defaultValue: 'Organizing Committee' },
          { id: 'data-roles', type: 'Text', label: 'Roles to Include (comma separated)' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-cols',
            type: 'Select',
            label: 'Columns',
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
