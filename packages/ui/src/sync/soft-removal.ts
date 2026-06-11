import { toast } from '@/components/ui';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import * as sessionActions from '@/sync/session-actions';
import type { Session } from '@ax-code/sdk/v2';

const UNDO_DURATION_MS = 7000;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelTimer(id: string): void {
  const timer = pendingTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(id);
  }
}

export function softArchiveSession(session: Session): void {
  const id = session.id;
  const title = session.title || 'Session';

  useGlobalSessionsStore.getState().markPendingRemoval([id]);

  const ui = useSessionUIStore.getState();
  if (ui.currentSessionId === id) {
    ui.setCurrentSession(null);
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(id);
    useGlobalSessionsStore.getState().clearPendingRemoval([id]);
    void sessionActions.archiveSession(id);
  }, UNDO_DURATION_MS);

  pendingTimers.set(id, timer);

  toast.success(`Archived "${title}"`, {
    duration: UNDO_DURATION_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        cancelTimer(id);
        useGlobalSessionsStore.getState().clearPendingRemoval([id]);
        useGlobalSessionsStore.getState().upsertSession(session);
      },
    },
  });
}

export function softDeleteSession(session: Session): void {
  const id = session.id;
  const title = session.title || 'Session';

  useGlobalSessionsStore.getState().markPendingRemoval([id]);

  const ui = useSessionUIStore.getState();
  if (ui.currentSessionId === id) {
    ui.setCurrentSession(null);
  }

  const timer = setTimeout(() => {
    pendingTimers.delete(id);
    useGlobalSessionsStore.getState().clearPendingRemoval([id]);
    void sessionActions.deleteSession(id);
  }, UNDO_DURATION_MS);

  pendingTimers.set(id, timer);

  toast.success(`Deleted "${title}"`, {
    duration: UNDO_DURATION_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        cancelTimer(id);
        useGlobalSessionsStore.getState().clearPendingRemoval([id]);
        useGlobalSessionsStore.getState().upsertSession(session);
      },
    },
  });
}

export function softBulkArchive(sessions: Session[]): void {
  const ids = sessions.map((s) => s.id);
  const count = ids.length;

  useGlobalSessionsStore.getState().markPendingRemoval(ids);

  const ui = useSessionUIStore.getState();
  if (ui.currentSessionId && ids.includes(ui.currentSessionId)) {
    ui.setCurrentSession(null);
  }

  const timer = setTimeout(() => {
    for (const id of ids) pendingTimers.delete(id);
    useGlobalSessionsStore.getState().clearPendingRemoval(ids);
    for (const id of ids) {
      void sessionActions.archiveSession(id);
    }
  }, UNDO_DURATION_MS);

  for (const id of ids) pendingTimers.set(id, timer);

  toast.success(`Archived ${count} session${count === 1 ? '' : 's'}`, {
    duration: UNDO_DURATION_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        for (const id of ids) cancelTimer(id);
        useGlobalSessionsStore.getState().clearPendingRemoval(ids);
        for (const session of sessions) {
          useGlobalSessionsStore.getState().upsertSession(session);
        }
      },
    },
  });
}

export function softBulkDelete(sessions: Session[]): void {
  const ids = sessions.map((s) => s.id);
  const count = ids.length;

  useGlobalSessionsStore.getState().markPendingRemoval(ids);

  const ui = useSessionUIStore.getState();
  if (ui.currentSessionId && ids.includes(ui.currentSessionId)) {
    ui.setCurrentSession(null);
  }

  const timer = setTimeout(() => {
    for (const id of ids) pendingTimers.delete(id);
    useGlobalSessionsStore.getState().clearPendingRemoval(ids);
    for (const id of ids) {
      void sessionActions.deleteSession(id);
    }
  }, UNDO_DURATION_MS);

  for (const id of ids) pendingTimers.set(id, timer);

  toast.success(`Deleted ${count} session${count === 1 ? '' : 's'}`, {
    duration: UNDO_DURATION_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        for (const id of ids) cancelTimer(id);
        useGlobalSessionsStore.getState().clearPendingRemoval(ids);
        for (const session of sessions) {
          useGlobalSessionsStore.getState().upsertSession(session);
        }
      },
    },
  });
}

export function flushPendingRemovals(): void {
  const ids = useGlobalSessionsStore.getState().consumePendingRemoval();
  for (const id of ids) {
    cancelTimer(id);
    void sessionActions.archiveSession(id);
  }
}

export function isPendingRemoval(sessionId: string): boolean {
  return useGlobalSessionsStore.getState().pendingRemoval.has(sessionId);
}
