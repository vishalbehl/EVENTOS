import React from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import { useParams } from 'next/navigation';

/**
 * Conference Platform — Permission Gate
 * components/auth/PermissionGate.tsx
 * 
 * Renders children only if the user has the required permission.
 * Automatically detects eventId from URL if not provided.
 */

interface PermissionGateProps {
  permission: PermissionCode;
  eventId?: string;
  children: React.ReactNode;
  /**
   * If true, renders children but with a 'disabled' state (e.g. grayed out, pointer-events-none)
   * instead of hiding them completely.
   */
  showDisabled?: boolean;
  /**
   * Fallback component to render if permission is denied and showDisabled is false.
   */
  fallback?: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  eventId: propEventId,
  children,
  showDisabled = false,
  fallback = null
}) => {
  const params = useParams();
  const eventId = propEventId || (params?.eventId as string);
  
  const { checkPermission, isLoading } = usePermissions(eventId);

  if (isLoading) {
    // Optionally return a skeleton or nothing while loading permissions
    return null;
  }

  const isAllowed = checkPermission(permission);

  if (isAllowed) {
    return <>{children}</>;
  }

  if (showDisabled) {
    return (
      <div className="opacity-50 pointer-events-none grayscale cursor-not-allowed select-none" title="You do not have permission for this action">
        {children}
      </div>
    );
  }

  return <>{fallback}</>;
};
