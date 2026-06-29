import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md", className)}
      style={{
        background: "linear-gradient(90deg, var(--color-surface-3) 0%, var(--color-surface-4) 50%, var(--color-surface-3) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.8s linear infinite",
      }}
      {...props}
    />
  )
}

export { Skeleton }
