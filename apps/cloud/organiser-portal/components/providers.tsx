"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Toaster } from "sonner";

const ReactQueryDevtools = dynamic(
  () =>
    import("@tanstack/react-query-devtools")
      .then((mod) => ({ default: mod.ReactQueryDevtools }))
      .catch(() => ({ default: () => null })),
  { ssr: false }
);

const GlobalModal = dynamic(
  () => import("@/components/organizer/modals/GlobalModal").then((mod) => mod.GlobalModal),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  }));

  useEffect(() => {
    const checkOverlays = () => {
      const overlays = Array.from(document.querySelectorAll('.fixed.inset-0, [role="dialog"], [data-state="open"]'));
      const hasActiveOverlay = overlays.some(el => {
        if (el.getAttribute('data-state') === 'open') return true;
        if (el.getAttribute('role') === 'dialog') return true;
        
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && style.display !== 'none' && style.visibility !== 'hidden') {
          if (style.pointerEvents === 'none') {
            return el.querySelector('.pointer-events-auto') !== null;
          }
          return true;
        }
        return false;
      });

      if (hasActiveOverlay) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    };

    checkOverlays();

    const observer = new MutationObserver(checkOverlays);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['data-state', 'class', 'style'] 
    });

    return () => {
      observer.disconnect();
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <GlobalModal />
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          className: "text-sm font-semibold shadow-xl border rounded-xl",
          classNames: {
            error: "!bg-rose-600 !text-white !border-rose-700",
            success: "!bg-emerald-600 !text-white !border-emerald-700",
            warning: "!bg-amber-500 !text-slate-950 !border-amber-600 font-bold",
            info: "!bg-blue-600 !text-white !border-blue-700",
          },
        }}
      />
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

