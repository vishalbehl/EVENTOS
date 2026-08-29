"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { orgApi } from "@/components/organizer/org/org-api";
import { Button } from "@/components/ui/button";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { SettingsPage } from "./shared";
export function SettingsGeneralTab() { const query = useQuery({ queryKey: ["organisation", "me"], queryFn: orgApi.me }); const data = query.data?.organization; return <SettingsPage actions={<Button asChild variant="outline"><Link href="/organisation/preferences">Edit preferences</Link></Button>}>{query.isError ? <Unavailable>General settings are unavailable.</Unavailable> : null}<Panel title="General settings"><dl className="op-detail-list"><dt>Organisation</dt><dd>{data?.name || "Unavailable"}</dd><dt>Timezone</dt><dd>{data?.timezone || "Not configured"}</dd><dt>Country</dt><dd>{data?.country || "Not configured"}</dd><dt>Currency</dt><dd>{data?.currency || "Not configured"}</dd><dt>Language</dt><dd>{data?.language || "Not configured"}</dd><dt>Date format</dt><dd>{data?.date_format || "Not configured"}</dd></dl></Panel></SettingsPage>; }
