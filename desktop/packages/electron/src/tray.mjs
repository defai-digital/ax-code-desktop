// macOS menu bar (status bar) controller.
//
// Surfaces a glanceable, always-visible view of AX Code's live state:
//  1. an aggregate activity indicator (idle / busy / error+retry) in the icon
//     title, rendered as a monochrome template image plus a text counter so it
//     adapts to light/dark menu bars (colour can't be shown in template mode);
//  2. pending approvals (permission + question requests) that block agents,
//     with inline Allow/Deny actions;
//  3. the list of active sessions with status + branch, click to focus;
//  4. quick actions (new session, show window, quit).
//
// The live state lives in the renderer (Zustand). It is pushed here over the
// existing IPC bridge via the `desktop_tray_update` command; this module owns
// only presentation. Tray clicks call back through `onAction`, which main.mjs
// routes to the renderer (focus-session, respond-permission, …) or handles
// natively (show-main-window, quit).

import { Tray, Menu, nativeImage } from "electron"

const MAX_SESSIONS = 8
const MAX_APPROVALS = 10

const truncate = (value, max) => {
  const text = typeof value === "string" ? value.trim() : ""
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

// Which status icon key a session maps to. 'blank' (a transparent image)
// reserves the same left gutter for idle rows so every row aligns.
const statusIconKey = (session) => {
  if (session.status === "busy") return "busy"
  if (session.status === "retry") return "retry"
  if (session.hasError) return "error"
  if (session.unseen > 0) return "unseen"
  return "blank"
}

const sessionLabel = (session, translate) => {
  // The status is a native left icon (the ✓ already signals unread), so the
  // label is just the session title.
  return truncate(session.title || translate("Untitled Session"), 40)
}

const approvalLabel = (approval, translate) => {
  const icon = approval.kind === "permission" ? "⛔" : "❓"
  const who = truncate(approval.sessionTitle || translate("Session"), 24)
  const what = truncate(approval.label || translate(approval.kind === "permission" ? "Permission required" : "Waiting for input"), 34)
  return `${icon} ${who} — ${what}`
}

// Text shown next to the icon — reserved for the two states where a precise
// count is actionable: pending approvals and errors. Busy and unread are
// conveyed by the icon itself (animated / filled faces), so they add no text.
// Glyphs come from the Geometric Shapes block so macOS renders them monochrome
// (not colour emoji) and tints them with the menu bar like the template icon.
const computeTitle = (counts) => {
  if (counts.approvals > 0) return `◆ ${counts.approvals}` // decision needed
  if (counts.error > 0) return `▲ ${counts.error}` // problem
  return ""
}

// Which icon variant to show. Busy work animates a "breathing" fill; unread
// (with nothing active) holds a static filled cube until the state clears;
// otherwise the plain outline.
const computeIconState = (counts) => {
  if (counts.busy > 0) return "busy"
  if (counts.unseen > 0) return "unseen"
  return "idle"
}

const computeTooltip = (counts, sessionCount, translate) => {
  if (sessionCount === 0) return `AX Code — ${translate("No active sessions")}`
  const bits = []
  if (counts.approvals > 0) bits.push(`${translate("Needs your attention")}: ${counts.approvals}`)
  if (counts.error > 0) bits.push(`${translate("Session error")}: ${counts.error}`)
  if (counts.busy > 0) bits.push(`${translate("Session active")}: ${counts.busy}`)
  if (counts.unseen > 0) bits.push(`${translate("Unread updates")}: ${counts.unseen}`)
  const suffix = bits.length ? bits.join(", ") : translate("Idle")
  return `AX Code — ${translate("Sessions")}: ${sessionCount} · ${suffix}`
}

// Frame cadence for the "breathing" busy animation. With the eased frame set
// (denser near the extremes) a slower tick reads as a calm, continuous glow
// rather than a snappy blink.
const ANIM_INTERVAL_MS = 75

const toTemplateImage = (p) => {
  const image = nativeImage.createFromPath(p)
  image.setTemplateImage(true)
  return image
}

// idleIconPath: plain outline (calm state). unseenIconPath: statically filled
// (a finished session left unread). breathIconPaths: eased outline→fill frames
// the busy state ping-pongs through.
export const createTrayController = ({ idleIconPath, unseenIconPath, breathIconPaths, statusIconPaths, onAction, translate = (value) => value }) => {
  let tray = null
  let lastTitle = null
  let lastSnapshot = {}

  // macOS auto-picks the @2x file next to each path and tints the alpha.
  const idleFrame = toTemplateImage(idleIconPath)
  const unseenFrame = toTemplateImage(unseenIconPath)
  const breathFrames = breathIconPaths.map(toTemplateImage)
  // Per-row status icons (template images, tinted + vertically centred by macOS).
  const statusIcons = {}
  for (const [key, p] of Object.entries(statusIconPaths || {})) {
    statusIcons[key] = toTemplateImage(p)
  }

  let iconState = null
  let animTimer = null
  let animIndex = 0
  let animDir = 1

  const stopAnim = () => {
    if (animTimer) {
      clearInterval(animTimer)
      animTimer = null
    }
  }

  const startAnim = () => {
    if (animTimer || !tray || tray.isDestroyed?.()) return
    animIndex = 0
    animDir = 1
    animTimer = setInterval(() => {
      if (!tray || tray.isDestroyed?.()) return
      tray.setImage(breathFrames[animIndex] || idleFrame)
      // Ping-pong for a seamless, infinite in-and-out breath.
      animIndex += animDir
      if (animIndex >= breathFrames.length - 1) {
        animIndex = breathFrames.length - 1
        animDir = -1
      } else if (animIndex <= 0) {
        animIndex = 0
        animDir = 1
      }
    }, ANIM_INTERVAL_MS)
  }

  const applyIconState = (nextState) => {
    if (nextState === iconState) return
    iconState = nextState
    if (!tray || tray.isDestroyed?.()) return
    if (nextState === "busy") {
      startAnim()
    } else if (nextState === "unseen") {
      stopAnim()
      tray.setImage(unseenFrame)
    } else {
      stopAnim()
      tray.setImage(idleFrame)
    }
  }

  const ensureTray = () => {
    if (tray && !tray.isDestroyed?.()) return tray
    tray = new Tray(idleFrame)
    tray.setIgnoreDoubleClickEvents(true)
    return tray
  }

  const buildMenu = (snapshot) => {
    const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : []
    const approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : []
    const header =
      typeof snapshot.instanceName === "string" && snapshot.instanceName.trim()
        ? snapshot.instanceName.trim()
        : "AX Code"

    const template = [{ label: header, enabled: false }, { type: "separator" }]

    if (approvals.length > 0) {
      template.push({ label: translate("Needs your attention"), enabled: false })
      const approvalItem = (approval) => {
        if (approval.kind === "permission") {
          const submenu = [
            {
              label: translate("Allow once"),
              click: () =>
                onAction({
                  type: "respond-permission",
                  sessionId: approval.sessionId,
                  id: approval.id,
                  response: "once",
                }),
            },
          ]
          // "Always" only makes sense when the runtime can remember the answer;
          // the UI marks requests with no persistable pattern as canSave: false.
          if (approval.canSave === true) {
            submenu.push({
              label: translate("Allow always"),
              click: () =>
                onAction({
                  type: "respond-permission",
                  sessionId: approval.sessionId,
                  id: approval.id,
                  response: "always",
                }),
            })
          }
          submenu.push(
            { type: "separator" },
            {
              label: translate("Deny"),
              click: () =>
                onAction({
                  type: "respond-permission",
                  sessionId: approval.sessionId,
                  id: approval.id,
                  response: "reject",
                }),
            },
            { type: "separator" },
            {
              label: translate("Open in app"),
              click: () =>
                onAction({
                  type: "focus-session",
                  sessionId: approval.sessionId,
                  directory: approval.directory || "",
                }),
            },
          )
          return {
            label: approvalLabel(approval, translate),
            submenu,
          }
        }
        return {
          label: approvalLabel(approval, translate),
          click: () =>
            onAction({ type: "focus-session", sessionId: approval.sessionId, directory: approval.directory || "" }),
        }
      }
      for (const approval of approvals.slice(0, MAX_APPROVALS)) {
        template.push(approvalItem(approval))
      }
      const approvalOverflow = approvals.slice(MAX_APPROVALS)
      if (approvalOverflow.length > 0) {
        template.push({
          label: translate("{count} more\u2026", { count: approvalOverflow.length }),
          submenu: approvalOverflow.map(approvalItem),
        })
      }
      template.push({ type: "separator" })
    }

    const sessionItem = (session) => ({
      label: sessionLabel(session, translate),
      // Status icon on the left, centred across both lines; idle uses the blank
      // placeholder so every row keeps the same gutter.
      icon: statusIcons[statusIconKey(session)] || statusIcons.blank,
      // Secondary smaller line (macOS): project · branch.
      ...(session.subtitle ? { sublabel: truncate(session.subtitle, 48) } : {}),
      click: () => onAction({ type: "focus-session", sessionId: session.id, directory: session.directory || "" }),
    })

    if (sessions.length > 0) {
      template.push({ label: translate("Sessions"), enabled: false })
      for (const session of sessions.slice(0, MAX_SESSIONS)) {
        template.push(sessionItem(session))
      }
      const overflow = sessions.slice(MAX_SESSIONS)
      if (overflow.length > 0) {
        template.push({
          label: translate("{count} more\u2026", { count: overflow.length }),
          submenu: overflow.map(sessionItem),
        })
      }
    } else {
      template.push({ label: translate("No active sessions"), enabled: false })
    }

    // Usage submenu — only when the user has enabled providers for the dropdown
    // (same "configured to show" rule as the header/mobile); omitted otherwise.
    const usage = snapshot.usage && typeof snapshot.usage === "object" ? snapshot.usage : null
    const usageGroups = usage && Array.isArray(usage.groups) ? usage.groups : []
    if (usageGroups.length > 0) {
      const modeLabel = translate(usage.mode === "remaining" ? "Remaining" : "Used")
      const usageSubmenu = []
      usageGroups.forEach((group, index) => {
        if (index > 0) usageSubmenu.push({ type: "separator" })
        // Read-only info rows. NSMenu only offers greyed-out for non-clickable
        // items (no custom text contrast), so these render dimmed — at the mercy
        // of macOS's menu contrast choices. Provider flush, rows indented.
        usageSubmenu.push({ label: group.provider, enabled: false })
        if (group.status) {
          usageSubmenu.push({ label: `    ${truncate(group.status, 40)}`, enabled: false })
        }
        for (const row of Array.isArray(group.rows) ? group.rows : []) {
          usageSubmenu.push({ label: `    ${row.label}  —  ${row.value}`, enabled: false })
        }
      })
      template.push({ type: "separator" }, { label: translate("Usage ({mode})", { mode: modeLabel }), submenu: usageSubmenu })
    }

    template.push(
      { type: "separator" },
      { label: translate("New Session"), click: () => onAction({ type: "new-session" }) },
      { label: translate("New Mini Chat"), click: () => onAction({ type: "new-mini-chat" }) },
      { label: translate("Show AX Code"), click: () => onAction({ type: "show-main-window" }) },
      { type: "separator" },
      { label: translate("Quit AX Code"), click: () => onAction({ type: "quit" }) },
    )

    return Menu.buildFromTemplate(template)
  }

  const update = (rawSnapshot) => {
    const snapshot = rawSnapshot && typeof rawSnapshot === "object" ? rawSnapshot : {}
    lastSnapshot = snapshot
    const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : []
    const approvals = Array.isArray(snapshot.approvals) ? snapshot.approvals : []

    const counts = {
      busy: sessions.filter((s) => s.status === "busy" || s.status === "retry").length,
      error: sessions.filter((s) => s.hasError).length,
      approvals: approvals.length,
      unseen: sessions.reduce((sum, s) => sum + (Number.isFinite(s.unseen) ? s.unseen : 0), 0),
    }

    const widget = ensureTray()
    const title = computeTitle(counts)
    if (title !== lastTitle) {
      widget.setTitle(title)
      lastTitle = title
    }
    applyIconState(computeIconState(counts))
    widget.setToolTip(computeTooltip(counts, sessions.length, translate))
    widget.setContextMenu(buildMenu(snapshot))
  }

  const destroy = () => {
    stopAnim()
    if (tray && !tray.isDestroyed?.()) {
      tray.destroy()
    }
    tray = null
    lastTitle = null
    iconState = null
  }

  return { update, destroy, refreshLanguage: () => update(lastSnapshot) }
}
