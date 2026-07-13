export function SkipNavigation() {
  return (
    <a
      href="#command-center-main"
      className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-[var(--radius-control)] bg-[var(--status-info)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
    >
      Skip to main content
    </a>
  );
}
