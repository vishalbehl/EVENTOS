"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
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
    </QueryClientProvider>
  );
}
