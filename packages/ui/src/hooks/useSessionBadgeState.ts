import React from 'react';
import type { SessionStatus } from '@ax-code/sdk/v2/client';
import type { PermissionRequest } from '@/types/permission';
import { useSessionHasError } from '@/sync/notification-store';

export type SessionBadgeState =
  | 'idle'
  | 'running'
  | 'waiting_for_permission'
  | 'done_with_uncommitted'
  | 'error';

export function computeSessionBadgeState(args: {
  status: SessionStatus | undefined;
  permissions: readonly PermissionRequest[];
  isDirty: boolean;
  hasError: boolean;
  hasUnreadAttention: boolean;
}): SessionBadgeState {
  const { status, permissions, isDirty, hasError, hasUnreadAttention } = args;

  if (permissions.length > 0) return 'waiting_for_permission';

  const type = status?.type ?? 'idle';
  if (type === 'busy' || type === 'retry') return 'running';

  if (hasError) return 'error';

  if (type === 'idle' && isDirty) return 'done_with_uncommitted';

  if (hasUnreadAttention) return 'idle';

  return 'idle';
}

export function useSessionBadgeState(
  sessionId: string | null | undefined,
  options: {
    status: SessionStatus | undefined;
    permissions: readonly PermissionRequest[];
    isDirty: boolean;
    hasUnreadAttention: boolean;
  },
): SessionBadgeState {
  const hasError = useSessionHasError(sessionId ?? '');

  return React.useMemo(
    () =>
      computeSessionBadgeState({
        status: options.status,
        permissions: options.permissions,
        isDirty: options.isDirty,
        hasError,
        hasUnreadAttention: options.hasUnreadAttention,
      }),
    [options.status, options.permissions, options.isDirty, hasError, options.hasUnreadAttention],
  );
}
