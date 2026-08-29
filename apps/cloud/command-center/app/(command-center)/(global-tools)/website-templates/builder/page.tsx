'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

  return null;
}

export default function WebsiteTemplatesBuilderGlobalRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}
