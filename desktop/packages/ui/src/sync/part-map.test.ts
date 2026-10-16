import { describe, expect, it } from "vitest"
import type { Part } from "@defai-digital/ax-code-sdk/v2/client"
import { PartMap } from "./part-map"

const part = (id: string, text = ""): Part => ({ id, type: "text", text }) as unknown as Part

describe("PartMap", () => {
  it("reads, counts and iterates what was set", () => {
    const map = PartMap.EMPTY.fork()
      .set("msg_a", [part("p1")])
      .set("msg_b", [part("p2")])
      .seal()

    expect(map.size).toBe(2)
    expect(map.get("msg_a")?.[0].id).toBe("p1")
    expect(map.get("msg_missing")).toBeUndefined()
    expect(map.has("msg_b")).toBe(true)
    expect(map.has("msg_missing")).toBe(false)
    expect([...map.keys()].sort()).toEqual(["msg_a", "msg_b"])
    expect([...map].map(([id]) => id).sort()).toEqual(["msg_a", "msg_b"])
    expect(Object.keys(map.toRecord()).sort()).toEqual(["msg_a", "msg_b"])
  })

  it("never changes the map it was forked from", () => {
    const base = PartMap.from({ msg_a: [part("p1")], msg_b: [part("p2")] })
    const draft = base.fork()
    draft.set("msg_a", [part("p1", "changed")])
    draft.set("msg_c", [part("p3")])
    draft.delete("msg_b")

    expect(base.size).toBe(2)
    expect((base.get("msg_a")?.[0] as { text?: string }).text).toBe("")
    expect(base.has("msg_b")).toBe(true)
    expect(base.has("msg_c")).toBe(false)
    expect(draft.size).toBe(2)
    expect((draft.get("msg_a")?.[0] as { text?: string }).text).toBe("changed")
    expect(draft.has("msg_b")).toBe(false)
    expect(draft.has("msg_c")).toBe(true)
  })

  it("shares untouched parts and buckets between a draft and its source", () => {
    const untouched = [part("p-untouched")]
    const base = PartMap.from({ msg_a: [part("p1")], "msg_z-other": untouched })
    const draft = base.fork().set("msg_a", [part("p1", "x")])

    expect(draft.get("msg_z-other")).toBe(untouched)
  })

  it("keeps the count right across overwrite, delete of a missing id and delete", () => {
    const draft = PartMap.EMPTY.fork()
    draft.set("msg_a", [part("p1")])
    draft.set("msg_a", [part("p2")])
    expect(draft.size).toBe(1)
    expect(draft.delete("msg_missing")).toBe(false)
    expect(draft.size).toBe(1)
    expect(draft.delete("msg_a")).toBe(true)
    expect(draft.size).toBe(0)
    expect([...draft.keys()]).toEqual([])
    draft.set("msg_a", [part("p3")])
    expect(draft.get("msg_a")?.[0].id).toBe("p3")
  })

  it("refuses writes once sealed, and the shared empty map stays empty", () => {
    const sealed = PartMap.from({ msg_a: [part("p1")] })
    expect(() => sealed.set("msg_b", [])).toThrow(/read-only/)
    expect(() => sealed.delete("msg_a")).toThrow(/read-only/)
    expect(() => PartMap.EMPTY.set("msg_a", [])).toThrow(/read-only/)
    expect(PartMap.EMPTY.size).toBe(0)
  })

  it("handles ids that share a bucket, empty ids and a large population", () => {
    const draft = PartMap.EMPTY.fork()
    const ids = Array.from({ length: 5000 }, (_, i) => `msg_${i}_${"x".repeat(i % 3)}`)
    ids.forEach((id, i) => draft.set(id, [part(`p${i}`)]))
    draft.set("", [part("empty-id")])
    const map = draft.seal()

    expect(map.size).toBe(5001)
    expect(map.get("")?.[0].id).toBe("empty-id")
    ids.forEach((id, i) => expect(map.get(id)?.[0].id).toBe(`p${i}`))
    expect(new Set(map.keys()).size).toBe(5001)
  })

  it("spreads random-suffix ids across many buckets", () => {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    let seed = 42
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
    const ids = Array.from(
      { length: 2000 },
      () => `msg_z019aa5f0${Array.from({ length: 14 }, () => alphabet[next() % 62]).join("")}`,
    )
    const base = PartMap.from(ids.map((id) => [id, [part(id)]] as const))
    // Touching one message must copy one bucket: the rest stay shared with the base.
    const draft = base.fork().set(ids[0], [part("changed")])
    let shared = 0
    for (const id of ids.slice(1)) if (draft.get(id) === base.get(id)) shared += 1
    expect(shared).toBe(1999)
    // Distribution: no bucket should hold a large share of 2,000 random ids.
    const counts = new Map<number, number>()
    const buckets = (base as unknown as { buckets: Array<Map<string, unknown> | undefined> }).buckets
    buckets.forEach((bucket, index) => bucket && counts.set(index, bucket.size))
    expect(Math.max(...counts.values())).toBeLessThan(40)
    expect(counts.size).toBeGreaterThan(200)
  })
})
