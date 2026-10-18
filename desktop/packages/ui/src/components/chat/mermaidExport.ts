import { sanitizeMermaidSvg } from "./sanitizeSvg"

export function downloadMermaidBlob(blob: Blob, extension: "svg" | "png") {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `diagram-${Date.now()}.${extension}`
  document.body.append(link)
  link.click()
  link.remove()
  // Keep the URL alive until the browser has consumed the download navigation.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function getMermaidExportSize(svg: SVGSVGElement) {
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  const width = viewBox?.[2] ?? Number.parseFloat(svg.getAttribute("width") ?? "")
  const height = viewBox?.[3] ?? Number.parseFloat(svg.getAttribute("height") ?? "")
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Diagram has no usable dimensions")
  }
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(16_000_000 / (width * height)))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

export async function mermaidSvgToPng(svgText: string, background: string): Promise<Blob> {
  const document = new DOMParser().parseFromString(sanitizeMermaidSvg(svgText), "image/svg+xml")
  const svg = document.querySelector("svg")
  if (!svg || document.querySelector("parsererror")) throw new Error("Invalid diagram SVG")
  const size = getMermaidExportSize(svg)
  svg.setAttribute("width", String(size.width))
  svg.setAttribute("height", String(size.height))
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = globalThis.document.createElement("canvas")
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Image export is unavailable")
    context.fillStyle = background
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(image, 0, 0, size.width, size.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to encode PNG"))), "image/png")
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
