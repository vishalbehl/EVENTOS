"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DirectSpeakerWorkspacePage from "../speaker/[token]/page";
import { Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function SmartTokenDispatcherPage() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<string | null>(null);

  const reserved = [
    "login",
    "register",
    "dashboard",
    "speaker",
    "poster",
    "author",
    "review",
    "call-for-abstracts",
  ];

  useEffect(() => {
    if (!token || reserved.includes(token)) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function inspectGrant() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/programme/access/${token}`);
        if (!res.ok) {
          // If not found or failed, fall back to speaker page compatibility
          if (isMounted) {
            setAudience("SPEAKER");
            setLoading(false);
          }
          return;
        }

        const data = await res.json();
        const grantAudience = (data.audience || "").toUpperCase();

        if (grantAudience === "AUTHOR") {
          router.replace(`/${eventId}/author/${token}`);
          return;
        } else if (grantAudience === "REVIEWER") {
          router.replace(`/${eventId}/review/${token}`);
          return;
        } else {
          if (isMounted) {
            setAudience("SPEAKER");
            setLoading(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setAudience("SPEAKER");
          setLoading(false);
        }
      }
    }

    inspectGrant();

    return () => {
      isMounted = false;
    };
  }, [eventId, token, router]);

  if (reserved.includes(token)) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] text-[var(--fg)] p-6">
        <Loader2 className="w-8 h-8 text-[var(--pri)] animate-spin mb-3" />
        <p className="text-xs uppercase tracking-widest text-[var(--muted-fg)] font-semibold">
          Resolving secure portal access...
        </p>
      </div>
    );
  }

  // Render the direct speaker workspace
  return <DirectSpeakerWorkspacePage />;
}

