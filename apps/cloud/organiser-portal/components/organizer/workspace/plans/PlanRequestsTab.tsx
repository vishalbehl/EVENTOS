"use client";
import { useQuery } from "@tanstack/react-query";
import { orgApi } from "@/components/organizer/org/org-api";
import { DataTable, Panel, StatusBadge } from "../OrganiserPrimitives";
import { asList, CommercialRequestAction, PlansPage, usePlanData } from "./shared";
export function PlanRequestsTab() { const query = useQuery({ queryKey: ["organisation", "commercial-access-requests"], queryFn: orgApi.commercialAccessRequests }); const { unrestricted } = usePlanData(); return <PlansPage actions={unrestricted ? undefined : <CommercialRequestAction />}><Panel title="Commercial requests" className="p-0"><DataTable columns={["Request", "Plan", "Status", "Created"]} rows={asList(query.data).map((request) => [request.reference || request.id, request.plan_name || request.plan?.name || "-", <StatusBadge key={`${request.id}-status`} status={request.status || "Pending"} />, request.created_at ? new Date(request.created_at).toLocaleDateString() : "-"])} empty={query.isError ? "Request history is unavailable." : "No requests found."} /></Panel></PlansPage>; }
