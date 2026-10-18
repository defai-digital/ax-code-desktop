import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"
import type { OpenChamberProjectAction } from "@/lib/openchamberConfig"
import { createStreamlitProjectAction } from "@/lib/streamlitProjectAction"

export function StreamlitActionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (action: OpenChamberProjectAction) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [interpreter, setInterpreter] = React.useState("python")
  const [entrypoint, setEntrypoint] = React.useState("app.py")
  const [port, setPort] = React.useState("8501")
  const id = React.useId()
  const action = createStreamlitProjectAction({
    id,
    name: t("settings.projects.actions.streamlit.name"),
    interpreter,
    entrypoint,
    port,
  })
  return (
    <form
      className="my-3 max-w-[30rem] space-y-3 rounded-lg border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (action) onAdd(action)
      }}
    >
      <p className="typography-meta text-muted-foreground">{t("settings.projects.actions.streamlit.description")}</p>
      {(
        [
          ["interpreter", interpreter, setInterpreter],
          ["entrypoint", entrypoint, setEntrypoint],
          ["port", port, setPort],
        ] as const
      ).map(([field, value, setValue]) => (
        <label key={field} className="flex flex-col gap-1 typography-meta">
          {t(`settings.projects.actions.streamlit.${field}`)}
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      ))}
      {action ? (
        <pre className="whitespace-pre-wrap break-all typography-micro">{action.command}</pre>
      ) : (
        <p role="alert" className="typography-meta text-destructive">
          {t("settings.projects.actions.streamlit.invalid")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!action}>
          {t("settings.projects.actions.actions.add")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  )
}
