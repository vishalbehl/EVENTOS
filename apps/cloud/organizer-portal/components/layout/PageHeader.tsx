import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between space-y-2 mb-8", className)}>
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-muted">{title}</h2>
        {description && (
          <p className="text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center space-x-2">
        {children}
      </div>
    </div>
  );
}
