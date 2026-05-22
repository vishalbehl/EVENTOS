/**
 * Conference Platform — Permission Definitions
 * cloud/organizer-portal/lib/permissions.ts
 * 
 * This map MUST match the backend permission codes.
 * Use these constants in <PermissionGate> and usePermission() hook.
 */

export const PERMISSIONS = {
  // Event Management
  EVENTS_VIEW: 'EVENTS:VIEW',
  EVENTS_CREATE: 'EVENTS:CREATE',
  EVENTS_EDIT: 'EVENTS:EDIT',
  EVENTS_DELETE: 'EVENTS:DELETE',
  EVENTS_PUBLISH: 'EVENTS:PUBLISH',

  // Session & Speaker Management
  SESSIONS_VIEW: 'SESSIONS:VIEW',
  SESSIONS_MANAGE: 'SESSIONS:MANAGE',
  SPEAKERS_VIEW: 'SPEAKERS:VIEW',
  SPEAKERS_MANAGE: 'SPEAKERS:MANAGE',

  // File Review & Quality Control
  FILES_VIEW: 'FILES:VIEW',
  FILES_APPROVE: 'FILES:APPROVE',
  FILES_REJECT: 'FILES:REJECT',
  FILES_DOWNLOAD: 'FILES:DOWNLOAD',

  // ePosters
  POSTERS_VIEW: 'POSTERS:VIEW',
  POSTERS_MANAGE: 'POSTERS:MANAGE',

  // Analytics & Reports
  ANALYTICS_VIEW: 'ANALYTICS:VIEW',
  REPORTS_EXPORT: 'REPORTS_EXPORT',

  // System & RBAC
  USERS_VIEW: 'USERS:VIEW',
  USERS_MANAGE: 'USERS:MANAGE',
  ROLES_MANAGE: 'ROLES:MANAGE',
  SETTINGS_EDIT: 'SETTINGS:EDIT',

  // On-site Operations
  ROOMS_MANAGE: 'ROOMS:MANAGE',
  DEVICES_MANAGE: 'DEVICES:MANAGE',
  ONSITE_SUPPORT: 'ONSITE:SUPPORT',
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Checks if a specific code exists in a list of granted permissions.
 * Handles wildcards if implemented in the future (e.g. 'EVENTS:*').
 */
export const hasPermission = (granted: string[], required: string): boolean => {
  if (!granted || !required) return false;
  
  // Super admin wildcard check
  if (granted.includes('*')) return true;
  
  return granted.includes(required);
};
