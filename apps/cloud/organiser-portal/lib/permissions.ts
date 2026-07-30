/**
 * Conference Platform — Permission Definitions
 * cloud/command-center/lib/permissions.ts
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
  SESSIONS_MANAGE: 'SESSIONS:EDIT',
  SPEAKERS_VIEW: 'SPEAKERS:VIEW',
  SPEAKERS_MANAGE: 'SPEAKERS:EDIT',

  // File Review & Quality Control
  FILES_VIEW: 'FILES:VIEW',
  FILES_APPROVE: 'FILES:APPROVE',
  FILES_REJECT: 'FILES:REJECT',
  FILES_DOWNLOAD: 'FILES:DOWNLOAD',

  // ePosters
  POSTERS_VIEW: 'POSTERS:VIEW',
  POSTERS_MANAGE: 'POSTERS:EDIT',

  // Analytics & Reports
  ANALYTICS_VIEW: 'ANALYTICS:VIEW',
  REPORTS_EXPORT: 'REPORTS_EXPORT',

  // System & RBAC
  USERS_VIEW: 'USERS:VIEW',
  USERS_MANAGE: 'USERS:EDIT',
  ROLES_MANAGE: 'ROLES:EDIT',
  SETTINGS_EDIT: 'SETTINGS:EDIT',

  // On-site Operations
  ROOMS_MANAGE: 'ROOMS:EDIT',
  DEVICES_MANAGE: 'DEVICES:EDIT',
  ONSITE_SUPPORT: 'ONSITE:SUPPORT',

  // Operations & Tech Services (Phase 7)
  OPERATIONS_REQUESTS_MANAGE: 'OPERATIONS.REQUESTS:MANAGE',
  OPERATIONS_PROJECTS_MANAGE: 'OPERATIONS.PROJECTS:MANAGE',
  OPERATIONS_RESOURCES_MANAGE: 'OPERATIONS.RESOURCES:MANAGE',
  OPERATIONS_DEPLOYMENTS_MANAGE: 'OPERATIONS.DEPLOYMENTS:MANAGE',

  // Organizer Technology Services
  TECHNOLOGY_REQUEST_CREATE: 'technology.request:create',
  TECHNOLOGY_REQUEST_VIEW: 'technology.request:view',
  TECHNOLOGY_REQUEST_EDIT: 'technology.request:edit',
  TECHNOLOGY_REQUEST_CANCEL: 'technology.request:cancel',
  TECHNOLOGY_QUOTE_VIEW: 'technology.quote:view',
  TECHNOLOGY_STATUS_VIEW: 'technology.status:view',

  // Internal ERP Operations
  OPERATIONS_MANAGE: 'operations:manage',
  PROJECTS_MANAGE: 'projects:manage',
  RESOURCES_MANAGE: 'resources:manage',
  DEPLOYMENTS_MANAGE: 'deployments:manage',
  RISKS_MANAGE: 'risks:manage',
  READINESS_MANAGE: 'readiness:manage',
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
