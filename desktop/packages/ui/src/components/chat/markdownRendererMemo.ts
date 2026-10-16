import type { MarkdownRendererProps } from "@/components/chat/MarkdownRendererImpl-impl"

/**
 * Whether a re-render of the markdown renderer can be skipped. Every prop the render reads has to
 * be compared here: one that is left out makes the component ignore a change it renders from.
 * `enableFileReferences` was missing, so a part that finished streaming with file references
 * enabled kept the dead links it had rendered while streaming (its sibling renderer compares it).
 */
export const areMarkdownRendererPropsEqual = (prev: MarkdownRendererProps, next: MarkdownRendererProps): boolean => {
  return (
    prev.content === next.content &&
    prev.isStreaming === next.isStreaming &&
    prev.disableStreamAnimation === next.disableStreamAnimation &&
    prev.variant === next.variant &&
    prev.isAnimated === next.isAnimated &&
    prev.skipFadeIn === next.skipFadeIn &&
    prev.className === next.className &&
    prev.messageId === next.messageId &&
    prev.onShowPopup === next.onShowPopup &&
    prev.enableFileReferences === next.enableFileReferences &&
    prev.part?.id === next.part?.id
  )
}
