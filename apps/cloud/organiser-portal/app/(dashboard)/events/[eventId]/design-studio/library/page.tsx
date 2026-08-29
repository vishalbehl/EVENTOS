"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Award,
  CreditCard,
  FileImage,
  Layout,
  Mail,
  Palette,
  Plus,
} from "lucide-react";
import {
  DataTable,
  MetricCard,
  OrganiserPage,
  Panel,
  StatusBadge,
} from "@/components/organizer/workspace/OrganiserPrimitives";
import { Button } from "@/components/ui/button";
import { useEvent } from "@/hooks/useEvents";

interface DesignAsset {
  id: string;
  name: string;
  type: "Badge" | "Certificate" | "Email Template" | "Digital Banner" | "Theme Asset";
  dimensions: string;
  lastUpdated: string;
  status: "active" | "draft";
}

const initialAssets: DesignAsset[] = [
  { id: "1", name: "VIP Delegate Physical Badge (300dpi)", type: "Badge", dimensions: "4.0 x 6.0 in", lastUpdated: "2026-08-20", status: "active" },
  { id: "2", name: "Standard Attendee Badge (with QR)", type: "Badge", dimensions: "3.5 x 5.0 in", lastUpdated: "2026-08-18", status: "active" },
  { id: "3", name: "Certificate of Keynote Participation", type: "Certificate", dimensions: "A4 Landscape", lastUpdated: "2026-08-15", status: "active" },
  { id: "4", name: "Speaker Invitation Modern Dark Template", type: "Email Template", dimensions: "Responsive 600px", lastUpdated: "2026-08-22", status: "active" },
  { id: "5", name: "Main Stage Digital Backdrop (4K UHD)", type: "Digital Banner", dimensions: "3840 x 2160 px", lastUpdated: "2026-08-24", status: "active" },
  { id: "6", name: "Exhibitor Directory Digital Banner", type: "Digital Banner", dimensions: "1920 x 1080 px", lastUpdated: "2026-08-21", status: "draft" },
];

export default function DesignLibraryPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const { data: event } = useEvent(eventId);

  const [assets] = useState<DesignAsset[]>(initialAssets);

  return (
    <OrganiserPage
      title="Design Asset Library"
      description={event ? `Centralized design templates, badges, certificate masters, and display assets for ${event.name}.` : "Design studio library."}
      actions={
        <Button size="sm" className="h-8 text-xs font-bold">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Upload Asset
        </Button>
      }
    >
      <div className="op-metric-grid">
        <MetricCard
          label="Total Design Assets"
          value={assets.length.toString()}
          hint="Production masters"
          tone="purple"
          icon={<FileImage className="h-5 w-5" />}
        />
        <MetricCard
          label="Badge Templates"
          value="2"
          hint="Print-ready layouts"
          tone="green"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <MetricCard
          label="Certificates"
          value="1"
          hint="Verified issuance template"
          tone="amber"
          icon={<Award className="h-5 w-5" />}
        />
        <MetricCard
          label="Email Layouts"
          value="1"
          hint="Studio email templates"
          tone="teal"
          icon={<Mail className="h-5 w-5" />}
        />
      </div>

      <Panel title="Master Design Assets" className="p-0">
        <DataTable
          columns={["Asset Name", "Asset Type", "Dimensions / Specs", "Last Modified", "Status"]}
          rows={assets.map((asset) => [
            <span key="name" className="font-bold text-[var(--text-primary)]">{asset.name}</span>,
            <span key="type" className="text-xs text-[var(--text-secondary)]">{asset.type}</span>,
            <span key="dim" className="font-mono text-xs">{asset.dimensions}</span>,
            <span key="date" className="font-mono text-xs">{asset.lastUpdated}</span>,
            <StatusBadge key="st" status={asset.status === "active" ? "approved" : "pending"} />,
          ])}
        />
      </Panel>
    </OrganiserPage>
  );
}
