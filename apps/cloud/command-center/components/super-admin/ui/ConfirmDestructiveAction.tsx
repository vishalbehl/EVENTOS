"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConfirmDestructiveActionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  requireReason?: boolean;
  pending?: boolean;
  resourceName?: string;
}

export function ConfirmDestructiveAction({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  requireReason = false,
  pending = false,
  resourceName,
}: ConfirmDestructiveActionProps) {
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const valid = !requireReason || reason.trim().length >= 8;

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="border-[var(--status-danger)]/25 bg-[var(--bg-surface)] sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 grid size-10 place-items-center rounded-xl bg-[var(--status-danger-muted)] text-[var(--status-danger)]">
            <AlertTriangle aria-hidden className="size-5" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-6">
            {description}{resourceName ? ` Affected resource: ${resourceName}.` : ""}
          </DialogDescription>
        </DialogHeader>

        {requireReason && (
          <div className="space-y-2 py-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this action is required"
              aria-describedby={`${reasonId}-help`}
              disabled={pending}
            />
            <p id={`${reasonId}-help`} className="text-xs text-[var(--text-tertiary)]">
              Enter at least 8 characters. The reason will be recorded in the audit history.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Keep resource
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!valid || pending}
            onClick={() => void onConfirm(reason.trim() || undefined)}
          >
            {pending ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
