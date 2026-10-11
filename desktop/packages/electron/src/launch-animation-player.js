"use strict"
const params = new URLSearchParams(window.location.search)
const video = document.getElementById("scene")
const skip = document.getElementById("skip")
const disable = document.getElementById("disable")
let finished = false
function finish(reason) {
  if (finished) return
  finished = true
  video.pause()
  window.launchAnimation.finish(reason, video.getVideoPlaybackQuality?.().totalVideoFrames || 0)
}
skip.textContent = params.get("skip") || "Skip animation"
disable.textContent = params.get("disable") || "Disable animations"
document.getElementById("status").textContent = params.get("status") || ""
skip.addEventListener("click", () => finish("skip"))
disable.addEventListener("click", () => finish("disabled"))
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault()
    finish("skip")
  }
})
video.addEventListener("ended", () => finish("ended"))
video.addEventListener("error", () => finish("error"))
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
reducedMotion.addEventListener("change", (event) => {
  if (event.matches) finish("reduced-motion")
})
const clip = params.get("clip") || ""
if (reducedMotion.matches) finish("reduced-motion")
else if (!/^[a-z0-9-]+\.webm$/.test(clip)) finish("error")
else {
  video.src = clip
  video.play().catch(() => finish("error"))
}
