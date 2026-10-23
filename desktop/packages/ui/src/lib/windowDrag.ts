/**
 * Whether a primary-button press inside the draggable title bar should start a native window drag.
 * Controls and anything marked `app-region-no-drag` keep their own click. This includes the full-screen
 * backdrops of header popovers: they sit inside the title bar's React tree, so without the mark a press on them
 * (which is also a press on the button that opened the popover) starts a drag and the click never lands.
 */
export const shouldStartWindowDrag = (target: Element, button: number): boolean => {
  if (target.closest(".app-region-no-drag")) return false
  if (target.closest("button, a, input, select, textarea")) return false
  return button === 0
}
