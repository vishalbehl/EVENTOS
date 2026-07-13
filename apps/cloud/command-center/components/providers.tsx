"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { Toaster } from "sonner";

import { ApiError } from "@/lib/api-client";

function shouldRetry(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return failureCount < 1;
  if (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 409 || error.status === 422) {
    return false;
  }
  return error.retryable;
}

export function createCommandCenterQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createCommandCenterQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" richColors closeButton />
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
