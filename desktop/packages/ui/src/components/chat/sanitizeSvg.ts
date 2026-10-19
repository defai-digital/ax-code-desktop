import DOMPurify from "dompurify"

// Defense-in-depth for LLM-generated mermaid diagrams: the SVG returned by
// either renderer is untrusted input. Sanitize before image display and export;
// the image document also isolates diagram styles and fragment identifiers.
export const sanitizeMermaidSvg = (svg: string): string => {
  const fragment = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "image", "feImage"],
    RETURN_DOM_FRAGMENT: true,
  })
  // Diagrams and exported images are self-contained. Preserve fragment references
  // used by markers/gradients, but never fetch external SVG resources or styles.
  const localCss = (value: string) =>
    /\\|(?:image-set|cross-fade|paint|image)\s*\(/i.test(value)
      ? ""
      : value
          .replace(/@import\b[^;]*(?:;|$)/gi, " ")
          .replace(/@font-face\s*\{[^}]*\}/gi, " ")
          .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote: string, url: string) =>
            /^#[\w:.-]+$/.test(url.trim()) ? `url(${url.trim()})` : "none",
          )
  for (const element of fragment.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (["href", "xlink:href", "src"].includes(attribute.name) && !attribute.value.startsWith("#")) {
        element.removeAttribute(attribute.name)
      } else if (attribute.name === "style" || /url\s*\(|@|\\/i.test(attribute.value)) {
        element.setAttribute(attribute.name, localCss(attribute.value))
      }
    }
    if (element.localName === "style") element.textContent = localCss(element.textContent ?? "")
  }
  // Official Mermaid emits percentage widths. Preserve intrinsic diagram size
  // instead of stretching a small chart to the entire conversation width.
  const svgRoot = fragment.querySelector("svg")
  const dimensions = svgRoot
    ?.getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    svgRoot &&
    dimensions?.length === 4 &&
    dimensions.every(Number.isFinite) &&
    dimensions[2] > 0 &&
    dimensions[3] > 0
  ) {
    svgRoot.setAttribute("width", String(dimensions[2]))
    svgRoot.setAttribute("height", String(dimensions[3]))
  }
  const container = document.createElement("div")
  container.append(fragment)
  return container.innerHTML
}
