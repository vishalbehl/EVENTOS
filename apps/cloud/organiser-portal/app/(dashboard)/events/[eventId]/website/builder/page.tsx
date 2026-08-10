'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { WebsiteProjectData, EventDataSnapshot, ThemePalette, WebsiteBuilderStudioProps } from '@eventos/website-builder-studio';

// Dynamically import WebsiteBuilderStudio with SSR disabled for GrapesJS DOM compatibility
const WebsiteBuilderStudio = dynamic<WebsiteBuilderStudioProps>(
  () => import('@eventos/website-builder-studio').then((mod) => mod.WebsiteBuilderStudio),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-screen flex items-center justify-center bg-[#080912] text-white">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="ml-3 font-semibold text-slate-300">Initializing GrapesJS Website Studio...</span>
      </div>
    ),
  }
);

export default function OrganiserWebsiteBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;

  const [loading, setLoading] = useState(true);
  const [initialData, setInitialData] = useState<WebsiteProjectData | undefined>(undefined);
  const [theme, setTheme] = useState<Partial<ThemePalette>>({
    primary: '#7c3aed',
    secondary: '#f43f5e',
    background: '#080912',
    surface: '#0c0e1a',
  });
  const [eventSnapshot, setEventSnapshot] = useState<EventDataSnapshot>({
    eventName: 'Annual Innovation Summit 2026',
    startDate: '2026-10-24T10:00:00Z',
    endDate: '2026-10-26T18:00:00Z',
    snapshotId: `snap-${Date.now()}`,
    snapshotCreatedAt: new Date().toISOString(),
    venue: {
      name: 'Grand Tech Convention Center',
      address: '123 Tech Blvd',
      city: 'San Francisco',
      country: 'USA',
    },
    speakers: [
      { id: 'spk1', name: 'Dr. Jane Smith', designation: 'AI Researcher', speakerType: 'KEYNOTE', photo: 'https://i.pravatar.cc/150?u=jane' },
      { id: 'spk2', name: 'John Doe', designation: 'CTO', speakerType: 'INVITED', photo: 'https://i.pravatar.cc/150?u=john' },
    ],
    sessions: [
      { id: 'sess1', title: 'Future of Tech', date: '2026-10-24', startTime: '10:00', endTime: '11:00', sessionType: 'KEYNOTE', track: 'Main Track', speakerIds: ['spk1'] },
    ],
    sponsors: [
      { id: 'spo1', name: 'TechCorp', tier: 'PLATINUM', logoUrl: 'https://ui-avatars.com/api/?name=TC&background=random' },
    ],
    ticketCategories: [
      { id: 't1', name: 'Standard', price: 299, currency: 'USD', benefits: ['Full Access'] },
    ],
    importantDates: [
      { id: 'd1', label: 'Early Bird Ends', date: '2026-09-01', type: 'EARLY_BIRD' },
    ],
    stats: { totalDelegates: 1200, totalCountries: 15 },
  });

  useEffect(() => {
    // In production, fetch event branding, data bindings, & saved website project JSON from backend
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, [eventId]);

  const handleSave = async (data: WebsiteProjectData) => {
    console.log('[Organiser Portal] Saving website draft:', data);
    // API call to backend /events/{eventId}/website/draft
  };

  const handlePublish = async (data: WebsiteProjectData) => {
    console.log('[Organiser Portal] Publishing website:', data);
    // API call to backend /events/{eventId}/website/publish
    alert('🎉 Website published successfully! Public landing page is live.');
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#080912] text-white">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-70px)] w-full overflow-hidden bg-[#080912]">
      <WebsiteBuilderStudio
        mode="ORGANIZER_TENANT"
        initialData={initialData}
        theme={theme}
        eventSnapshot={eventSnapshot}
        onSave={handleSave}
        onPublish={handlePublish}
        onBack={handleBack}
      />
    </div>
  );
}
