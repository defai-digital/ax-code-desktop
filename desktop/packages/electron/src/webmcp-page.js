"use strict"

const { randomUUID } = require("node:crypto")

// Fixed page-side program. It runs in an isolated world so the page cannot replace its helpers, and
// the only data that reaches it is a validated JSON argument object: no selector, script or
// coordinate ever comes from the model. Element references are valid for one read only.
const WORLD_ID = 1998
const MAX_TEXT = 8000
const MAX_ELEMENTS = 150
const MAX_WAIT_MS = 10000
const MAX_TYPED = 2000
const HOWS = new Set(["click", "type", "select"])

function pageProgram(args) {
  const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max)
  const bodyText = () => (document.body ? document.body.innerText : "")
  const state = (window.__axAgentPage ??= { readId: null, refs: new Map() })
  const visible = (el) => {
    if (!el.isConnected || el.getClientRects().length === 0) return false
    const style = getComputedStyle(el)
    return style.visibility !== "hidden" && style.display !== "none"
  }
  const TEXT_INPUTS = new Set(["", "text", "search", "email", "url", "tel", "number"])
  const kindOf = (el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === "input") return (el.getAttribute("type") || "text").toLowerCase()
    if (tag === "textarea" || tag === "select") return tag
    if (el.isContentEditable) return "contenteditable"
    return tag === "a" ? "link" : "button"
  }
  const submitLike = (el) => {
    const tag = el.tagName.toLowerCase()
    const type = (el.getAttribute("type") || "").toLowerCase()
    if (tag === "input") return type === "submit" || type === "image"
    return tag === "button" && Boolean(el.form) && (type === "" || type === "submit")
  }
  const nameOf = (el) =>
    clip(
      el.getAttribute("aria-label") ||
        (el.labels && el.labels[0] && el.labels[0].innerText) ||
        el.innerText ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") ||
        el.getAttribute("alt") ||
        (el.tagName === "INPUT" && ["submit", "button"].includes(el.type) ? el.value : ""),
      80,
    )
  const SELECTOR =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[contenteditable="true"],[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="menuitem"],[role="option"]'

  if (args.op === "read") {
    state.readId = args.readId
    state.refs = new Map()
    const outline = []
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (outline.length >= args.maxElements) break
      if (!visible(el)) continue
      const ref = `e${outline.length + 1}`
      state.refs.set(ref, el)
      const kind = kindOf(el)
      const entry = { ref, kind, name: nameOf(el) }
      if (submitLike(el)) entry.submit = true
      if (el.disabled) entry.disabled = true
      if (kind === "link") {
        try {
          const url = new URL(el.href)
          entry.href = clip(url.origin + url.pathname, 160)
        } catch {}
      } else if (el.tagName === "SELECT") {
        entry.options = [...el.options].slice(0, 20).map((option) => clip(option.text, 60))
      } else if (kind !== "password" && TEXT_INPUTS.has(kind === "text" ? "" : kind) && el.value) {
        entry.value = clip(el.value, 100)
      }
      outline.push(entry)
    }
    return { title: clip(document.title, 200), text: bodyText().slice(0, args.maxText), outline }
  }
  if (args.op === "wait") {
    return new Promise((resolve) => {
      const started = Date.now()
      const tick = () => {
        if (bodyText().includes(args.waitText)) return resolve({ found: true })
        if (Date.now() - started >= args.timeoutMs) return resolve({ found: false })
        setTimeout(tick, 100)
      }
      tick()
    })
  }
  if (args.op === "act") {
    if (state.readId !== args.readId) return { error: "stale" }
    const el = state.refs.get(args.ref)
    if (!el || !el.isConnected || !visible(el)) return { error: "gone" }
    if (el.disabled) return { error: "disabled" }
    const kind = kindOf(el)
    if (args.how === "click") {
      el.scrollIntoView({ block: "center" })
      el.click()
      return { ok: true }
    }
    if (args.how === "type") {
      const typable =
        el.tagName === "TEXTAREA" || el.isContentEditable || (el.tagName === "INPUT" && TEXT_INPUTS.has(kind === "text" ? "" : kind))
      if (kind === "password" || !typable) return { error: "not-typable" }
      el.focus()
      if (el.isContentEditable) {
        el.textContent = args.text
      } else {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, args.text)
      }
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      return { ok: true }
    }
    if (args.how === "select") {
      if (el.tagName !== "SELECT") return { error: "not-selectable" }
      const index = [...el.options].findIndex((option) => option.value === args.text || clip(option.text, 60) === args.text)
      if (index < 0) return { error: "no-option" }
      el.selectedIndex = index
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      return { ok: true }
    }
  }
  return { error: "unsupported" }
}

const PROGRAM = `(${pageProgram.toString()})`
const program = (args) => `${PROGRAM}(${JSON.stringify(args)})`

const OUTPUT_LIMIT = 60000
const bytes = (value) => Buffer.byteLength(JSON.stringify(value) ?? "", "utf8")

// Trim the outline (never the text) until the reply fits the transport limit.
function fit(read) {
  const result = { ...read, outline: [...read.outline] }
  while (bytes(result) > OUTPUT_LIMIT && result.outline.length > 0) result.outline.pop()
  while (bytes(result) > OUTPUT_LIMIT && result.text.length > 0) result.text = result.text.slice(0, -1000)
  return result
}

function validate(request) {
  if (request.operation === "read") return {}
  if (request.operation === "wait") {
    if (typeof request.waitText !== "string" || !request.waitText || request.waitText.length > 200)
      throw new Error("Wait needs the text to wait for")
    const timeoutMs = request.timeoutMs ?? 5000
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_WAIT_MS) throw new Error("Invalid wait time")
    return { waitText: request.waitText, timeoutMs }
  }
  if (request.operation === "act") {
    if (!HOWS.has(request.how)) throw new Error("Unsupported page action")
    if (typeof request.readId !== "string" || !/^[0-9a-f-]{36}$/.test(request.readId)) throw new Error("Invalid read id")
    if (typeof request.ref !== "string" || !/^e[1-9][0-9]{0,3}$/.test(request.ref)) throw new Error("Invalid element reference")
    if (request.how !== "click") {
      if (typeof request.text !== "string" || request.text.length > MAX_TYPED) throw new Error("Invalid text")
    }
    return { readId: request.readId, ref: request.ref, how: request.how, text: request.text ?? "" }
  }
  throw new Error("Unsupported page operation")
}

module.exports = { WORLD_ID, MAX_TEXT, MAX_ELEMENTS, program, validate, fit, randomUUID, pageProgram }
