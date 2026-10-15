/**
 * Maps every sprite icon name used by the UI to a Phosphor icon.
 *
 * The sprite names are stable identifiers used throughout packages/ui and
 * packages/web (`<Icon name="..." />`, tool icon tables, configuration). They
 * predate the Phosphor set, so this table is the single place that decides
 * which glyph each name renders.
 *
 * A value is either a Phosphor icon name (rendered with DEFAULT_WEIGHT) or an
 * object `{ icon, weight?, flip? }`. `flip: true` mirrors the glyph
 * horizontally for directions Phosphor only ships one way.
 *
 * Phosphor Icons (https://phosphoricons.com) are MIT licensed; see NOTICE.
 */

// Bold keeps strokes at or above about 1px at the 12 to 16px sizes the app uses most; regular
// drops to 0.75px at 12px and blurs on 1x displays.
export const DEFAULT_WEIGHT = "bold"

/** Weights available in @phosphor-icons/core. */
export const PHOSPHOR_WEIGHTS = ["thin", "light", "regular", "bold", "fill", "duotone"]

const fill = (icon) => ({ icon, weight: "fill" })
const duotone = (icon) => ({ icon, weight: "duotone" })

export const ICON_MAP = {
  // Actions
  add: "plus",
  "add-circle": "plus-circle",
  subtract: "minus",
  close: "x",
  "close-circle": "x-circle",
  check: "check",
  edit: "pencil-simple",
  "edit-2": "pencil-simple-line",
  pencil: "pencil-simple",
  "pencil-ai": "pencil-simple-line",
  "delete-bin": "trash",
  "file-copy": "copy",
  "file-copy-2": "copy-simple",
  clipboard: "clipboard",
  scissors: "scissors",
  "save-3": "floppy-disk",
  download: "download-simple",
  "download-cloud": "cloud-arrow-down",
  "image-download": "download-simple",
  "share-2": "share-fat",
  "external-link": "arrow-square-out",
  "link-unlink-m": "link-break",
  refresh: "arrow-clockwise",
  restart: "arrow-counter-clockwise",
  "loop-right-ai": "repeat",
  "arrow-go-back": "arrow-u-up-left",
  "arrow-go-forward": "arrow-u-up-right",
  search: "magnifying-glass",
  "search-eye": "binoculars",
  "menu-search": "list-magnifying-glass",
  "send-plane": "paper-plane-right",
  "send-plane-2": "paper-plane-tilt",
  play: "play",
  stop: "stop",
  "stop-circle": "stop-circle",
  "record-circle": "record",
  shuffle: "shuffle",
  "drag-move-2": "arrows-out-cardinal",
  draggable: "dots-six-vertical",
  more: "dots-three",
  "more-2": "dots-three-vertical",
  "more-2-fill": fill("dots-three-vertical"),
  fullscreen: "corners-out",
  "fullscreen-exit": "corners-in",
  "expand-up-down": "caret-up-down",
  "contract-up-down": "arrows-in-line-vertical",
  "corner-down-left": "arrow-elbow-down-left",
  "picture-in-picture-2": "picture-in-picture",
  pushpin: "push-pin-simple",
  "pushpin-2": "push-pin",
  "pushpin-2-fill": fill("push-pin"),
  unpin: "push-pin-slash",
  "thumb-up": "thumbs-up",
  "thumb-down": "thumbs-down",

  // Arrows and carets
  "arrow-up": "arrow-up",
  "arrow-down": "arrow-down",
  "arrow-left": "arrow-left",
  "arrow-left-long": "arrow-line-left",
  "arrow-right": "arrow-right",
  "arrow-left-right": "arrows-left-right",
  "arrow-up-s": "caret-up",
  "arrow-down-s": "caret-down",
  "arrow-left-s": "caret-left",
  "arrow-right-s": "caret-right",
  "arrow-up-double": "caret-double-up",

  // Status and feedback
  alert: "warning",
  "error-warning": "warning-circle",
  information: "info",
  question: "question",
  loader: "spinner-gap",
  "loader-4": "circle-notch",
  pulse: "pulse",
  hourglass: "hourglass",
  "hourglass-fill": fill("hourglass"),
  time: "clock",
  timer: "timer",
  history: "clock-counter-clockwise",
  "checkbox-blank": "square",
  "checkbox-blank-circle-fill": fill("circle"),
  checkbox: "check-square",
  "checkbox-circle": "check-circle",
  "checkbox-multiple": "check-square-offset",
  "notification-3": "bell",
  star: "star",
  "star-fill": fill("star"),
  heart: "heart",
  "emotion-happy": "smiley",

  // Agents, AI and chat
  "ai-agent": "head-circuit",
  "ai-agent-fill": fill("head-circuit"),
  "ai-generate-2": "magic-wand",
  "brain-ai-3": "brain",
  brain: "brain",
  robot: "robot",
  "robot-2": duotone("robot"),
  sparkling: "sparkle",
  "chat-1": "chat-circle",
  "chat-3": "chat-teardrop",
  "chat-4": "chat-centered",
  "chat-ai-3": "chat-circle-dots",
  "chat-history": "chats",
  "chat-new": "note-pencil",
  "chat-thread": "chats-teardrop",
  "slash-commands-2": "brackets-square",
  command: "command",

  // Code, terminal and git
  code: "code-simple",
  "code-sslash": "code",
  "code-box": "code-block",
  "code-ai": "brackets-curly",
  terminal: "terminal",
  "terminal-box": "terminal-window",
  bug: "bug",
  "git-branch": "git-branch",
  "git-commit": "git-commit",
  "git-merge": "git-merge",
  "git-pull-request": "git-pull-request",
  "git-pr-draft": "git-pull-request",
  // Phosphor has no closed or draft PR glyph; the PR status color and label carry the state.
  "git-close-pull-request": "git-pull-request",
  "git-repository": "book-bookmark",
  "node-tree": "tree-structure",
  "list-check-2": "list-checks",
  "list-check-3": "list-checks",
  "list-unordered": "list-bullets",
  task: "flow-arrow",
  survey: "clipboard-text",
  hammer: "hammer",
  tools: "wrench",
  flask: "flask",
  "scales-3": "scales",
  stack: "stack",

  // Files and folders
  file: "file",
  "file-add": "file-plus",
  // Autosave toggle in the file editor, beside the save button: off and on.
  "file-check": "arrows-clockwise",
  "file-check-fill": fill("arrows-clockwise"),
  "file-code": "file-code",
  "file-edit": "pencil-line",
  "file-image": "file-image",
  "file-list-2": "files",
  "file-music": "file-audio",
  "file-pdf": "file-pdf",
  "file-search": "file-magnifying-glass",
  "file-text": "file-text",
  // Files editor "Open in desktop app".
  "file-transfer": "arrow-square-out",
  "file-video": "file-video",
  folder: "folder",
  "folder-3": "folder-simple",
  "folder-3-fill": fill("folder-simple"),
  "folder-6": "folder-dashed",
  "folder-add": "folder-plus",
  "folder-open": "folder-open",
  "folder-open-fill": fill("folder-open"),
  // "Reveal in Finder / Explorer".
  "folder-received": "arrow-square-in",
  folders: "folders",
  archive: "archive",
  // Git stashes.
  "archive-stack": "stack-simple",
  "inbox-archive": "tray-arrow-down",
  "inbox-unarchive": "tray-arrow-up",
  "inbox-unarchive-fill": fill("tray-arrow-up"),
  "attachment-2": "paperclip",
  "sticky-note": "note",
  book: "book",
  "book-open": "book-open",
  booklet: "notebook",

  // Layout and text
  "layout-column": "columns",
  "layout-left": "sidebar-simple",
  "layout-right": { icon: "sidebar-simple", flip: true },
  "menu-2": "list",
  // Files editor "Go to line".
  "menu-fold-2": "list-numbers",
  "split-cells-horizontal": "square-split-horizontal",
  window: "app-window",
  text: "text-t",
  "text-wrap": "arrow-u-down-left",
  "align-justify": "text-align-justify",
  "equalizer-2": "sliders-horizontal",
  "settings-3": "gear-six",
  palette: "palette",

  // Charts
  "bar-chart-2": "chart-bar",
  "bar-chart-box": "presentation-chart",
  "pie-chart": "chart-pie-slice",
  "donut-chart": "chart-donut",
  "donut-chart-fill": fill("chart-donut"),

  // Devices, network and system
  computer: "desktop",
  macbook: "laptop",
  smartphone: "device-mobile",
  server: "hard-drives",
  "database-2": "database",
  cloud: "cloud",
  "cloud-off": "cloud-slash",
  global: "globe",
  earth: "globe-hemisphere-west",
  plug: "plug",
  "plug-2": "plugs-connected",
  camera: "camera",
  mic: "microphone",
  "mic-off": "microphone-slash",
  "volume-up": "speaker-high",
  cursor: "cursor",
  eye: "eye",
  "eye-off": "eye-slash",

  // Security and identity
  shield: "shield",
  "shield-check": "shield-check",
  "shield-keyhole": "lock-key",
  "shield-user": "identification-badge",
  lock: "lock",
  "lock-2": "lock-simple",
  "lock-unlock": "lock-open",
  key: "key",
  user: "user",
  "user-3": "user-circle",

  // Places, objects and project glyphs
  home: "house",
  "compass-3": "compass",
  calendar: "calendar-blank",
  "calendar-schedule": "calendar-dots",
  briefcase: "briefcase",
  rocket: "rocket-launch",
  lightbulb: "lightbulb",
  flashlight: "flashlight",
  leaf: "leaf",
  gamepad: "game-controller",
  "graduation-cap": "graduation-cap",
  music: "music-notes",
  "play-list-add": "list-plus",

  // Brands
  apple: "apple-logo",
  github: "github-logo",
  "github-fill": fill("github-logo"),
  "discord-fill": fill("discord-logo"),
  "twitter-xfill": fill("x-logo"),
}
