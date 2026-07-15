import { AlertCircle } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export function FormField({ label, children, description, error, required, className }: FormFieldProps) {
  const generatedId = useId();
  const controlId = children.props.id || `field-${generatedId}`;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  if (!isValidElement(children)) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={controlId} className="block text-xs font-semibold text-[var(--text-primary)]">
        {label}{required ? <span aria-hidden className="ml-1 text-[var(--status-danger)]">*</span> : null}
        {required ? <span className="sr-only"> required</span> : null}
      </label>
      {cloneElement(children, { id: controlId, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {description ? <p id={descriptionId} className="text-[11px] leading-5 text-[var(--text-secondary)]">{description}</p> : null}
      {error ? <p id={errorId} role="alert" className="flex items-start gap-1.5 text-[11px] leading-5 text-[var(--status-danger)]"><AlertCircle aria-hidden className="mt-1 size-3 shrink-0" />{error}</p> : null}
    </div>
  );
}

interface ServerErrorSummaryProps {
  error: unknown;
  title?: string;
  className?: string;
  action?: ReactNode;
}

export function ServerErrorSummary({ error, title = "The operation could not be completed", className, action }: ServerErrorSummaryProps) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <section role="alert" className={cn("rounded-xl border border-[var(--status-danger)]/35 bg-[var(--status-danger-muted)] p-4", className)}>
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--status-danger)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{message}</p>
          {apiError?.requestId ? <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">Request {apiError.requestId}</p> : null}
        </div>
        {action}
      </div>
    </section>
  );
}
