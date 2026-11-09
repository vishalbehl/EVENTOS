"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "../OrganiserPrimitives";
import { SettingsPage } from "./shared";

/** Compatibility surface for the retired duplicate branding editor. */
export function SettingsBrandingTab() {
  const router = useRouter();
  useEffect(() => { router.replace("/organisation/branding"); }, [router]);
  return <SettingsPage><Panel title="Branding has moved"><div className="flex items-center gap-4"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--org-purple-soft)] text-[var(--org-purple)]"><Palette className="size-5" /></span><div><p className="font-bold">Opening the canonical organisation branding workspace…</p><p className="mt-1 text-sm text-[var(--op-muted)]">Logo, favicon, scan status and public brand colours are managed in one place.</p></div><Button asChild className="ml-auto"><Link href="/organisation/branding">Open branding</Link></Button></div></Panel></SettingsPage>;
}
