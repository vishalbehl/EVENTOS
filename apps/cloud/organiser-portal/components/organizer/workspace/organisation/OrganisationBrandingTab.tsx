"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileImage, Save, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, apiGet } from "@/lib/api-client";
import { usePortalQueryScope } from "@/hooks/useAccessBootstrap";
import { Panel, StatusBadge } from "../OrganiserPrimitives";
import { Unavailable } from "../OrganiserSection";
import { OrganisationPage } from "./shared";

type BrandProfile = {
  status: string;
  assets: {
    logo_asset_id?: string | null;
    favicon_asset_id?: string | null;
    logo_url?: string | null;
    favicon_url?: string | null;
  };
  tokens: { primary_color?: string; secondary_color?: string };
  version: number;
  published_version?: number | null;
};

type BrandSettings = { profile: BrandProfile | null };
type Asset = { id: string; name: string; mime_type: string; processing_status: string; tags?: string[] };

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export function OrganisationBrandingTab() {
  const queryClient = useQueryClient();
  const scope = usePortalQueryScope();
  const retryKey = useRef(crypto.randomUUID());
  const query = useQuery({
    queryKey: ["organisation-settings", ...scope, "branding"],
    queryFn: () => apiGet<BrandSettings>("/organiser/settings/branding"),
  });
  const assets = useQuery({
    queryKey: ["organisation-brand-assets", ...scope],
    queryFn: () => apiGet<Asset[]>("/files?page=1&page_size=100"),
    refetchInterval: (state) => state.state.data?.some((asset) =>
      asset.mime_type.startsWith("image/") && asset.processing_status !== "READY"
    ) ? 5000 : false,
  });
  const [form, setForm] = useState({
    logo_asset_id: "",
    favicon_asset_id: "",
    primary_color: "#6e36f5",
    secondary_color: "#3c8df5",
  });
  const [loaded, setLoaded] = useState("");
  const [uploadKind, setUploadKind] = useState<"logo" | "favicon" | null>(null);

  useEffect(() => {
    const profile = query.data?.profile;
    if (!profile) return;
    const next = {
      logo_asset_id: profile.assets?.logo_asset_id || "",
      favicon_asset_id: profile.assets?.favicon_asset_id || "",
      primary_color: profile.tokens?.primary_color || "#6e36f5",
      secondary_color: profile.tokens?.secondary_color || "#3c8df5",
    };
    const serialized = JSON.stringify(next);
    if (serialized !== loaded) {
      setForm(next);
      setLoaded(serialized);
    }
  }, [loaded, query.data]);

  const upload = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: "logo" | "favicon" }) => {
      const body = new FormData();
      body.append("file", file);
      return apiClient.post<Asset>(`/files/upload?tags=organisation-brand-${kind}`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onMutate: ({ kind }) => setUploadKind(kind),
    onSuccess: async (asset, variables) => {
      setForm((current) => ({ ...current, [`${variables.kind}_asset_id`]: asset.id }));
      await queryClient.invalidateQueries({ queryKey: ["organisation-brand-assets", ...scope] });
      toast.success("Asset uploaded and queued for security scanning.");
    },
    onError: (error: any) => toast.error(error?.message || "Brand asset could not be uploaded."),
    onSettled: () => setUploadKind(null),
  });

  const save = useMutation({
    mutationFn: () => apiClient.put<BrandProfile>("/organiser/settings/branding", {
      logo_asset_id: form.logo_asset_id || null,
      favicon_asset_id: form.favicon_asset_id || null,
      primary_color: form.primary_color,
      secondary_color: form.secondary_color,
    }, { headers: {
      "If-Match": String(query.data?.profile?.version || 0),
      "Idempotency-Key": retryKey.current,
    } }),
    onSuccess: async () => {
      retryKey.current = crypto.randomUUID();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organisation-settings", ...scope, "branding"] }),
        queryClient.invalidateQueries({ queryKey: ["organisation", "me"] }),
      ]);
      toast.success("Brand identity saved.");
    },
    onError: (error: any) => toast.error(error?.status === 412 ? "Branding changed elsewhere. Refresh before saving again." : error?.message || "Branding could not be saved."),
  });

  const imageAssets = (assets.data || []).filter((asset) =>
    asset.mime_type.startsWith("image/") &&
    (asset.mime_type !== "image/svg+xml" || asset.tags?.includes("system:sanitized-svg-v1"))
  );
  const selectedReady = [form.logo_asset_id, form.favicon_asset_id].filter(Boolean).every((id) => imageAssets.some((asset) => asset.id === id && asset.processing_status === "READY"));
  const dirty = loaded !== JSON.stringify(form);
  const publicLogo = query.data?.profile?.assets?.logo_url;

  return (
    <OrganisationPage actions={<div className="flex gap-2"><Button variant="outline" disabled={!dirty || save.isPending} onClick={() => setForm(JSON.parse(loaded || JSON.stringify(form)))}>Discard</Button><Button disabled={!dirty || !selectedReady || save.isPending} onClick={() => save.mutate()}><Save className="mr-2 size-4" />{save.isPending ? "Saving…" : "Save identity"}</Button></div>}>
      {query.isError ? <Unavailable>Organisation branding is unavailable.</Unavailable> : null}
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel title="Logo & identity" description="Only tenant-owned images that pass security scanning can be published.">
          <div className="grid gap-4 md:grid-cols-2">
            <AssetField label="Organisation logo" kind="logo" selected={form.logo_asset_id} assets={imageAssets} busy={uploadKind === "logo"} onSelect={(id) => setForm({ ...form, logo_asset_id: id })} onUpload={(file) => upload.mutate({ file, kind: "logo" })} />
            <AssetField label="Favicon" kind="favicon" selected={form.favicon_asset_id} assets={imageAssets} busy={uploadKind === "favicon"} onSelect={(id) => setForm({ ...form, favicon_asset_id: id })} onUpload={(file) => upload.mutate({ file, kind: "favicon" })} />
          </div>
          <div className="op-form-grid mt-5">
            {(["primary_color", "secondary_color"] as const).map((key) => <label key={key}>{key === "primary_color" ? "Primary brand colour" : "Secondary brand colour"}<div className="mt-2 flex gap-2"><input aria-label={key} type="color" className="h-10 w-12 rounded-xl border border-[var(--org-border)]" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /><Input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div></label>)}
          </div>
        </Panel>
        <Panel title="Public brand preview" description="These colours apply to public event experiences, not the organiser control interface.">
          <div className="rounded-2xl border border-[var(--org-border)] bg-white p-5 text-slate-950">
            <div className="flex min-h-20 items-center justify-center rounded-xl bg-slate-50">
              {publicLogo ? <img src={`${apiOrigin}${publicLogo}`} alt="Organisation logo" className="max-h-14 max-w-[80%] object-contain" /> : <FileImage className="size-10 text-slate-300" />}
            </div>
            <div className="mt-4 h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${form.primary_color}, ${form.secondary_color})` }} />
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-600"><ShieldCheck className="size-4 text-emerald-600" />Public delivery is scan-gated and short-lived.</div>
          </div>
          <dl className="op-detail-list mt-4"><dt>Draft status</dt><dd>{query.data?.profile?.status || "Not configured"}</dd><dt>Version</dt><dd>{query.data?.profile?.version ?? 0}</dd><dt>Published version</dt><dd>{query.data?.profile?.published_version || "Not published"}</dd></dl>
        </Panel>
      </div>
    </OrganisationPage>
  );
}

