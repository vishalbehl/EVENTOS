import type { ThemePalette, WebsiteDocument } from '../types';
import { checksumWebsiteDocument } from '../core/documentModel';

export interface EventTemplateMeta {
  id: string;
  name: string;
  category: 'tech' | 'medical' | 'hackathon' | 'academic' | 'expo' | 'gala';
  description: string;
  palette: ThemePalette;
  tags: string[];
  createDocument: () => WebsiteDocument;
}

function buildTemplateDocument(
  siteName: string,
  palette: ThemePalette,
  sections: Array<{
    id: string;
    type: string;
    title: string;
    subtitle?: string;
    componentType: string;
    bg?: string;
    extraProps?: Record<string, unknown>;
  }>,
  subPages: Array<{ name: string; slug: string; title: string }> = [],
): WebsiteDocument {
  const now = new Date().toISOString();
  const rootHomeId = 'root_home';
  const instances: WebsiteDocument['instances'] = {
    [rootHomeId]: {
      id: rootHomeId,
      componentType: 'page-root',
      componentVersion: 1,
      children: sections.map(s => s.id),
      props: { pageId: 'page_home' },
      styles: {
        desktop: { background: palette.background },
      },
      bindings: [],
      states: { name: 'Home', locked: true },
    },
  };

  sections.forEach(s => {
    const headingId = `${s.id}_h`;
    const copyId = `${s.id}_p`;
    instances[s.id] = {
      id: s.id,
      componentType: s.componentType,
      componentVersion: 1,
      parentId: rootHomeId,
      children: [headingId, copyId],
      props: {
        tagName: 'section',
        attributes: {
          id: s.id.replace('sec_', ''),
          'data-gjs-type': s.componentType,
          ...(s.extraProps || {}),
        },
      },
      styles: {
        desktop: {
          padding: '80px 24px',
          background: s.bg || palette.surface,
          'text-align': 'center',
        },
        tablet: { padding: '56px 20px' },
        mobile: { padding: '40px 16px' },
      },
      bindings: [],
      states: {},
    };

    instances[headingId] = {
      id: headingId,
      componentType: 'heading',
      componentVersion: 1,
      parentId: s.id,
      children: [],
      props: {
        tagName: 'h2',
        content: s.title,
      },
      styles: {
        desktop: {
          margin: '0 0 16px',
          color: 'var(--foreground)',
          'font-size': '38px',
          'font-weight': '800',
        },
        mobile: { 'font-size': '28px' },
      },
      bindings: [],
      states: {},
    };

    instances[copyId] = {
      id: copyId,
      componentType: 'paragraph',
      componentVersion: 1,
      parentId: s.id,
      children: [],
      props: {
        tagName: 'p',
        content: s.subtitle || '',
      },
      styles: {
        desktop: {
          margin: '0 auto',
          'max-width': '720px',
          color: 'var(--muted-foreground)',
          'font-size': '18px',
          'line-height': '1.6',
        },
      },
      bindings: [],
      states: {},
    };
  });

  const pages = [
    {
      id: 'page_home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      rootInstanceId: rootHomeId,
      seoTitle: `${siteName} | Official Event Website`,
      createdAt: now,
      updatedAt: now,
    },
    ...subPages.map((sub, index) => {
      const pageId = `page_sub_${index + 1}`;
      const rootId = `root_sub_${index + 1}`;
      const subHeadingId = `head_sub_${index + 1}`;

      instances[rootId] = {
        id: rootId,
        componentType: 'page-root',
        componentVersion: 1,
        children: [subHeadingId],
        props: { pageId },
        styles: { desktop: { background: palette.background, padding: '60px 24px' } },
        bindings: [],
        states: { name: sub.name },
      };

      instances[subHeadingId] = {
        id: subHeadingId,
        componentType: 'heading',
        componentVersion: 1,
        parentId: rootId,
        children: [],
        props: { tagName: 'h1', content: sub.title },
        styles: { desktop: { color: 'var(--foreground)', 'font-size': '44px', 'text-align': 'center' } },
        bindings: [],
        states: {},
      };

      return {
        id: pageId,
        name: sub.name,
        slug: sub.slug,
        isHomePage: false,
        rootInstanceId: rootId,
        seoTitle: `${sub.title} | ${siteName}`,
        createdAt: now,
        updatedAt: now,
      };
    }),
  ];

  const doc: WebsiteDocument = {
    schemaVersion: 1,
    site: {
      siteName,
      globalCSS: '',
      publishMode: 'static-resolved',
    },
    pages,
    instances,
    tokens: {
      theme: palette,
    },
    menus: [
      {
        id: 'main_nav',
        name: 'Main Navigation',
        items: [
          { type: 'page', pageId: 'page_home', label: 'Home' },
          ...subPages.map((sub, index) => ({
            type: 'page' as const,
            pageId: `page_sub_${index + 1}`,
            label: sub.name,
          })),
        ],
      },
    ],
    assets: [],
    dataSources: [],
    createdAt: now,
    updatedAt: now,
  };

  doc.checksum = checksumWebsiteDocument(doc);
  return doc;
}

