"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { DataTable, Panel } from "../OrganiserPrimitives";
import { PlansPage } from "./shared";
export function PlanHistoryTab() { const [page,setPage]=useState(1); const [pageSize,setPageSize]=useState(10); const query=useQuery({queryKey:["entitlement-history",page,pageSize],queryFn:()=>apiGet<any>(`/organiser/entitlements/history?page=${page}&page_size=${pageSize}`)}); return <PlansPage><Panel title="Entitlement history" className="p-0"><DataTable columns={["Change","Source","Version","Actor","Effective at"]} total={query.data?.total||0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} rows={(query.data?.items||[]).map((row:any)=>[String(row.action||"Changed").replaceAll("_"," "),row.source||"entitlement",row.version ?? "-",row.actor_role||row.actor_user_id||"System",row.occurred_at?new Date(row.occurred_at).toLocaleString():"Unavailable"])} empty={query.isLoading?"Loading entitlement history...":query.isError?"Entitlement history is unavailable.":"No entitlement changes have been recorded."}/></Panel></PlansPage>; }
