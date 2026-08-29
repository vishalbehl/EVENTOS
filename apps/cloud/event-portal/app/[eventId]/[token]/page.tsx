"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import DirectSpeakerWorkspacePage from "../speaker/[token]/page";

export default function LegacySpeakerTokenPage() {
  const { eventId, token } = useParams<{ eventId: string; token: string }>();
  const router = useRouter();

  // If the token matches standard reserved keywords, don't treat as speaker token
  const reserved = ["login", "register", "dashboard", "speaker", "poster"];
  if (reserved.includes(token)) {
    return null;
  }

  // Render the full direct speaker workspace for complete backward-compatibility
  return <DirectSpeakerWorkspacePage />;
}
