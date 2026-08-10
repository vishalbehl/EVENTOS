import type { VenueDesktopApi } from "../electron/preload";

declare global {
  interface Window {
    venueDesktop?: VenueDesktopApi;
  }
}

export {};
