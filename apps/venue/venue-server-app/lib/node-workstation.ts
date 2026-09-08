export type VenueNodeConfiguration = {
  venue_server: string;
  assignment_id: string;
  enrollment_token: string;
};

export type VenueNodeMode = "registration" | "scanning" | "self_checkin";

export type VenueNodeAssignment = {
  id: string;
  mode: VenueNodeMode;
  station_id?: string | null;
  capacity_rule_id?: string | null;
  event_id?: string | null;
  offline?: boolean;
  permissions: Record<string, unknown>;
};

const STORAGE_KEY = "venue-node-configuration";
export const VENUE_SCANNING_STATION_STORAGE_KEY = "venue-scanning-selected-station-id";

export function readSavedScanningStationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VENUE_SCANNING_STATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveScanningStationId(stationId: string): void {
  if (typeof window === "undefined") return;
  try {
    if (stationId) {
      window.localStorage.setItem(VENUE_SCANNING_STATION_STORAGE_KEY, stationId);
    } else {
      window.localStorage.removeItem(VENUE_SCANNING_STATION_STORAGE_KEY);
    }
  } catch {}
}

export function clearSavedScanningStationId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(VENUE_SCANNING_STATION_STORAGE_KEY);
  } catch {}
}

export function readVenueNodeConfiguration(): VenueNodeConfiguration | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as VenueNodeConfiguration : null;
  } catch {
    return null;
  }
}

export function allowedModesForAssignment(assignment: VenueNodeAssignment | null | undefined): VenueNodeMode[] {
  if (!assignment) return [];
  const raw = (assignment.permissions as any)?.allowed_modes;
  const modes = Array.isArray(raw)
    ? raw.filter((mode): mode is VenueNodeMode => ["registration", "scanning", "self_checkin"].includes(String(mode)))
    : [];
  return Array.from(new Set([assignment.mode, ...modes]));
}

export function assignmentAllowsMode(assignment: VenueNodeAssignment | null | undefined, mode: VenueNodeMode): boolean {
  return allowedModesForAssignment(assignment).includes(mode);
}

export function saveVenueNodeConfiguration(value: VenueNodeConfiguration): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearVenueNodeConfiguration(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function fetchVenueNodeBootstrap(): Promise<{ assignment: VenueNodeAssignment } | null> {
  const config = readVenueNodeConfiguration();
  if (!config) return null;
  let shouldClearStaleConfiguration = false;
  try {
    const baseUrl = config.venue_server.replace(/\/$/, "");
    const tokenResponse = await fetch(`${baseUrl}/api/v1/venue/nodes/${config.assignment_id}/token`, {
      method: "POST",
      headers: { "X-Venue-Node-Token": config.enrollment_token },
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("This workstation enrollment is unavailable or has been revoked.");
    const tokenPayload = await tokenResponse.json() as { access_token?: string };
    if (!tokenPayload.access_token) throw new Error("Venue Server returned no node access token.");
    const response = await fetch(`${config.venue_server.replace(/\/$/, "")}/api/v1/venue/nodes/${config.assignment_id}/bootstrap`, {
      headers: { "X-Venue-Node-Token": tokenPayload.access_token },
      cache: "no-store",
    });
    if (!response.ok) {
      shouldClearStaleConfiguration = response.status === 401 || response.status === 403 || response.status === 404;
      throw new Error("This workstation assignment is unavailable or has been revoked.");
    }
    return response.json();
  } catch (error) {
    try {
      const localResponse = await fetch("http://127.0.0.1:8000/health", { cache: "no-store" });
      if (!localResponse.ok) throw error;
    const local = await localResponse.json();
    const assignment = local?.assignment;
    if (!assignment?.assignment_id) throw error;
      let allowedModes: VenueNodeMode[] = [];
      try {
        const parsed = assignment.allowed_modes ? JSON.parse(assignment.allowed_modes) : [];
        allowedModes = Array.isArray(parsed)
          ? parsed.filter((mode): mode is VenueNodeMode => ["registration", "scanning", "self_checkin"].includes(String(mode)))
          : [];
      } catch {
        allowedModes = [];
      }
      return {
        assignment: {
          id: assignment.assignment_id,
          event_id: assignment.event_id || null,
          mode: assignment.mode,
          station_id: assignment.station_id || null,
          capacity_rule_id: assignment.capacity_rule_id || null,
          permissions: { allowed_modes: allowedModes.length ? allowedModes : [assignment.mode] },
          offline: true,
        },
      };
    } catch {
      if (shouldClearStaleConfiguration) {
        clearVenueNodeConfiguration();
      }
      return null;
    }
  }
}
