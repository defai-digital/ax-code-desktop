"use strict"

const mapping = require("../../../shared/native-keys.json")
const catalogs = require("../../../shared/native-catalogs.json")
const english = require("../../../shared/native.en.json")

function createNativeLocalizer(getLocale, dictionaries = catalogs) {
  return (source, params) => {
    const key = Object.hasOwn(mapping, source) ? mapping[source] : undefined
    const message = key ? (dictionaries[getLocale()]?.[key] ?? english[key] ?? source) : source
    if (!params) return message
    return message.replace(/\{([^{}]+)\}/g, (match, rawName) => {
      const name = rawName.trim()
      const value = Object.hasOwn(params, name) ? params[name] : undefined
      return value === null || value === undefined ? match : String(value)
    })
  }
}

const ROLE_LABELS = {
  services: "Services",
  hide: "Hide",
  hideOthers: "Hide Others",
  unhide: "Show All",
  quit: "Quit AX Code",
  reload: "Reload",
  togglefullscreen: "Fullscreen",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  pasteAndMatchStyle: "Paste and Match Style",
  delete: "Delete",
  selectAll: "Select All",
  minimize: "Minimize",
  zoom: "Zoom",
  front: "Bring All to Front",
  close: "Close",
}

function localizeMenuTemplate(template, translate) {
  return template.map((item) => ({
    ...item,
    ...(typeof item.label === "string"
      ? { label: translate(item.label) }
      : Object.hasOwn(ROLE_LABELS, item.role)
        ? { label: translate(ROLE_LABELS[item.role]) }
        : {}),
    ...(Array.isArray(item.submenu) ? { submenu: localizeMenuTemplate(item.submenu, translate) } : {}),
  }))
}

function createLocalizedDialog(dialog, translate) {
  const options = (value) => {
    const next = { ...value }
    for (const key of ["title", "message", "detail", "buttonLabel"]) {
      if (typeof next[key] === "string") next[key] = translate(next[key])
    }
    if (Array.isArray(next.buttons)) next.buttons = next.buttons.map((button) => translate(button))
    return next
  }
  const result = {}
  for (const method of ["showMessageBox", "showOpenDialog", "showSaveDialog"]) {
    result[method] = (...args) => {
      const index = args.length - 1
      args[index] = options(args[index])
      return dialog[method](...args)
    }
  }
  result.showErrorBox = (title, content) => dialog.showErrorBox(translate(title), translate(content))
  return result
}

module.exports = { createNativeLocalizer, localizeMenuTemplate, createLocalizedDialog }
