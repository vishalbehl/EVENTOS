"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

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
    </QueryClientProvider>
  );
}
