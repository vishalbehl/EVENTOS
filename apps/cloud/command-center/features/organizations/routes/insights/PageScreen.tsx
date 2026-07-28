"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Sparkles, TrendingDown, ShieldAlert, Zap, Cloud, ArrowRight } from "lucide-react";
import { useOrganizationDomain } from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgSectionTitle, OrgMetricCard, OrgTabBar,
  UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

const INSIGHT_ICONS: Record<string, React.ElementType> = {
  COST_OPTIMIZATION: TrendingDown,
  SECURITY: ShieldAlert,
  EFFICIENCY: Zap,
  STORAGE: Cloud,
};

export default function InsightsPageScreen() {
  const params = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState("all");
  const { data, isLoading } = useOrganizationDomain(params.orgId, "insights");

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const domainData = data?.data as any;
  const current = domainData?.current ?? {};
  const healthFactors: any[] = current?.health_factors ?? [];

  const rawInsights: any[] = domainData?.insights ?? healthFactors.map((f: any, idx: number) => ({
    id: `insight-${f.key || idx}`,
    category: f.key === "security" ? "SECURITY" : f.key === "integrations" ? "EFFICIENCY" : "COST_OPTIMIZATION",
    severity: f.status === "CRITICAL" ? "HIGH" : f.status === "ATTENTION" ? "MEDIUM" : "LOW",
    title: `${f.label} Telemetry Assessment`,
    description: f.evidence || "Automated analysis generated from environment signals.",
    metric: f.score != null ? { label: "Health Score", value: `${f.score}%` } : null,
    action_label: "View Telemetry",
  }));

  const filteredInsights = activeTab === "all"
    ? rawInsights
    : rawInsights.filter((i) => i.category.toLowerCase() === activeTab);

  const healthyCount = healthFactors.filter((f) => f.status === "HEALTHY").length;
  const optScore = healthFactors.length > 0 ? Math.round((healthyCount / healthFactors.length) * 100) : 100;
  const securityRisks = healthFactors.filter((f) => f.status === "CRITICAL" || f.status === "ATTENTION").length;

  const tabs = [
    { key: "all", label: "All Insights" },
    { key: "cost_optimization", label: "Cost Optimization" },
    { key: "security", label: "Security" },
    { key: "efficiency", label: "Efficiency" },
  ];

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Sparkles}
        title="AI Insights"
        description="Actionable recommendations powered by AI and deterministic rules."
        generatedAt={data?.generated_at}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OrgMetricCard label="Optimization Score" value={`${optScore}%`} />
        <OrgMetricCard label="Health Factors" value={healthFactors.length} sub={`${healthyCount} healthy`} />
        <OrgMetricCard label="Security Risks" value={securityRisks} />
        <OrgMetricCard label="Total Insights" value={rawInsights.length} />
      </div>

      {current?.summary && (
        <OrgCard className="border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5">
          <OrgSectionTitle>Executive Summary</OrgSectionTitle>
          <p className="text-xs text-[var(--text-primary)] leading-relaxed">{current.summary}</p>
        </OrgCard>
      )}

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="space-y-4">
        {filteredInsights.length === 0 ? (
          <OrgCard className="text-center py-10">
            <Sparkles className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--text-primary)]">No insights found</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Your organization is fully optimized in this category.
            </p>
          </OrgCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredInsights.map((insight) => {
              const Icon = INSIGHT_ICONS[insight.category] || Sparkles;
              const severityColor =
                insight.severity === "HIGH"
                  ? "text-[var(--status-danger)] bg-[var(--status-danger)]/10"
                  : insight.severity === "MEDIUM"
                  ? "text-[var(--status-warning)] bg-[var(--status-warning)]/10"
                  : "text-[var(--status-info)] bg-[var(--status-info)]/10";

              return (
                <OrgCard key={insight.id} className="flex flex-col relative overflow-hidden">
                  <div
                    className={`absolute top-0 left-0 w-1 h-full ${
                      insight.severity === "HIGH"
                        ? "bg-[var(--status-danger)]"
                        : insight.severity === "MEDIUM"
                        ? "bg-[var(--status-warning)]"
                        : "bg-[var(--status-info)]"
                    }`}
                  />
                  <div className="pl-2">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${severityColor}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
                          {insight.category.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${severityColor}`}>
                        {insight.severity} IMPACT
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">{insight.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4 flex-1">
                      {insight.description}
                    </p>

                    {insight.metric && (
                      <div className="mb-4 bg-[var(--bg-surface-3)]/50 rounded-lg p-3 flex items-center justify-between border border-[var(--border-subtle)]">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                          {insight.metric.label}
                        </span>
                        <span className="text-sm font-black text-[var(--text-primary)]">{insight.metric.value}</span>
                      </div>
                    )}

                    <div className="mt-auto pt-4 border-t border-[var(--border-subtle)]">
                      <button className="flex items-center gap-2 text-xs font-bold text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)] transition-colors group">
                        {insight.action_label || "Take Action"}
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </OrgCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
