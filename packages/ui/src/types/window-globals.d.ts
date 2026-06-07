import type { RuntimeAPIs } from '@/lib/api/types';
import type { DesktopBootOutcome } from '@/lib/desktopBoot';
import type { useAgentsStore } from '@/stores/useAgentsStore';
import type { useCommandsStore } from '@/stores/useCommandsStore';
import type { useConfigStore } from '@/stores/useConfigStore';
import type { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import type { useSkillsStore } from '@/stores/useSkillsStore';
import type { StreamPerfState } from '@/stores/utils/streamDebug';

type DesktopServerRuntime = {
  origin: string;
  axCodePort: number | null;
  apiPrefix: string;
  cliAvailable: boolean;
};

type AxCodeDebugTools = {
  getLastAssistantMessage: () => unknown;
  getAllMessages: (truncate?: boolean) => unknown[];
  truncateMessages: (messages: unknown[]) => unknown[];
  getAppStatus: () => Promise<unknown>;
  checkLastMessage: () => boolean;
  findEmptyMessages: () => unknown[];
  showRetryHelp: () => void;
  getStreamingState: () => unknown;
  analyzeMessageCompletionConsistency: (options?: unknown) => unknown;
  checkCompletionStatus: () => unknown;
};

declare global {
  interface Window {
    __axCodeDebug?: AxCodeDebugTools;
    __OPENCHAMBER_DESKTOP_BOOT_OUTCOME__?: DesktopBootOutcome;
    __OPENCHAMBER_DESKTOP_SERVER__?: DesktopServerRuntime;
    __OPENCHAMBER_ELECTRON__?: { runtime?: string };
    __OPENCHAMBER_HOME__?: string;
    __OPENCHAMBER_LOCAL_ORIGIN__?: string;
    __OPENCHAMBER_MACOS_MAJOR__?: number;
    __OPENCHAMBER_PANEL_TYPE__?: 'chat' | 'agentManager';
    __OPENCHAMBER_PLATFORM__?: string;
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
    __openchamberStreamPerfState?: StreamPerfState;
    __zustand_agents_store__?: typeof useAgentsStore;
    __zustand_commands_store__?: typeof useCommandsStore;
    __zustand_config_store__?: typeof useConfigStore;
    __zustand_git_identities_store__?: typeof useGitIdentitiesStore;
    __zustand_skills_store__?: typeof useSkillsStore;
  }
}

export {};
