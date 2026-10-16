import { registerFsRoutes } from "../fs/routes.js"
import { createCoreFileAdapter } from "../fs/core-file-adapter.js"
import { registerQuotaRoutes } from "../quota/routes.js"
import { registerGitHubRoutes } from "../github/routes.js"
import { registerGitRoutes } from "../git/routes.js"
import { disposeRuntimeInstance } from "../git/dispose-runtime-instance.js"
import { readRuntimeProjectStartCommand } from "../git/project-start-command.js"
import { readRuntimeAgentNames } from "./runtime-agent-list.js"
import { registerMagicPromptRoutes } from "../magic-prompts/routes.js"
import { registerSessionFoldersRoutes } from "../session-folders/routes.js"
import { registerConfigEntityRoutes } from "./config-entity-routes.js"
import { registerSettingsUtilityRoutes } from "./core-routes.js"
import { registerProjectIconRoutes } from "./project-icon-routes.js"
import { registerDiscoverExternalProjectRoutes } from "../projects/discover-external.js"
import { registerSkillRoutes } from "./skill-routes.js"
import { registerPluginRoutes } from "./plugin-routes.js"
import { getNpmInfo } from "./npm-registry.js"
import { parseNpmSpec, parsePathSpec, isExactSemver } from "./plugin-spec.js"
import { registerAxCodeRoutes } from "./routes.js"
import { createAxCodeCliInstallRuntime, registerAxCodeCliInstallRoutes } from "./cli-install.js"
import { createBackgroundAxCodeReloader } from "./background-reload.js"

