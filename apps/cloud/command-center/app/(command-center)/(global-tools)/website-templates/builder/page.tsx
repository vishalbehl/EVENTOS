'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/super-admin/ui/PageContainer';

function RedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('templateId');

  useEffect(() => {
    const dest = templateId
      ? `/applications/templates/website/builder?templateId=${encodeURIComponent(templateId)}`
      : '/applications/templates/website/builder';
    router.replace(dest);
  }, [router, templateId]);

  return <PageContainer className="p-0"><p className="p-6 text-sm text-secondary">Redirecting to the canonical website builder…</p></PageContainer>;
}

export default function WebsiteTemplatesBuilderGlobalRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}
