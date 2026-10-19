import React from "react"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { getCurrentDirectory } from "@/lib/ax-code/providerApi"
import {
  fetchAxEngineModels,
  fetchAxEngineConnection,
  fetchDesktopAxCodeRuntimeIdentity,
} from "@/lib/ax-code/axEngineModelsApi"
import { LocalModelsContext, type LocalModelsState } from "./localModelsState"

type Snapshot = Pick<LocalModelsState, "data" | "connection" | "runtimeIdentity" | "error" | "loading">
const empty: Snapshot = { data: null, connection: null, runtimeIdentity: null, error: null, loading: true }

export const LocalModelsProvider: React.FC<React.PropsWithChildren<{ enabled?: boolean }>> = ({
  children,
  enabled = true,
}) => {
  const project = useProjectsStore((state) => state.activeProjectId)
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  const scope = React.useMemo(
    () => ({ directory: getCurrentDirectory(), enabled }),
    // Both stores may change the runtime's directory; never inspect the renderer OS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, currentDirectory, enabled],
  )
  const activeScope = React.useRef<typeof scope | null>(scope)
  activeScope.current = scope
  const [snapshot, setSnapshot] = React.useState({ scope, value: empty })
  const flight = React.useRef<{ scope: typeof scope; controller: AbortController; promise: Promise<void> } | null>(null)
  const value = snapshot.scope === scope ? snapshot.value : empty

  const update = React.useCallback(
    (patch: Partial<Snapshot>) => {
      if (activeScope.current !== scope) return
      setSnapshot((previous) => ({
        scope,
        value: { ...(previous.scope === scope ? previous.value : empty), ...patch },
      }))
    },
    [scope],
  )

  const load = React.useCallback((): Promise<void> => {
    if (!enabled || activeScope.current !== scope) return Promise.resolve()
    if (flight.current?.scope === scope) return flight.current.promise
    flight.current?.controller.abort()
    const controller = new AbortController()
    update({ loading: true })
    const promise = (async () => {
      const [models, connection, runtime] = await Promise.allSettled([
        fetchAxEngineModels(scope.directory, controller.signal),
        fetchAxEngineConnection(scope.directory, controller.signal),
        fetchDesktopAxCodeRuntimeIdentity(),
      ])
      if (controller.signal.aborted || activeScope.current !== scope) return
      const failure = [models, connection].find((result) => result.status === "rejected")
      update({
        data: models.status === "fulfilled" ? models.value : null,
        connection: connection.status === "fulfilled" ? connection.value : null,
        runtimeIdentity: runtime.status === "fulfilled" ? runtime.value : null,
        error:
          failure?.status === "rejected"
            ? failure.reason instanceof Error
              ? failure.reason.message
              : "Failed to check local model availability"
            : null,
        loading: false,
      })
    })().finally(() => {
      if (flight.current?.controller === controller) flight.current = null
    })
    flight.current = { scope, controller, promise }
    return promise
  }, [enabled, scope, update])

  React.useEffect(() => {
    activeScope.current = scope
    void load()
    return () => {
      activeScope.current = null
      flight.current?.controller.abort()
      flight.current = null
    }
  }, [scope, load])

  return (
    <LocalModelsContext.Provider
      value={{
        ...value,
        directory: scope.directory,
        load,
        setData: (data) => update({ data }),
        setConnection: (connection) => update({ connection }),
      }}
    >
      {children}
    </LocalModelsContext.Provider>
  )
}