function AssetField({ label, kind, selected, assets, busy, onSelect, onUpload }: { label: string; kind: "logo" | "favicon"; selected: string; assets: Asset[]; busy: boolean; onSelect: (id: string) => void; onUpload: (file: File) => void }) {
  const selectedAsset = assets.find((asset) => asset.id === selected);
  return <section className="rounded-2xl border border-[var(--org-border)] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{label}</p><p className="mt-1 text-xs text-[var(--op-muted)]">{kind === "logo" ? "PNG, JPG, WebP or SVG" : "Square PNG or ICO recommended"}</p></div>{selectedAsset ? <StatusBadge status={selectedAsset.processing_status} /> : null}</div><select value={selected} onChange={(event) => onSelect(event.target.value)} className="input mt-4 h-10 w-full rounded-xl px-3 text-sm"><option value="">No asset selected</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.processing_status.toLowerCase()}</option>)}</select><label className="mt-3 inline-flex cursor-pointer items-center rounded-full border border-[var(--org-border)] px-4 py-2 text-xs font-bold"><Upload className="mr-2 size-4" />{busy ? "Uploading…" : "Upload image"}<input className="sr-only" type="file" accept={kind === "favicon" ? "image/png,image/x-icon,image/vnd.microsoft.icon" : "image/png,image/jpeg,image/webp,image/svg+xml"} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label>{selectedAsset && selectedAsset.processing_status !== "READY" ? <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">This asset cannot be saved until security processing reports READY.</p> : null}</section>;
}
