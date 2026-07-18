"use client";

import { Command, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COMMAND_CENTER_DESTINATIONS, searchDestinations } from "@/lib/command-center-navigation";
import { CONSOLE_REGISTRY, resolveConsoleKey } from "@/lib/console-registry";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const results = searchDestinations(query).slice(0, 12);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 min-w-64 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-left text-xs text-[var(--text-secondary)] shadow-[var(--shadow-panel)] hover:border-[var(--text-tertiary)] lg:flex xl:min-w-80"
        aria-label="Open command search"
      >
        <Search aria-hidden className="size-3.5" />
        <span className="flex-1">Search for something...</span>
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 place-items-center rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] lg:hidden"
        aria-label="Open command search"
      >
        <Search aria-hidden className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(42rem,85dvh)] overflow-hidden border-[var(--border-default)] bg-[var(--bg-surface)] p-0 text-[var(--text-primary)] sm:max-w-2xl">
          <DialogTitle className="sr-only">Command Center search</DialogTitle>
          <DialogDescription className="sr-only">Search and open an administrative destination.</DialogDescription>
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4">
            <Command aria-hidden className="size-4 text-[var(--status-info)]" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) navigate(results[0].href);
              }}
              placeholder={`Search ${COMMAND_CENTER_DESTINATIONS.length} controls...`}
              aria-label="Search Command Center destinations"
              className="h-14 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="cc-scroll-region max-h-[32rem] overflow-y-auto p-2" role="listbox" aria-label="Search results">
            {results.length ? results.map((destination, index) => {
              const Icon = destination.icon;
              const owner = CONSOLE_REGISTRY[resolveConsoleKey(destination.href)];
              return (
                <button
                  key={destination.href}
                  type="button"
                  role="option"
                  aria-selected={index === 0}
                  onClick={() => navigate(destination.href)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-[var(--bg-surface-hover)] focus-visible:bg-[var(--bg-surface-hover)]"
                >
                  <span className="grid size-8 place-items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
                    <Icon aria-hidden className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{destination.label}</span>
                    <span className="block truncate text-[11px] text-[var(--text-secondary)]">{owner.name} · {destination.group}</span>
                  </span>
                  <span className="hidden font-mono text-[10px] text-[var(--text-tertiary)] sm:block">{destination.href}</span>
                </button>
              );
            }) : (
              <p className="px-4 py-12 text-center text-sm text-[var(--text-secondary)]">No control matches “{query}”.</p>
            )}
          </div>
          <div className="border-t border-[var(--border-subtle)] px-4 py-2 text-[10px] text-[var(--text-tertiary)]">
            Enter opens the first result. Escape closes search.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
