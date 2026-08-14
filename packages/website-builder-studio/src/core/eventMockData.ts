import type { EventDataSnapshot } from '../types';

export const mockEventSnapshot: EventDataSnapshot = {
  eventName: 'Global Science Congress 2026',
  tagline: 'Research, practice, and partnerships for tomorrow',
  theme: 'Innovation in motion',
  startDate: '2026-10-24',
  endDate: '2026-10-26',
  logo: '',
  banner: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&auto=format&fit=crop',
  primaryColor: '#6366f1',
  description: 'A three-day international congress bringing together clinicians, researchers, industry leaders, and policy makers.',
  objectives: ['Advance scientific exchange', 'Connect global faculty', 'Showcase emerging research'],
  welcomeNote: 'Welcome to a program designed for meaningful conversations, applied knowledge, and long-term collaboration.',
  edition: '12th edition',
  venue: {
    name: 'International Convention Centre',
    address: 'Central Business District',
    city: 'Bengaluru',
    country: 'India',
    description: 'A modern venue with connected halls, exhibition space, and easy access to hotels and transit.',
    photos: [
      'https://images.unsplash.com/photo-1519167758481-83f29c8d83c1?w=900&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=900&auto=format&fit=crop',
    ],
    mapEmbedUrl: '',
    parkingInfo: 'On-site and valet parking available.',
    transportInfo: 'Airport transfers and city shuttle routes available.',
  },
  organizer: {
    name: 'Dr. Meera Raman',
    designation: 'Congress Chair',
    message: 'This congress is built to make knowledge useful: rigorous sessions, practical workshops, and space for collaboration.',
    email: 'secretariat@example.org',
    phone: '+91 90000 00000',
  },
  speakers: [
    { id: 'sp_1', name: 'Dr. Sarah Chen', designation: 'Professor of AI Medicine', organization: 'MIT', country: 'USA', speakerType: 'KEYNOTE', talkTitle: 'Human-centred intelligence in healthcare', bio: 'Researcher focused on trustworthy AI and clinical decision support.' },
    { id: 'sp_2', name: 'Prof. James Park', designation: 'Director of Research', organization: 'Stanford University', country: 'USA', speakerType: 'INVITED', talkTitle: 'Translational science at scale' },
    { id: 'sp_3', name: 'Dr. Ravi Shankar', designation: 'Consultant Scientist', organization: 'National Research Institute', country: 'India', speakerType: 'WORKSHOP', talkTitle: 'Building evidence pipelines' },
  ],
  committee: [
    { id: 'cm_1', name: 'Dr. Aisha Menon', designation: 'Scientific Chair', institution: 'City Medical University', country: 'India', committeeType: 'SCIENTIFIC' },
    { id: 'cm_2', name: 'Prof. Leo Martin', designation: 'Advisory Board', institution: 'Global Health Forum', country: 'UK', committeeType: 'ADVISORY' },
  ],
  sessions: [
    { id: 'ses_1', date: '2026-10-24', startTime: '09:00', endTime: '10:00', title: 'Opening keynote', room: 'Grand Hall', chair: 'Dr. Meera Raman', speakerIds: ['sp_1'], track: 'Plenary', sessionType: 'KEYNOTE' },
    { id: 'ses_2', date: '2026-10-24', startTime: '10:30', endTime: '11:30', title: 'Panel: research to practice', room: 'Hall A', speakerIds: ['sp_1', 'sp_2'], track: 'Translation', sessionType: 'PANEL' },
    { id: 'ses_3', date: '2026-10-25', startTime: '14:00', endTime: '16:00', title: 'Workshop: data-ready event operations', room: 'Workshop 2', speakerIds: ['sp_3'], track: 'Operations', sessionType: 'WORKSHOP' },
  ],
  tracks: [
    { id: 'tr_1', name: 'Plenary', color: '#6366f1' },
    { id: 'tr_2', name: 'Translation', color: '#14b8a6' },
  ],
  sponsors: [
    { id: 'so_1', name: 'MedTech Alliance', logoUrl: '', websiteUrl: '#', tier: 'PLATINUM' },
    { id: 'so_2', name: 'Research Cloud', logoUrl: '', websiteUrl: '#', tier: 'GOLD' },
    { id: 'so_3', name: 'BioSystems Lab', logoUrl: '', websiteUrl: '#', tier: 'SILVER' },
  ],
  ticketCategories: [
    { id: 'tc_1', name: 'Delegate', price: 450, currency: 'USD', benefits: ['All sessions', 'Lunch', 'Certificate'], registrationUrl: '#', isHighlighted: true },
    { id: 'tc_2', name: 'Student', price: 150, currency: 'USD', benefits: ['All sessions', 'Certificate'], registrationUrl: '#' },
  ],
  gallery: [
    { id: 'ga_1', url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=900&auto=format&fit=crop', caption: 'Main auditorium', type: 'PHOTO' },
    { id: 'ga_2', url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=900&auto=format&fit=crop', caption: 'Faculty session', type: 'PHOTO' },
  ],
  stats: {
    totalDelegates: 1200,
    totalSpeakers: 86,
    totalSessions: 64,
    totalCountries: 38,
    totalSponsors: 24,
  },
  socialLinks: {
    linkedin: '#',
    instagram: '#',
    website: '#',
  },
  snapshotId: 'mock_event_snapshot',
  snapshotCreatedAt: '2026-08-12T00:00:00.000Z',
};
