import React from "react"

/**
 * Where a chat surface is mounted.
 * - "main-window": inside MainLayout, whose header already shows context usage and WebMCP.
 * - "mini-chat": the compact mini chat window, whose own title bar shows context usage.
 * - "default": anything else, such as the embedded session chat, which has no header.
 */
export type ChatSurfaceMode = "default" | "main-window" | "mini-chat"

export const ChatSurfaceContext = React.createContext<ChatSurfaceMode>("default")
