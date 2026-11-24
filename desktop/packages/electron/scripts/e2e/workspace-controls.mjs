export const waitForChatSession = (audit, sessionId, label) =>
  audit.wait(
    `Array.from(document.querySelectorAll("[data-chat-session]")).some(chat => chat.dataset.chatSession === ${JSON.stringify(sessionId)})`,
    label,
  )

export const openInspectorChanges = async (audit) => {
  if (await audit.session.evaluate('Boolean(document.querySelector("[data-inspector-collapsed=true]"))')) {
    await audit.click("Tools", { role: "button" })
  }
  const changes = '[data-inspector-rail] button[aria-label="Changes"]'
  await audit.wait(`Boolean(document.querySelector(${JSON.stringify(changes)})?.checkVisibility())`, "Changes control")
  if (await audit.session.evaluate(`document.querySelector(${JSON.stringify(changes)}).getAttribute("aria-pressed") !== "true"`)) {
    await audit.click("Changes", { role: "button" })
  }
}
