// Formatting Helper for IST Timezone
export function formatIST(dateStr: string | null): string {
  if (!dateStr) return "N/A"
  try {
    const d = new Date(dateStr)
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  } catch {
    return dateStr
  }
}

// Relative timestamp helper
export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "recently"
  try {
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000)
    let interval = seconds / 31536000
    if (interval > 1) return Math.floor(interval) + " years ago"
    interval = seconds / 2592000
    if (interval > 1) return Math.floor(interval) + " months ago"
    interval = seconds / 86400
    if (interval > 1) return Math.floor(interval) + " days ago"
    interval = seconds / 3600
    if (interval > 1) return Math.floor(interval) + " hours ago"
    interval = seconds / 60
    if (interval > 1) return Math.floor(interval) + " mins ago"
    return "just now"
  } catch {
    return "recently"
  }
}

// Indian Rupee formatting with Lakh (L) shorthand for values above 1,00,000
export function formatLakhRupee(val: number): string {
  if (val >= 100000) {
    const lakhs = val / 100000
    return `₹${lakhs.toFixed(2)} L`
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(val)
}
