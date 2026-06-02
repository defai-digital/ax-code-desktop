import React from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

export type ProjectKnowledgeState = {
  exists: boolean;
  isLoading: boolean;
};

const cache = new Map<string, ProjectKnowledgeState>();

/**
 * Detects whether a CLAUDE.md project knowledge file exists in the given
 * workspace directory. ax-code reads this file automatically at session start;
 * this hook surfaces the result in the UI (indicator + "create" shortcut).
 */
export function useProjectKnowledge(directory: string | null | undefined): ProjectKnowledgeState {
  const { files } = useRuntimeAPIs();
  const [state, setState] = React.useState<ProjectKnowledgeState>(() => {
    if (!directory) return { exists: false, isLoading: false };
    return cache.get(directory) ?? { exists: false, isLoading: true };
  });

  React.useEffect(() => {
    if (!directory || !files.readFile) {
      setState({ exists: false, isLoading: false });
      return;
    }

    const cached = cache.get(directory);
    if (cached) {
      setState(cached);
      return;
    }

    let cancelled = false;
    setState({ exists: false, isLoading: true });

    const claudeMdPath = directory.replace(/\/$/, '') + '/CLAUDE.md';
    files.readFile(claudeMdPath)
      .then(() => {
        if (cancelled) return;
        const next = { exists: true, isLoading: false };
        cache.set(directory, next);
        setState(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next = { exists: false, isLoading: false };
        cache.set(directory, next);
        setState(next);
      });

    return () => { cancelled = true; };
  }, [directory, files]);

  return state;
}
