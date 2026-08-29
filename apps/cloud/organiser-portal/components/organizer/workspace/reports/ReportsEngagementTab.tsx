"use client";
import { Panel } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { ReportExportAction, ReportsPage, useReportDomain } from "./shared";
export function ReportsEngagementTab() { const query = useReportDomain("engagement"); const available = query.data?.metrics.engagement_pct != null || Boolean(query.data?.events?.length); return <ReportsPage data={query.data} error={query.isError} actions={<ReportExportAction domain="engagement" />}><Panel title="Engagement analytics">{available ? <dl className="op-detail-list"><dt>Average engagement</dt><dd>{query.data?.metrics.engagement_pct != null ? `${query.data.metrics.engagement_pct}%` : "Unavailable"}</dd><dt>Measured events</dt><dd>{query.data?.events.length || 0}</dd></dl> : <Unavailable>Authoritative engagement analytics have not been configured. No values have been estimated.</Unavailable>}</Panel></ReportsPage>; }