export const EVENT_TEMPLATES: EventTemplateMeta[] = [
  {
    id: 'template_tech_summit',
    name: 'Tech Horizon Summit',
    category: 'tech',
    description: 'Modern developer conference template with Aurora backdrop, interactive countdown, keynote showcase, and session tracks.',
    palette: {
      primary: '#7c3aed',
      secondary: '#06b6d4',
      background: '#080912',
      surface: '#0f111e',
      card: '#151728',
    },
    tags: ['Technology', 'AI', 'Developer', 'Conference'],
    createDocument: () =>
      buildTemplateDocument(
        'Tech Horizon Summit 2026',
        {
          primary: '#7c3aed',
          secondary: '#06b6d4',
          background: '#080912',
          surface: '#0f111e',
          card: '#151728',
        },
        [
          {
            id: 'sec_hero',
            type: 'hero',
            componentType: 'aceternity-aurora-background',
            title: 'Shaping The Autonomous Intelligence Era',
            subtitle: 'Join 3,000+ researchers, engineers, and founders exploring deep learning and edge computing.',
          },
          {
            id: 'sec_countdown',
            type: 'countdown',
            componentType: 'countdown',
            title: 'Countdown To Keynotes',
            subtitle: 'Opening keynote begins October 24, 2026 at Moscone Center.',
            extraProps: { 'data-target': '2026-10-24T09:00:00.000Z' },
          },
          {
            id: 'sec_speakers',
            type: 'speakers',
            componentType: 'speaker-grid',
            title: 'Featured Keynote Speakers',
            subtitle: 'Pioneering voices in foundation models, quantum networks, and robotics.',
          },
          {
            id: 'sec_agenda',
            type: 'agenda',
            componentType: 'agenda',
            title: 'Three Days Of Breakthroughs',
            subtitle: 'Explore 60+ technical workshops, lightning sessions, and panel debates.',
          },
        ],
        [
          { name: 'Speakers', slug: 'speakers', title: 'All Keynote Speakers' },
          { name: 'Schedule', slug: 'schedule', title: 'Comprehensive Conference Schedule' },
        ],
      ),
  },
  {
    id: 'template_medical_symposium',
    name: 'Clinical Innovations Congress',
    category: 'medical',
    description: 'Peer-reviewed medical symposium template with Bento grid clinical tracks, CME credits, and abstract submission portal.',
    palette: {
      primary: '#0284c7',
      secondary: '#10b981',
      background: '#0a101d',
      surface: '#111927',
      card: '#172236',
    },
    tags: ['Medical', 'Healthcare', 'Research', 'CME'],
    createDocument: () =>
      buildTemplateDocument(
        'Annual Clinical Innovations Congress 2026',
        {
          primary: '#0284c7',
          secondary: '#10b981',
          background: '#0a101d',
          surface: '#111927',
          card: '#172236',
        },
        [
          {
            id: 'sec_hero',
            type: 'hero',
            componentType: 'aceternity-bento-grid',
            title: 'Transforming Patient Outcomes Through Genomic Medicine',
            subtitle: 'Accredited symposium for oncologists, geneticists, and translational researchers.',
          },
          {
            id: 'sec_tracks',
            type: 'tracks',
            componentType: 'card-grid',
            title: 'Clinical Focus Areas',
            subtitle: 'Immunotherapy protocols, rare disease diagnostics, and targeted therapies.',
          },
          {
            id: 'sec_cme',
            type: 'cme',
            componentType: 'statistics',
            title: '24 AMA PRA Category 1 Credits',
            subtitle: 'Earn continuous medical education credits recognized internationally.',
          },
        ],
        [
          { name: 'Abstracts', slug: 'abstracts', title: 'Call for Clinical Abstracts' },
          { name: 'Accreditation', slug: 'accreditation', title: 'CME Accreditation Details' },
        ],
      ),
  },
  {
    id: 'template_hackathon',
    name: 'NextGen AI Hackathon',
    category: 'hackathon',
    description: 'High-energy 48-hour builder hackathon template with Meteor animation, prize pool counters, and registration portal.',
    palette: {
      primary: '#f59e0b',
      secondary: '#ec4899',
      background: '#0a0a0f',
      surface: '#12121c',
      card: '#1a1a28',
    },
    tags: ['Hackathon', 'Coding', 'Open Source', 'Prizes'],
    createDocument: () =>
      buildTemplateDocument(
        'NextGen AI Global Hackathon 2026',
        {
          primary: '#f59e0b',
          secondary: '#ec4899',
          background: '#0a0a0f',
          surface: '#12121c',
          card: '#1a1a28',
        },
        [
          {
            id: 'sec_hero',
            type: 'hero',
            componentType: 'aceternity-meteors',
            title: 'Build The Next Billion-User AI App in 48 Hours',
            subtitle: '$100,000 in bounties, cloud credits, and direct investor intros.',
          },
          {
            id: 'sec_prizes',
            type: 'prizes',
            componentType: 'statistics',
            title: '$100K Prize Pool & Tracks',
            subtitle: 'Grand Prize, Best Agentic Tooling, Most Novel UI, and Social Impact.',
          },
          {
            id: 'sec_register_form',
            type: 'register',
            componentType: 'contact-form',
            title: 'Register Your Hacker Squad',
            subtitle: 'Teams of 1 to 4 builders. Submissions close October 15, 2026.',
          },
        ],
        [
          { name: 'Rules', slug: 'rules', title: 'Hackathon Rules & Guidelines' },
          { name: 'Mentors', slug: 'mentors', title: 'Technical Mentors & Judges' },
        ],
      ),
  },
  {
    id: 'template_academic_summit',
    name: 'International Science Congress',
    category: 'academic',
    description: 'Distinguished university research congress template with Lamp background, peer-review guidelines, and committee chair index.',
    palette: {
      primary: '#4f46e5',
      secondary: '#d97706',
      background: '#080c16',
      surface: '#0f172a',
      card: '#1e293b',
    },
    tags: ['Academic', 'University', 'Publications', 'Science'],
    createDocument: () =>
      buildTemplateDocument(
        'International Science Congress 2026',
        {
          primary: '#4f46e5',
          secondary: '#d97706',
          background: '#080c16',
          surface: '#0f172a',
          card: '#1e293b',
        },
        [
          {
            id: 'sec_hero',
            type: 'hero',
            componentType: 'aceternity-lamp',
            title: 'Frontiers in Fundamental Physics & Computing',
            subtitle: '45th Annual Congress convening leading academic institutions worldwide.',
          },
          {
            id: 'sec_committee',
            type: 'committee',
            componentType: 'committee',
            title: 'Organizing Committee & Chairs',
            subtitle: 'Chaired by IEEE, ACM, and National Academy Fellows.',
          },
        ],
        [
          { name: 'Call for Papers', slug: 'call-for-papers', title: 'Paper Submission & Deadlines' },
          { name: 'Proceedings', slug: 'proceedings', title: 'Conference Proceedings Archive' },
        ],
      ),
  },
  {
    id: 'template_trade_show',
    name: 'Future Mobility Trade Expo',
    category: 'expo',
    description: 'B2B industrial exhibition template with Infinite moving cards, floor plan viewer, exhibitor booth tiers, and pass packages.',
    palette: {
      primary: '#059669',
      secondary: '#3b82f6',
      background: '#06130e',
      surface: '#0d221b',
      card: '#132e25',
    },
    tags: ['Exhibition', 'Trade Show', 'B2B', 'Expo'],
    createDocument: () =>
      buildTemplateDocument(
        'Future Mobility Trade Expo 2026',
        {
          primary: '#059669',
          secondary: '#3b82f6',
          background: '#06130e',
          surface: '#0d221b',
          card: '#132e25',
        },
        [
          {
            id: 'sec_hero',
            type: 'hero',
            componentType: 'aceternity-infinite-moving-cards',
            title: 'The World Stage For Clean Transit & Autonomous Fleets',
            subtitle: '500+ Exhibitors, 20,000 Trade Visitors, 350,000 sq ft of Innovation.',
          },
          {
            id: 'sec_exhibitors',
            type: 'sponsors',
            componentType: 'sponsor-grid',
            title: 'Premier Brand Partners & Exhibitors',
            subtitle: 'Connecting tier-1 automotive suppliers with fleet operators.',
          },
        ],
        [
          { name: 'Floor Plan', slug: 'floor-plan', title: 'Exhibition Hall Floor Plan' },
          { name: 'Exhibitor Passes', slug: 'passes', title: 'Trade Visitor & Exhibitor Passes' },
        ],
      ),
  },
  {
    id: 'template_gala_awards',
    name: 'Tech Excellence Awards Gala',
    category: 'gala',
    description: 'Black-tie awards evening template with Spotlight illumination, nominee category showcases, table bookings, and banquet itinerary.',
    palette: {
      primary: '#eab308',
      secondary: '#a855f7',
      background: '#0c0a06',
      surface: '#18140c',
      card: '#221c12',
    },
    tags: ['Gala', 'Awards', 'Dinner', 'Celebration'],
    createDocument: () =>
      buildTemplateDocument(
        'Tech Excellence Awards Gala 2026',
        {
          primary: '#eab308',
          secondary: '#a855f7',
          background: '#0c0a06',
          surface: '#18140c',
          card: '#221c12',
        },
        [
          {
            id: 'sec_hero',
            type: 'hero',
            componentType: 'aceternity-spotlight',
            title: 'Honoring The Visionaries Transforming Global Tech',
            subtitle: 'An evening of celebration, networking, and recognition at The Grand Ballroom.',
          },
          {
            id: 'sec_nominees',
            type: 'nominees',
            componentType: 'card-grid',
            title: 'Award Categories & Finalists',
            subtitle: 'Founder of the Year, AI Innovation of the Year, and ESG Leadership.',
          },
        ],
        [
          { name: 'Table Reservations', slug: 'tables', title: 'VIP Table & Ticket Reservations' },
          { name: 'Evening Itinerary', slug: 'itinerary', title: 'Banquet & Ceremony Itinerary' },
        ],
      ),
  },
];
