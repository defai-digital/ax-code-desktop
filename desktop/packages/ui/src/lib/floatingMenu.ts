/** Query when closing, since a menu may have opened after the dialog's last render. */
export const hasOpenFloatingMenu = (): boolean => {
  if (typeof document === "undefined") return false
  return Boolean(
    document.querySelector('[data-slot="dropdown-menu-content"][data-open], [data-slot="select-content"][data-open]'),
  )
}
