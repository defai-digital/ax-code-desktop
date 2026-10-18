import React from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"
import { detectStreamlitEntrypoints } from "@/lib/detectDevServer"
import type { OpenChamberProjectAction } from "@/lib/openchamberConfig"
import { createManagedStreamlitAction, sanitizeStreamlitRecipe, type StreamlitProgress } from "@/lib/streamlitRecipe"

export function StreamlitRunDialog({
  directory,
  action,
  progress,
  onClose,
  onRun,
}: {
  directory: string
  action?: OpenChamberProjectAction
  progress?: StreamlitProgress
  onClose: () => void
  onRun: (action: OpenChamberProjectAction, setup: boolean) => Promise<boolean | void>
}) {
  const { t } = useI18n()
  const [entrypoint, setEntrypoint] = React.useState(action?.streamlit?.entrypoint ?? "")
  const [interpreter, setInterpreter] = React.useState(action?.streamlit?.interpreter ?? "")
  const [port, setPort] = React.useState(String(action?.streamlit?.port ?? ""))
  const [candidates, setCandidates] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(!action)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState(false)
  const inputId = React.useId()
  React.useEffect(() => {
    if (action) return
    let active = true
    void detectStreamlitEntrypoints(directory).then((found) => {
      if (!active) return
      setCandidates(found)
      if (found.length === 1) setEntrypoint(found[0])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [directory, action])
  const recipe = sanitizeStreamlitRecipe({
    version: 1,
    entrypoint: entrypoint.trim(),
    ...(interpreter.trim() ? { interpreter: interpreter.trim() } : {}),
    ...(port ? { port: Number(port) } : {}),
  })
  const setup = progress?.stage === "setup-required"
  const errorCodes = [
    "python",
    "file",
    "config",
    "uv",
    "unsupported",
    "environment",
    "install",
    "dependency",
    "port",
  ] as const
  const errorCode = errorCodes.find((code) => code === progress?.code) ?? "environment"
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogTitle>{t("projectActions.streamlit.run")}</DialogTitle>
        <DialogDescription>{t("projectActions.streamlit.description")}</DialogDescription>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!recipe || saving) return
            setSaving(true)
            setError(false)
            try {
              const started = await onRun(
                createManagedStreamlitAction(action?.id ?? crypto.randomUUID(), action?.name ?? "Streamlit", recipe),
                setup,
              )
              if (started === false) {
                setError(true)
                return
              }
              onClose()
            } catch {
              setError(true)
            } finally {
              setSaving(false)
            }
          }}
        >
          <label className="flex flex-col gap-1 typography-meta">
            {t("settings.projects.actions.streamlit.entrypoint")}
            <Input
              value={entrypoint}
              list={inputId}
              disabled={setup || loading || saving}
              onChange={(event) => setEntrypoint(event.target.value)}
              placeholder="streamlit_app.py"
            />
            <datalist id={inputId}>
              {candidates.map((path) => (
                <option key={path} value={path} />
              ))}
            </datalist>
          </label>
          {!setup && (
            <details>
              <summary className="cursor-pointer typography-meta">{t("projectActions.streamlit.advanced")}</summary>
              <div className="space-y-2 pt-2">
                <label className="flex flex-col gap-1 typography-meta">
                  {t("settings.projects.actions.streamlit.interpreter")}
                  <Input
                    value={interpreter}
                    onChange={(event) => setInterpreter(event.target.value)}
                    placeholder={t("projectActions.streamlit.automatic")}
                  />
                </label>
                <label className="flex flex-col gap-1 typography-meta">
                  {t("settings.projects.actions.streamlit.port")}
                  <Input
                    value={port}
                    onChange={(event) => setPort(event.target.value)}
                    placeholder={t("projectActions.streamlit.automatic")}
                  />
                </label>
              </div>
            </details>
          )}
          {setup && (
            <p role="status" className="typography-meta">
              {t(
                `projectActions.streamlit.setup.${progress?.source === "uv" ? "uv" : progress?.source === "requirements" ? "requirements" : "simple"}`,
              )}
            </p>
          )}
          {progress?.stage === "failed" && (
            <p role="alert" className="typography-meta text-destructive">
              {t(`projectActions.streamlit.error.${errorCode}`)}
            </p>
          )}
          {error && <p role="alert">{t("projectActions.error.failedToRunAction")}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={!recipe || loading || saving}>
              {t(setup ? "projectActions.streamlit.setupRun" : "projectActions.streamlit.run")}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
