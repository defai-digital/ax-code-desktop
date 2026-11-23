import React from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { draftSetup } from "@/lib/draftSetup"
import { openProjectFolder } from "@/lib/projectOpen"
import { openAddProviderSettings } from "@/lib/settings/addProvider"
import { cn } from "@/lib/utils"
import { useConfigStore } from "@/stores/useConfigStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useUIStore } from "@/stores/useUIStore"

interface DraftSetupStepsProps {
  className?: string
}

interface SetupStep {
  key: "project" | "connect" | "choose"
  title: string
  body: string
  action: string
  onAction: () => void
}

/**
 * The next missing setup step lives in the draft itself instead of a toast after Send (C UX-05). Every action opens a
 * picker or the Settings dialog over the draft, so the prompt typed below stays where it is.
 */
export function DraftSetupSteps(props: DraftSetupStepsProps): React.ReactNode {
  const { className } = props
  const { t } = useI18n()
  const projectCount = useProjectsStore((state) => state.projects.length)
  const providersReady = useConfigStore((state) => state.isInitialized)
  const providers = useConfigStore((state) => state.providers)
  const currentProviderId = useConfigStore((state) => state.currentProviderId)
  const currentModelId = useConfigStore((state) => state.currentModelId)
  const setup = draftSetup({ projectCount, providersReady, providers, currentProviderId, currentModelId })

  const steps: SetupStep[] = []
  if (setup.needsProject) {
    steps.push({
      key: "project",
      title: t("chat.draftSetup.project.title"),
      body: t("chat.draftSetup.project.body"),
      action: t("projects.home.actions.openFolder"),
      onAction: () => void openProjectFolder({ t }),
    })
  }
  if (setup.modelStep === "connect") {
    steps.push({
      key: "connect",
      title: t("chat.draftSetup.provider.title"),
      body: t("chat.draftSetup.provider.body"),
      action: t("chat.draftSetup.provider.action"),
      onAction: openAddProviderSettings,
    })
  } else if (setup.modelStep === "choose") {
    steps.push({
      key: "choose",
      title: t("chat.draftSetup.model.title"),
      body: t("chat.draftSetup.model.body"),
      action: t("chat.draftSetup.model.action"),
      onAction: () => useUIStore.getState().setModelSelectorOpen(true),
    })
  }
  if (steps.length === 0) return null

  return (
    <section data-draft-setup className={cn("flex flex-col gap-2", className)} aria-labelledby="draft-setup-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="draft-setup-title" className="typography-ui-header font-semibold text-foreground">
          {t("chat.draftSetup.title")}
        </h2>
        <p className="typography-meta text-muted-foreground">{t("chat.draftSetup.subtitle")}</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-draft-setup-step={step.key}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-[var(--surface-elevated)] px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary typography-micro font-semibold text-primary"
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="typography-ui-label font-medium text-foreground">{step.title}</span>
              <span className="typography-meta text-muted-foreground">{step.body}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant={index === 0 ? "default" : "outline"}
              className="shrink-0 gap-1.5"
              onClick={step.onAction}
            >
              {step.key === "project" ? <Icon name="folder-add" className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {step.action}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  )
}
