import { cn } from "@/lib/utils";

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}

export function PageWrapper({ children, className, labelledBy }: PageWrapperProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("w-full min-w-0 px-[var(--space-page-x)] py-[var(--space-page-y)]", className)}
    >
      {children}
    </section>
  );
}
