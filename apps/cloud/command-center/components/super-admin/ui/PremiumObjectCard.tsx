import type { ReactNode } from "react";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PremiumAssetIcon, type PremiumAssetKey, type PremiumAssetTone } from "./PremiumAssetIcon";

interface PremiumObjectCardProps {
  kind?: "file" | "entity";
  assetKey: PremiumAssetKey;
  tone?: PremiumAssetTone;
  title: string;
  description?: string;
  status?: ReactNode;
  metadata?: ReactNode;
  footer?: ReactNode;
  onOpen?: () => void;
  className?: string;
}

export function PremiumObjectCard({ kind = "entity", assetKey, tone, title, description, status, metadata, footer, onOpen, className }: PremiumObjectCardProps) {
  return (
    <Card variant="interactive" className={cn("group overflow-hidden", className)}>
      <div className="relative grid min-h-36 place-items-center overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
        <div className="absolute inset-3 rounded-xl border border-[var(--border-subtle)]" />
        <PremiumAssetIcon assetKey={assetKey} tone={tone} size="xl" label={`${title} ${kind}`} />
        {status && <div className="absolute right-3 top-3">{status}</div>}
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h3>{description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>}</div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-2 size-8" aria-label={`More actions for ${title}`}><MoreHorizontal className="size-4" /></Button>
        </div>
        {metadata && <div className="mt-3 text-[11px] text-[var(--text-tertiary)]">{metadata}</div>}
        <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">{footer ?? <span className="text-[11px] text-[var(--text-tertiary)]">Updated recently</span>}{onOpen && <Button variant="ghost" size="sm" onClick={onOpen} className="h-8 px-2">Open <ArrowUpRight className="ml-1 size-3.5" /></Button>}</div>
      </div>
    </Card>
  );
}

export const FileCard = PremiumObjectCard;
export const EntityCard = PremiumObjectCard;
