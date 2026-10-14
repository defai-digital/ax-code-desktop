import React from "react"
import { isDesktopWindowFullscreen, onDesktopWindowResized } from "@/lib/desktopNative"

// Tracks whether the native window is fullscreen, where macOS hides the
// traffic lights and headers can drop the inset reserved for them.
export const useDesktopWindowFullscreen = (enabled: boolean): boolean => {
  const [fullscreen, setFullscreen] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) {
      setFullscreen(false)
      return
    }

    let disposed = false
    const sync = async () => {
      let next = false
      try {
        next = await isDesktopWindowFullscreen()
      } catch {
        next = false
      }
      if (!disposed) setFullscreen(next)
    }

    void sync()
    // Electron exposes no native resize event to the renderer, so observe the
    // DOM resize that accompanies entering and leaving fullscreen.
    const unlisten = onDesktopWindowResized(() => {
      void sync()
    })

    return () => {
      disposed = true
      unlisten()
    }
  }, [enabled])

  return fullscreen
}
