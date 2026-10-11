import { describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import vm from "node:vm"

const source = fs.readFileSync(new URL("./launch-animation-player.js", import.meta.url), "utf8")
function player({ reduced = false, clip = "01-opening-code.webm", playError = false } = {}) {
  const videoEvents = {},
    documentEvents = {},
    buttonEvents = {},
    motionEvents = {}
  const finish = vi.fn()
  const video = {
    pause: vi.fn(),
    play: vi.fn(() => (playError ? Promise.reject(new Error("decode failed")) : Promise.resolve())),
    addEventListener: (name, fn) => {
      videoEvents[name] = fn
    },
    getVideoPlaybackQuality: () => ({ totalVideoFrames: reduced ? 0 : 72 }),
  }
  const elements = {
    scene: video,
    status: {},
    skip: {
      addEventListener: (name, fn) => {
        buttonEvents.skip = fn
      },
    },
    disable: {
      addEventListener: (name, fn) => {
        buttonEvents.disable = fn
      },
    },
  }
  const params = new URLSearchParams({ clip, skip: "Localized skip", disable: "Localized disable" })
  vm.runInNewContext(source, {
    URLSearchParams,
    window: { location: { search: `?${params}` }, launchAnimation: { finish } },
    document: {
      getElementById: (id) => elements[id],
      addEventListener: (name, fn) => {
        documentEvents[name] = fn
      },
    },
    matchMedia: () => ({
      matches: reduced,
      addEventListener: (name, fn) => {
        motionEvents[name] = fn
      },
    }),
  })
  return { video, elements, finish, videoEvents, documentEvents, buttonEvents, motionEvents }
}
describe("isolated media player", () => {
  it("honors reduced motion before loading or playing a clip", () => {
    const p = player({ reduced: true })
    expect(p.video.play).not.toHaveBeenCalled()
    expect(p.video.src).toBeUndefined()
    expect(p.finish).toHaveBeenCalledWith("reduced-motion", 0)
  })
  it("stops playback when reduced motion becomes enabled", () => {
    const p = player()
    p.motionEvents.change({ matches: true })
    expect(p.video.pause).toHaveBeenCalledOnce()
    expect(p.finish).toHaveBeenCalledWith("reduced-motion", 72)
  })
  it("supports localized skip controls and Escape without double completion", () => {
    const p = player()
    expect(p.elements.skip.textContent).toBe("Localized skip")
    p.documentEvents.keydown({ key: "Escape", preventDefault: vi.fn() })
    p.buttonEvents.skip()
    p.videoEvents.ended()
    expect(p.finish).toHaveBeenCalledTimes(1)
    expect(p.finish).toHaveBeenCalledWith("skip", 72)
  })
  it("requests persistent disabling through its narrow bridge", () => {
    const p = player()
    p.buttonEvents.disable()
    expect(p.finish).toHaveBeenCalledWith("disabled", 72)
  })
  it("rejects media paths outside the packaged artwork", () => {
    const p = player({ clip: "../other.webm" })
    expect(p.video.play).not.toHaveBeenCalled()
    expect(p.finish).toHaveBeenCalledWith("error", 72)
  })
  it("continues startup or shutdown after decoder/autoplay rejection", async () => {
    const p = player({ playError: true })
    await Promise.resolve()
    expect(p.finish).toHaveBeenCalledWith("error", 72)
  })
})
