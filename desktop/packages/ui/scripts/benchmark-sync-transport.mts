/** Synthetic codec comparison using the workspace's published, pinned SDK. No runtime or network calls. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { cpus } from "node:os"
import {
  encodeAxCodeGrpcProtoMessage as encode,
  decodeAxCodeGrpcProtoMessage as decode,
} from "@defai-digital/ax-code-sdk/grpc/node"

const sdkPin = JSON.parse(readFileSync(new URL("../../../../config/ax-code-sdk.json", import.meta.url), "utf8"))
const installedSdk = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.resolve("@defai-digital/ax-code-sdk/grpc/node")), "utf8"),
)
assert.equal(installedSdk.version, sdkPin.version, "Installed SDK must match the configured benchmark pin")
const fixture = (sessions: number) => ({
  value: Array.from({ length: sessions }, (_, index) => ({
    id: `ses_${index}`,
    title: `Example coding session ${index}`,
    directory: "/workspace/example",
    time: { created: 1000000 + index, updated: 2000000 + index },
  })),
})
const cases = [
  {
    name: "text-delta",
    type: "RuntimeEvent",
    value: {
      type: "message.part.delta",
      properties: {
        sessionID: "ses_example",
        messageID: "msg_example",
        partID: "prt_example",
        field: "text",
        delta: "example token",
      },
    },
    iterations: 10000,
  },
  { name: "100-sessions", type: "JsonResponse", value: fixture(100), iterations: 200 },
]

console.log(
  JSON.stringify({
    schema: "ax-code-desktop.codec-benchmark.v1",
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    sdkVersion: installedSdk.version,
    warmupRounds: 1,
    measuredRounds: 5,
    scope:
      "Synthetic encode/decode only; excludes sockets, protocol framing, runtime, LLM, and rendering. JsonResponse uses a logical wrapper in both codecs.",
  }),
)

for (const { name, type, value, iterations } of cases) {
  const json = JSON.stringify(value)
  const protobuf = encode(type, value)
  assert.deepEqual(JSON.parse(json), value)
  assert.deepEqual(decode(type, protobuf), value)
  const samples = { json: [] as number[], protobuf: [] as number[] }
  for (let round = 0; round < 6; round++) {
    // Alternate ordering to reduce systematic warmup/order bias.
    const order = round % 2 ? (["protobuf", "json"] as const) : (["json", "protobuf"] as const)
    for (const codec of order) {
      const start = performance.now()
      let result: unknown
      for (let index = 0; index < iterations; index++) {
        result = codec === "json" ? JSON.parse(JSON.stringify(value)) : decode(type, encode(type, value))
      }
      const elapsed = ((performance.now() - start) * 1000) / iterations
      assert.deepEqual(result, value)
      if (round > 0) samples[codec].push(elapsed)
    }
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  console.log(
    JSON.stringify({
      name,
      protoMessage: type,
      iterationsPerRound: iterations,
      jsonPayloadBytes: Buffer.byteLength(json),
      protobufPayloadBytes: protobuf.byteLength,
      jsonRoundTripUs: median(samples.json),
      protobufRoundTripUs: median(samples.protobuf),
    }),
  )
}
