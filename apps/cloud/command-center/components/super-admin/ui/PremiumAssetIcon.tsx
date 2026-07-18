import type { LucideIcon } from "lucide-react";
import {
  Archive, BadgeCheck, Boxes, Building2, Code2, Database, FileImage, FileText,
  FileVideo, HardDrive, KeyRound, Network, PackageCheck, Presentation, ReceiptIndianRupee,
  ScrollText, ShieldCheck, Sheet, TicketCheck, UserRoundCog, UsersRound, Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PremiumAssetKey =
  | "pdf" | "spreadsheet" | "presentation" | "document" | "image" | "video"
  | "archive" | "code" | "report" | "invoice" | "proposal" | "certificate"
  | "organization" | "subscription" | "integration" | "api" | "deployment"
  | "database" | "storage" | "security" | "ticket" | "workflow" | "venue"
  | "hardware" | "staff";

export type PremiumAssetTone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

const ICONS: Record<PremiumAssetKey, LucideIcon> = {
  pdf: FileText, spreadsheet: Sheet, presentation: Presentation, document: FileText,
  image: FileImage, video: FileVideo, archive: Archive, code: Code2, report: ScrollText,
  invoice: ReceiptIndianRupee, proposal: FileText, certificate: BadgeCheck,
  organization: Building2, subscription: PackageCheck, integration: Network, api: Code2,
  deployment: Boxes, database: Database, storage: HardDrive, security: ShieldCheck,
  ticket: TicketCheck, workflow: Workflow, venue: Building2, hardware: Boxes, staff: UsersRound,
};

const BADGES: Partial<Record<PremiumAssetKey, LucideIcon>> = {
  security: KeyRound, staff: UserRoundCog, deployment: PackageCheck, certificate: BadgeCheck,
};

interface PremiumAssetIconProps {
  assetKey: PremiumAssetKey;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: PremiumAssetTone;
  badge?: React.ReactNode | false;
  label?: string;
  className?: string;
}

const sizes = { sm: "size-9", md: "size-12", lg: "size-16", xl: "size-24" };
const iconSizes = { sm: "size-4", md: "size-5", lg: "size-7", xl: "size-10" };
const tones: Record<PremiumAssetTone, string> = {
  neutral: "--asset-accent:var(--text-secondary)", blue: "--asset-accent:var(--status-info)",
  green: "--asset-accent:var(--status-success)", amber: "--asset-accent:var(--status-warning)",
  red: "--asset-accent:var(--status-danger)", violet: "--asset-accent:#8b72d6",
};

export function PremiumAssetIcon({ assetKey, size = "md", tone = "neutral", badge, label, className }: PremiumAssetIconProps) {
  const Icon = ICONS[assetKey];
  const BadgeIcon = BADGES[assetKey];
  return (
    <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ [tones[tone].split(":")[0]]: tones[tone].split(":")[1] } as React.CSSProperties} className={cn("relative isolate grid shrink-0 place-items-center rounded-[28%] border border-white/70 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--bg-surface)_92%,white),color-mix(in_srgb,var(--bg-surface-3)_92%,black))] text-[var(--text-secondary)] shadow-[0_10px_22px_rgb(var(--shadow-color)/.13),inset_1px_1px_0_rgba(255,255,255,.75)] dark:border-white/10 dark:shadow-[0_12px_28px_rgba(0,0,0,.3),inset_1px_1px_0_rgba(255,255,255,.08)]", sizes[size], className)}>
      <span className="absolute inset-[18%] -z-10 rounded-[24%] bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,.9),transparent_55%)] opacity-70 dark:opacity-10" />
      <Icon className={cn("drop-shadow-[0_1px_0_rgba(255,255,255,.75)]", iconSizes[size])} strokeWidth={1.65} />
      {badge !== false && <span className="absolute -bottom-[5%] -right-[5%] grid size-[28%] min-h-3 min-w-3 place-items-center rounded-full border-2 border-[var(--bg-surface)] bg-[var(--asset-accent)] text-white shadow-sm">{badge ?? (BadgeIcon ? <BadgeIcon className="size-[55%]" strokeWidth={2.25} /> : null)}</span>}
    </span>
  );
}
