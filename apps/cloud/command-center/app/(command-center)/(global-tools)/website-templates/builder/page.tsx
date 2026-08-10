'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { WebsiteProjectData, WebsiteBuilderStudioProps } from '@eventos/website-builder-studio';

// Dynamically import WebsiteBuilderStudio with SSR disabled for GrapesJS DOM compatibility
const WebsiteBuilderStudio = dynamic<WebsiteBuilderStudioProps>(
  () => import('@eventos/website-builder-studio').then((mod) => mod.WebsiteBuilderStudio),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <span className="ml-3 font-semibold text-muted-foreground">Loading Command Center Website Studio...</span>
      </div>
    ),
  }
);

export default function CommandCenterWebsiteBuilderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const handleSaveMasterTemplate = async (data: WebsiteProjectData) => {
    console.log('[Command Center] Saving global master template:', data);
    // API call to backend /api/v1/platform/website-templates/master
    alert('Master landing template saved to global platform catalog!');
  };

  const handlePublishMasterTemplate = async (data: WebsiteProjectData) => {
    console.log('[Command Center] Publishing global master template:', data);
    // API call to backend /api/v1/platform/website-templates/publish
    alert('Master template published globally for all event organizers!');
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <WebsiteBuilderStudio
        mode="GLOBAL_ADMIN"
        onSave={handleSaveMasterTemplate}
        onPublish={handlePublishMasterTemplate}
        onBack={handleBack}
      />
    </div>
  );
}
