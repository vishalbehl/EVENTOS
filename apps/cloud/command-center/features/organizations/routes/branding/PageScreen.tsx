"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useOrganizationDomain,
  usePublishOrganizationBranding,
  useUpdateOrganizationBranding,
} from "@/features/organizations/api/organization-console-api";
import {
  OrgPageHeader, OrgCard, OrgTabBar, OrgSectionTitle,
  UnavailableDomain, LoadingPage,
} from "@/features/organizations/components/OrgPageShared";

export default function BrandingPageScreen() {
  const params = useParams<{ orgId: string }>();
  const [activeTab, setActiveTab] = useState("profile");
  const { data, isLoading } = useOrganizationDomain(params.orgId, "branding");
  const updateBranding = useUpdateOrganizationBranding(params.orgId);
  const publishBranding = usePublishOrganizationBranding(params.orgId);
  const [reason, setReason] = useState("Update the governed organization brand configuration.");
  const [whiteLabel, setWhiteLabel] = useState({
    enabled: false,
    product_name: "",
    hide_eventos_branding: false,
    footer_text: "",
    support_url: "",
  });
  const [loginPage, setLoginPage] = useState({
    enabled: false,
    headline: "",
    subheading: "",
    logo_asset_ref: "",
    background_asset_ref: "",
    support_url: "",
    terms_url: "",
    privacy_url: "",
  });

  const domainData = data?.data as any;
  const profile = domainData?.profile ?? null;
  const published = domainData?.published ?? false;

  useEffect(() => {
    const templates = profile?.templates ?? {};
    setWhiteLabel({
      enabled: Boolean(templates.white_label?.enabled),
      product_name: templates.white_label?.product_name ?? "",
      hide_eventos_branding: Boolean(templates.white_label?.hide_eventos_branding),
      footer_text: templates.white_label?.footer_text ?? "",
      support_url: templates.white_label?.support_url ?? "",
    });
    setLoginPage({
      enabled: Boolean(templates.login_page?.enabled),
      headline: templates.login_page?.headline ?? "",
      subheading: templates.login_page?.subheading ?? "",
      logo_asset_ref: templates.login_page?.logo_asset_ref ?? "",
      background_asset_ref: templates.login_page?.background_asset_ref ?? "",
      support_url: templates.login_page?.support_url ?? "",
      terms_url: templates.login_page?.terms_url ?? "",
      privacy_url: templates.login_page?.privacy_url ?? "",
    });
  }, [profile?.version]);

  if (isLoading) return <LoadingPage />;
  if (!data?.availability?.available) return <UnavailableDomain reason={data?.availability?.reason} />;

  const assets = profile?.assets ?? {};
  const tokens = profile?.tokens ?? {};
  const templates = profile?.templates ?? {};
  const { white_label: _whiteLabel, login_page: _loginPage, ...otherTemplates } = templates;

  const tabs = [
    { key: "profile", label: "Organization Profile" },
    { key: "logo", label: "Logo & Favicon" },
    { key: "theme", label: "Theme & Colors" },
    { key: "domain", label: "Custom Domain" },
    { key: "white-label", label: "White Label" },
    { key: "login", label: "Login Page" },
    { key: "templates", label: "Email Templates" },
  ];

  const saveDraft = async () => {
    try {
      await updateBranding.mutateAsync({
        assets,
        tokens,
        templates: otherTemplates,
        white_label: {
          enabled: whiteLabel.enabled,
          product_name: whiteLabel.product_name.trim() || null,
          hide_eventos_branding: whiteLabel.hide_eventos_branding,
          footer_text: whiteLabel.footer_text.trim() || null,
          support_url: whiteLabel.support_url.trim() || null,
        },
        login_page: {
          enabled: loginPage.enabled,
          headline: loginPage.headline.trim() || null,
          subheading: loginPage.subheading.trim() || null,
          logo_asset_ref: loginPage.logo_asset_ref.trim() || null,
          background_asset_ref: loginPage.background_asset_ref.trim() || null,
          support_url: loginPage.support_url.trim() || null,
          terms_url: loginPage.terms_url.trim() || null,
          privacy_url: loginPage.privacy_url.trim() || null,
        },
        version: profile?.version ?? 1,
        reason: reason.trim(),
      });
      toast.success("Brand draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Brand draft could not be saved.");
    }
  };

  const publish = async () => {
    if (!profile) return;
    try {
      await publishBranding.mutateAsync(profile.version);
      toast.success("Brand configuration published.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Brand configuration could not be published.");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <OrgPageHeader
        icon={Sparkles}
        title="Branding"
        description="Customize your organization's brand identity and assets."
        generatedAt={data?.generated_at}
        actions={
          <div className="flex gap-2">
            <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${published ? "bg-[var(--status-success-muted)] text-[var(--status-success)]" : "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]"}`}>
              {published ? "Published" : "Draft"}
            </span>
            <button disabled={reason.trim().length < 12 || updateBranding.isPending} onClick={() => void saveDraft()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-[10px] font-bold disabled:opacity-40"><Save className="h-3.5 w-3.5" />Save draft</button>
            <button disabled={!profile || profile.status === "PUBLISHED" || publishBranding.isPending} onClick={() => void publish()} className="flex items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"><ShieldCheck className="h-3.5 w-3.5" />Publish</button>
          </div>
        }
      />

      <OrgTabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <OrgCard>
              <OrgSectionTitle>Organization Information</OrgSectionTitle>
              <div className="space-y-3">
                {[
                  { label: "Organization Name", key: "name" },
                  { label: "Tagline", key: "tagline" },
                  { label: "Website", key: "website" },
                  { label: "Industry", key: "industry" },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                      {label}
                    </label>
                    <input
                      readOnly
                      value={(assets[key] || profile?.[key]) ?? ""}
                      className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                    Description
                  </label>
                  <textarea
                    readOnly
                    value={assets.description || profile?.description || ""}
                    rows={3}
                    className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none resize-none"
                  />
                </div>
              </div>
            </OrgCard>
          </div>

          <div className="space-y-4">
            <OrgCard>
              <OrgSectionTitle>Logo Preview</OrgSectionTitle>
              <div className="w-full h-28 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] flex items-center justify-center mb-3">
                {assets.logo_url ? (
                  <img src={assets.logo_url} alt="Org logo" className="max-h-20 max-w-full object-contain" />
                ) : (
                  <div className="text-[var(--text-tertiary)] text-xs text-center">No logo uploaded</div>
                )}
              </div>
              <p className="text-[9px] text-[var(--text-tertiary)]">Recommended: 940 × 300px, max 2MB</p>
            </OrgCard>

            <OrgCard>
              <OrgSectionTitle>Brand Colors</OrgSectionTitle>
              {Object.entries(tokens).filter(([k]) => k.includes("color")).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-secondary)] capitalize">{key.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-2">
                    {typeof val === "string" && val.startsWith("#") && (
                      <div className="w-4 h-4 rounded-md border border-[var(--border-default)]" style={{ backgroundColor: val }} />
                    )}
                    <span className="text-[10px] font-mono text-[var(--text-primary)]">{String(val)}</span>
                  </div>
                </div>
              ))}
              {Object.keys(tokens).filter((k) => k.includes("color")).length === 0 && (
                <p className="text-xs text-[var(--text-tertiary)]">No brand colors configured.</p>
              )}
            </OrgCard>
          </div>
        </div>
      )}

      {activeTab === "logo" && (
        <OrgCard>
          <OrgSectionTitle>Logo & Favicon</OrgSectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)] mb-2">Current Logo</p>
              <div className="h-32 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] flex items-center justify-center">
                {assets.logo_url ? (
                  <img src={assets.logo_url} alt="" className="max-h-24 max-w-full object-contain" />
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)]">No logo uploaded</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)] mb-2">Favicon</p>
              <div className="h-32 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] flex items-center justify-center">
                {assets.favicon_url ? (
                  <img src={assets.favicon_url} alt="" className="max-h-16 max-w-full object-contain" />
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)]">No favicon uploaded</p>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-[var(--text-tertiary)]">
            To upload new assets, use the branding API or the tenant's organization settings portal.
          </p>
        </OrgCard>
      )}

      {activeTab === "theme" && (
        <OrgCard>
          <OrgSectionTitle>Theme Tokens</OrgSectionTitle>
          {Object.keys(tokens).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(tokens).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg bg-[var(--bg-surface-3)] px-3 py-2">
                  <span className="text-xs text-[var(--text-secondary)] font-mono">{key}</span>
                  <div className="flex items-center gap-2">
                    {typeof value === "string" && value.startsWith("#") && (
                      <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: value }} />
                    )}
                    <span className="text-[10px] font-mono text-[var(--text-primary)]">{String(value)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">No custom theme tokens configured.</p>
          )}
        </OrgCard>
      )}

      {activeTab === "domain" && (
        <OrgCard>
          <OrgSectionTitle>Custom Domain</OrgSectionTitle>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-4 py-3 font-mono text-sm text-[var(--text-primary)]">
            {assets.custom_domain || profile?.custom_domain || "No custom domain configured"}
          </div>
          <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">Custom domain configuration is managed at the platform level. Contact support to update.</p>
        </OrgCard>
      )}

      {activeTab === "white-label" && (
        <OrgCard>
          <OrgSectionTitle>White-label publication</OrgSectionTitle>
          <p className="mb-4 text-xs text-[var(--text-tertiary)]">Publishing is blocked unless the organization is entitled to FEAT_WHITE_LABEL. Disabling remains available for safe rollback.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={whiteLabel.enabled} onChange={(event) => setWhiteLabel({ ...whiteLabel, enabled: event.target.checked })} />Enable white-labelled portal shell</label>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={whiteLabel.hide_eventos_branding} onChange={(event) => setWhiteLabel({ ...whiteLabel, hide_eventos_branding: event.target.checked })} />Hide EventOS attribution</label>
            <label className="text-xs font-bold">Product name<input value={whiteLabel.product_name} onChange={(event) => setWhiteLabel({ ...whiteLabel, product_name: event.target.value })} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-normal" /></label>
            <label className="text-xs font-bold">Support URL<input value={whiteLabel.support_url} onChange={(event) => setWhiteLabel({ ...whiteLabel, support_url: event.target.value })} placeholder="https://support.example.com" className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-normal" /></label>
            <label className="text-xs font-bold md:col-span-2">Footer text<input value={whiteLabel.footer_text} onChange={(event) => setWhiteLabel({ ...whiteLabel, footer_text: event.target.value })} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-normal" /></label>
          </div>
        </OrgCard>
      )}

      {activeTab === "login" && (
        <OrgCard>
          <OrgSectionTitle>Custom organizer login page</OrgSectionTitle>
          <p className="mb-4 text-xs text-[var(--text-tertiary)]">Only HTTPS links and organization-scoped asset references are accepted. Arbitrary HTML, CSS, and scripts are never published.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-xs font-bold md:col-span-2"><input type="checkbox" checked={loginPage.enabled} onChange={(event) => setLoginPage({ ...loginPage, enabled: event.target.checked })} />Enable custom login experience</label>
            {([
              ["headline", "Headline"],
              ["subheading", "Subheading"],
              ["logo_asset_ref", "Logo asset reference"],
              ["background_asset_ref", "Background asset reference"],
              ["support_url", "Support URL"],
              ["terms_url", "Terms URL"],
              ["privacy_url", "Privacy URL"],
            ] as const).map(([key, label]) => <label key={key} className="text-xs font-bold">{label}<input value={loginPage[key]} onChange={(event) => setLoginPage({ ...loginPage, [key]: event.target.value })} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-normal" /></label>)}
          </div>
        </OrgCard>
      )}

      <OrgCard>
        <label className="text-xs font-bold">Administrative reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-3)] px-3 py-2 font-normal" /></label>
      </OrgCard>

      {activeTab === "templates" && (
        <OrgCard>
          <OrgSectionTitle>Email Templates</OrgSectionTitle>
          {profile?.templates && Object.keys(profile.templates).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(profile.templates as Record<string, any>).map(([key, tmpl]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border border-[var(--border-default)] px-4 py-3">
                  <span className="text-xs font-bold text-[var(--text-primary)] capitalize">{key.replace(/_/g, " ")}</span>
                  <span className={`text-[10px] font-bold ${tmpl?.active ? "text-[var(--status-success)]" : "text-[var(--text-tertiary)]"}`}>
                    {tmpl?.active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">No custom email templates configured. Platform defaults are in use.</p>
          )}
        </OrgCard>
      )}
    </div>
  );
}
