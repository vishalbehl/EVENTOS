/// <reference types="vite/client" />

interface Window {
  stageDesktop?: {
    prepareAndOpenPresentation(input: { url: string; fileId: string; version: number; filename: string; checksum?: string | null; mode: "normal" | "slideshow" }): Promise<{ opened: boolean; localPath?: string; checksum?: string; error?: string }>;
  };
}
