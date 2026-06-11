/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionPermissions, useAllLiveSessions } from '@/sync/sync-context';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import type { NotificationPayload } from '@/lib/api/types';

const PERMISSION_NOTIFY_DEBOUNCE_MS = 2000;

const isAppFocused = (): boolean => {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible' && document.hasFocus();
};

function SessionPermissionWatcher({ sessionId, sessionTitle }: { sessionId: string; sessionTitle?: string }): null {
  const permissions = useSessionPermissions(sessionId);
  const notifyOnPermission = useUIStore((s) => s.notifyOnPermission);
  const nativeNotificationsEnabled = useUIStore((s) => s.nativeNotificationsEnabled);
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId);

  const hasPermissions = permissions.length > 0;
  const enabled = notifyOnPermission && nativeNotificationsEnabled;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const previouslyNotifiedRef = React.useRef(false);

  React.useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!hasPermissions) {
      previouslyNotifiedRef.current = false;
      return;
    }

    if (previouslyNotifiedRef.current) return;
    if (!enabled) return;

    const appFocused = isAppFocused();
    const isViewingThisSession = currentSessionId === sessionId;
    if (appFocused && isViewingThisSession) return;

    timerRef.current = setTimeout(() => {
      previouslyNotifiedRef.current = true;
      const payload: NotificationPayload = {
        title: 'Approval needed',
        body: sessionTitle
          ? `${sessionTitle} is waiting for your approval`
          : 'A session is waiting for your approval',
        tag: `permission:${sessionId}`,
      };
      const apis = getRegisteredRuntimeAPIs();
      void apis?.notifications?.notifyAgentCompletion(payload);
    }, PERMISSION_NOTIFY_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sessionId, sessionTitle, hasPermissions, enabled, currentSessionId]);

  return null;
}

export function usePermissionNotifications(): React.ReactNode {
  const sessions = useAllLiveSessions();
  const sessionEntries = React.useMemo(
    () => sessions.map((s) => ({ id: s.id, title: s.title })),
    [sessions],
  );

  if (sessionEntries.length === 0) return null;

  return (
    <>
      {sessionEntries.map((session) => (
        <SessionPermissionWatcher
          key={session.id}
          sessionId={session.id}
          sessionTitle={session.title}
        />
      ))}
    </>
  );
}
