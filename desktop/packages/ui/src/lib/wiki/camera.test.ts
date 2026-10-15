import { describe, expect, test } from "vitest"

import { fitCamera, panCamera, zoomAt } from "./camera"

describe("wiki camera", () => {
  test("zoomAt keeps the world point under the anchor", () => {
    const camera = { x: 10, y: 20, scale: 1 }
    const anchorX = 110
    const anchorY = 70
    const worldX = (anchorX - camera.x) / camera.scale
    const worldY = (anchorY - camera.y) / camera.scale
    const next = zoomAt(camera, anchorX, anchorY, 2)
    expect((anchorX - next.x) / next.scale).toBeCloseTo(worldX)
    expect((anchorY - next.y) / next.scale).toBeCloseTo(worldY)
    expect(next.scale).toBe(2)
  })

  test("clamps the scale and pans without changing it", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0, 0, 40).scale).toBe(3)
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0, 0, 0).scale).toBe(0.05)
    expect(panCamera({ x: 1, y: 2, scale: 1.5 }, 4, -3)).toEqual({ x: 5, y: -1, scale: 1.5 })
  })

  test("fits bounds in the viewport", () => {
    const camera = fitCamera(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      200,
      100,
      0,
    )
    expect(camera.scale).toBe(2)
    expect(camera.x).toBe(0)
    expect(camera.y).toBe(0)
    expect(fitCamera([], 80, 40)).toEqual({ x: 40, y: 20, scale: 1 })
  })
})