export const createFeatureRoutesRuntime = (dependencies) => {
  const { clientReloadDelayMs } = dependencies

  let quotaProviders = null
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      quotaProviders = await import("../quota/index.js")
    }
    return quotaProviders
  }

  const registerRoutes = async (app, routeDependencies) => {
    const {
      crypto,
      fs,
      os,
      path,
      fsPromises,
      spawn,
      resolveGitBinaryForSpawn,
      createFsSearchRuntime,
      openchamberDataDir,
      openchamberUserConfigRoot,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      validateDirectoryPath,
      longRequestTimeoutMs,
      readCustomThemesFromDisk,
      writeCustomThemeToDisk,
      refreshAxCodeAfterConfigChange,
      getAxCodeResolutionSnapshot,
      getAxCodeBinarySource,
      getAxCodeBinary,
      formatSettingsResponse,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      sanitizeSkillCatalogs,
      isUnsafeSkillRelativePath,
      buildAxCodeUrl,
      getAxCodeAuthHeaders,
      getAxCodePort,
      buildAugmentedPath,
    } = routeDependencies

    const { getProviderSources, removeProviderConfig } = await import("./index.js")
    const coreFileAdapter = createCoreFileAdapter({
      getBaseUrl: () => {
        try {
          return String(buildAxCodeUrl("/", "") || "").replace(/\/+$/, "")
        } catch {
          return ""
        }
      },
      getHeaders: typeof getAxCodeAuthHeaders === "function" ? getAxCodeAuthHeaders : undefined,
    })
    const backgroundAxCodeReloader = createBackgroundAxCodeReloader({
      refreshAxCodeAfterConfigChange,
      clientReloadDelayMs,
    })

    registerSettingsUtilityRoutes(app, {
      readCustomThemesFromDisk,
      writeCustomThemeToDisk,
      refreshAxCodeAfterConfigChange,
      clientReloadDelayMs,
      backgroundAxCodeReloader,
    })

    registerAxCodeRoutes(app, {
      crypto,
      clientReloadDelayMs,
      longRequestTimeoutMs,
      getAxCodeResolutionSnapshot,
      getAxCodeBinarySource,
      formatSettingsResponse,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      validateDirectoryPath,
      resolveProjectDirectory,
      getProviderSources,
      removeProviderConfig,
      refreshAxCodeAfterConfigChange,
      backgroundAxCodeReloader,
      buildAxCodeUrl,
      getAxCodeAuthHeaders,
    })

    registerAxCodeCliInstallRoutes(app, {
      runtime: createAxCodeCliInstallRuntime({
        buildAugmentedPath,
        // The resolution snapshot is what the runtime actually launches; the
        // cached resolver state can still be empty right after startup.
        getRuntimeBinary: async () => {
          try {
            const snapshot = await getAxCodeResolutionSnapshot(await readSettingsFromDiskMigrated())
            return { path: snapshot?.viaWsl ? null : snapshot?.resolved || null, source: snapshot?.source || null }
          } catch {
            return { path: typeof getAxCodeBinary === "function" ? getAxCodeBinary() : null, source: null }
          }
        },
        onRuntimeBinaryUpgraded: () => refreshAxCodeAfterConfigChange("ax-code CLI upgrade"),
      }),
    })

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir,
      sanitizeProjects,
      readSettingsFromDiskMigrated,
      persistSettings,
      createFsSearchRuntime: (opts) => createFsSearchRuntime({ ...opts, coreFileAdapter }),
      spawn,
      resolveGitBinaryForSpawn,
    })

    registerDiscoverExternalProjectRoutes(app, {
      os,
      fsPromises,
      path,
      readSettingsFromDiskMigrated,
      sanitizeProjects,
    })

    const {
      getAgentSources,
      getAgentConfig,
      createAgent,
      updateAgent,
      deleteAgent,
      disableBuiltinAgent,
      getCommandSources,
      createCommand,
      updateCommand,
      deleteCommand,
      listMcpConfigs,
      getMcpConfig,
      createMcpConfig,
      updateMcpConfig,
      deleteMcpConfig,
      listSnippets,
      getSnippet,
      createSnippet,
      updateSnippet,
      deleteSnippet,
      expandSnippets,
      listPluginEntries,
      getPluginEntry,
      createPluginEntry,
      updatePluginEntry,
      deletePluginEntry,
      listPluginDirFiles,
      readPluginDirFile,
      writePluginDirFile,
      deletePluginDirFile,
      encodePluginId,
      decodePluginId,
    } = await import("./index.js")

    registerConfigEntityRoutes(app, {
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      refreshAxCodeAfterConfigChange,
      clientReloadDelayMs,
      getAgentSources,
      getAgentConfig,
      createAgent,
      updateAgent,
      deleteAgent,
      disableBuiltinAgent,
      isKnownAgent: async (directory, agentName) => {
        const names = await readRuntimeAgentNames({ directory, buildAxCodeUrl, getAxCodeAuthHeaders })
        return names.has(agentName)
      },
      getCommandSources,
      createCommand,
      updateCommand,
      deleteCommand,
      listMcpConfigs,
      getMcpConfig,
      createMcpConfig,
      updateMcpConfig,
      deleteMcpConfig,
      listSnippets,
      getSnippet,
      createSnippet,
      updateSnippet,
      deleteSnippet,
      expandSnippets,
    })

    registerPluginRoutes(app, {
      resolveOptionalProjectDirectory,
      refreshAxCodeAfterConfigChange,
      clientReloadDelayMs,
      listPluginEntries,
      getPluginEntry,
      createPluginEntry,
      updatePluginEntry,
      deletePluginEntry,
      listPluginDirFiles,
      readPluginDirFile,
      writePluginDirFile,
      deletePluginDirFile,
      encodePluginId,
      decodePluginId,
      getNpmInfo,
      parseNpmSpec,
      parsePathSpec,
      isExactSemver,
    })

    const {
      getSkillSources,
      discoverSkills,
      mergeDiscoveredSkills,
      createSkill,
      updateSkill,
      deleteSkill,
      readSkillSupportingFile,
      writeSkillSupportingFile,
      deleteSkillSupportingFile,
      SKILL_SCOPE,
      SKILL_DIR,
    } = await import("./index.js")

    const {
      getCuratedSkillsSources,
      getCacheKey,
      getCachedScan,
      setCachedScan,
      parseSkillRepoSource,
      scanSkillsRepository,
      installSkillsFromRepository,
      scanClawdHubPage,
      installSkillsFromClawdHub,
      isClawdHubSource,
    } = await import("../skills-catalog/index.js")
    const { getProfiles, getProfile } = await import("../git/index.js")

    registerSkillRoutes(app, {
      fs,
      path,
      os,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      readSettingsFromDisk,
      sanitizeSkillCatalogs,
      isUnsafeSkillRelativePath,
      refreshAxCodeAfterConfigChange,
      clientReloadDelayMs,
      buildAxCodeUrl,
      getAxCodeAuthHeaders,
      getAxCodePort,
      getSkillSources,
      discoverSkills,
      mergeDiscoveredSkills,
      createSkill,
      updateSkill,
      deleteSkill,
      readSkillSupportingFile,
      writeSkillSupportingFile,
      deleteSkillSupportingFile,
      SKILL_SCOPE,
      SKILL_DIR,
      getCuratedSkillsSources,
      getCacheKey,
      getCachedScan,
      setCachedScan,
      parseSkillRepoSource,
      scanSkillsRepository,
      installSkillsFromRepository,
      scanClawdHubPage,
      installSkillsFromClawdHub,
      isClawdHubSource,
      getProfiles,
      getProfile,
    })

    registerQuotaRoutes(app, { getQuotaProviders })
    registerGitHubRoutes(app)
    registerGitRoutes(app, {
      disposeInstance: (worktreeDirectory) =>
        disposeRuntimeInstance({ directory: worktreeDirectory, buildAxCodeUrl, getAxCodeAuthHeaders }),
      readProjectStartCommand: (projectID) =>
        readRuntimeProjectStartCommand({ projectID, buildAxCodeUrl, getAxCodeAuthHeaders }),
    })
    registerMagicPromptRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir,
    })
    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir,
    })
    registerFsRoutes(app, {
      os,
      path,
      fsPromises,
      spawn,
      crypto,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      readSettingsFromDiskMigrated,
      buildAugmentedPath,
      resolveGitBinaryForSpawn,
      openchamberUserConfigRoot,
      coreFileAdapter,
    })
  }

  return {
    registerRoutes,
  }
}
