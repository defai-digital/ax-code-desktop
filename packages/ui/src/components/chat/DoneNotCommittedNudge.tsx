import React from 'react';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useGitStore, useIsGitRepo } from '@/stores/useGitStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionStatus, useSessionPermissions } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { Icon } from "@/components/icon/Icon";
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const dismissalStore = {
  dismissed: new Map<string, string>(),
  isDismissed(sessionId: string, turnId: string): boolean {
    return this.dismissed.get(sessionId) === turnId;
  },
  dismiss(sessionId: string, turnId: string): void {
    this.dismissed.set(sessionId, turnId);
  },
  reset(sessionId: string): void {
    this.dismissed.delete(sessionId);
  },
};

export const DoneNotCommittedNudge: React.FC = React.memo(() => {
  const { t } = useI18n();
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory);
  const sessionStatus = useGlobalSessionStatus(currentSessionId ?? '');
  const permissions = useSessionPermissions(currentSessionId ?? '');
  const isGitRepo = useIsGitRepo(currentDirectory);
  const gitStatus = useGitStore((s) =>
    currentDirectory ? s.directories.get(currentDirectory)?.status ?? null : null,
  );
  const setActiveMainTab = useUIStore((s) => s.setActiveMainTab);

  const prevWasRunningRef = React.useRef(false);
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  const isIdle = sessionStatus?.type === 'idle' && permissions.length === 0;
  const wasRunning = prevWasRunningRef.current;
  const isDirty = isGitRepo === true && gitStatus !== null && !gitStatus.isClean;
  const fileCount = gitStatus?.files?.length ?? 0;

  const turnId = React.useMemo(() => {
    if (!currentSessionId) return '';
    return `${currentSessionId}:${sessionStatus?.type ?? 'unknown'}`;
  }, [currentSessionId, sessionStatus?.type]);

  React.useEffect(() => {
    const isRunning = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
    if (isRunning) {
      prevWasRunningRef.current = true;
    } else if (isIdle && wasRunning) {
      prevWasRunningRef.current = false;
      if (isDirty && currentSessionId) {
        dismissalStore.reset(currentSessionId);
        forceUpdate();
      }
    }
  }, [sessionStatus?.type, isIdle, wasRunning, isDirty, currentSessionId]);

  if (!currentSessionId || !isIdle || !isDirty || fileCount === 0) return null;
  if (dismissalStore.isDismissed(currentSessionId, turnId)) return null;

  const handleReview = () => {
    setActiveMainTab('diff');
  };

  const handleCommit = () => {
    setActiveMainTab('git');
  };

  const handleDismiss = () => {
    if (currentSessionId) {
      dismissalStore.dismiss(currentSessionId, turnId);
      forceUpdate();
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 px-3 py-1.5',
      )}
    >
      <Icon name="error-warning" className="h-3.5 w-3.5 flex-shrink-0 text-[var(--status-warning)]" />
      <span className="min-w-0 flex-1 text-xs text-foreground">
        {t('chat.doneNotCommitted.message', { count: fileCount })}
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReview}>
        {t('chat.doneNotCommitted.review')}
      </Button>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleCommit}>
        {t('chat.doneNotCommitted.commit')}
      </Button>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={t('chat.doneNotCommitted.dismiss')}
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

DoneNotCommittedNudge.displayName = 'DoneNotCommittedNudge';
