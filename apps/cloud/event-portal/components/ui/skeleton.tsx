import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[color-mix(in_srgb,var(--text)_8%,transparent)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
