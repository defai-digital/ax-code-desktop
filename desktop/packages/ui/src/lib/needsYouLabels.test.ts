import { describe, expect, test } from "vitest"
import { dict } from "@/lib/i18n/messages/en"
import type { I18nKey } from "@/lib/i18n"
import type { AttentionReason } from "@/lib/needsYou"
import { SUPERVISION_PRESENTATION } from "@/lib/supervision/presentation"
import type { SupervisionState } from "@/lib/supervision/sessionState"
import { needsYouReasonLabel } from "./needsYouLabels"

const t = ((key: I18nKey) => dict[key]) as Parameters<typeof needsYouReasonLabel>[1]

// The state a reason stands for on the board; uncommitted work is the board's "review".
const BOARD_STATE: Record<AttentionReason, SupervisionState> = {
  permission: "permission",
  question: "question",
  error: "error",
  goal: "goal",
  uncommitted: "review",
}

describe("Needs you reasons", () => {
  test("use the board's word for each state", () => {
    // Home, the strip, the board and notifications named the same session differently (G UX-01).
    for (const reason of Object.keys(BOARD_STATE) as AttentionReason[]) {
      expect(needsYouReasonLabel(reason, t)).toBe(dict[SUPERVISION_PRESENTATION[BOARD_STATE[reason]].label])
    }
    expect(needsYouReasonLabel("permission", t)).toBe("Needs approval")
    expect(needsYouReasonLabel("error", t)).toBe("Failed")
  })
})
