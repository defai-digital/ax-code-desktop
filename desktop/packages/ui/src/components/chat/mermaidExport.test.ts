import { expect, test } from "vitest"
import { getMermaidExportSize } from "./mermaidExport"

const svg = (viewBox: string) => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  element.setAttribute("viewBox", viewBox)
  return element
}

test("exports at 2x resolution while bounding large-diagram canvas memory", () => {
  expect(getMermaidExportSize(svg("0 0 300 200"))).toEqual({ width: 600, height: 400 })
  const size = getMermaidExportSize(svg("0 0 100000 20000"))
  expect(size.width).toBeLessThanOrEqual(8192)
  expect(size.width * size.height).toBeLessThanOrEqual(16_000_000)
  expect(size.width / size.height).toBeCloseTo(5, 1)
})

test.each(["0 0 0 10", "0 0 -10 10", "0 0 NaN 10", "0 0 Infinity 10"])("rejects invalid dimensions: %s", (viewBox) => {
  expect(() => getMermaidExportSize(svg(viewBox))).toThrow("no usable dimensions")
})
