"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { SettingsPage } from "./shared";
export function SettingsIntegrationsTab() { const query = useQuery({ queryKey: ["organisation-settings", "integrations"], queryFn: () => apiGet<any>("/organiser/integrations") }); return <SettingsPage actions={<Button asChild><Link href="/organisation/integrations">Manage integrations</Link></Button>}><Panel title="Integrations" className="p-0"><DataTable columns={["Provider", "Status", "Version"]} rows={(query.data?.items || []).map((row: any) => [row.provider, <StatusBadge key={row.id} status={row.is_active ? "Active" : "Inactive"} />, row.version])} empty={query.isError ? "Integrations are unavailable." : "No integrations connected."} /></Panel></SettingsPage>; }
