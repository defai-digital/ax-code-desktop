import React from "react"

import type { PermissionRequest } from "@/types/permission"
import type { QuestionRequest } from "@/types/question"

import { PermissionCard } from "./PermissionCard"
import { QuestionCard } from "./QuestionCard"
import { orderPermissionsByRisk } from "@/lib/supervision/requestRisk"

type PinnedRequestDockProps = {
  sessionQuestions: QuestionRequest[]
  sessionPermissions: PermissionRequest[]
}

/**
 * Pending permission/question cards pinned above the composer. Rendered in
 * every session branch that renders a composer (including the expanded
 * composer and the hydrating/empty states) so a pending request is never
 * left visible nowhere.
 */
export const PinnedRequestDock: React.FC<PinnedRequestDockProps> = ({ sessionQuestions, sessionPermissions }) => {
  if (sessionQuestions.length === 0 && sessionPermissions.length === 0) {
    return null
  }

  return (
    <div data-pinned-requests className="max-h-[45vh] shrink-0 overflow-y-auto">
      {sessionQuestions.map((question) => (
        <QuestionCard key={question.id} question={question} />
      ))}
      {orderPermissionsByRisk(sessionPermissions).map((permission) => (
        <PermissionCard key={permission.id} permission={permission} />
      ))}
    </div>
  )
}
