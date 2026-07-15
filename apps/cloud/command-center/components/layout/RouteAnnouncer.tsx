"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function routeLabel(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).at(-1) || "overview";
  if (/^[0-9a-f-]{20,}$/i.test(segment)) return "Details";
  return segment.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RouteAnnouncer() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setAnnouncement(`${routeLabel(pathname)} loaded`);
    window.requestAnimationFrame(() => document.getElementById("command-center-main")?.focus());
  }, [pathname]);

  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>;
}
