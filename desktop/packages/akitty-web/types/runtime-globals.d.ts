// lib/ghostty.ts probes for the Bun runtime before falling back to Node's fs and then fetch. Upstream type-checks with
// bun-types; this package does not depend on Bun, so declare only the surface that probe touches.
declare const Bun:
  | {
      file(path: string): { exists(): Promise<boolean>; arrayBuffer(): Promise<ArrayBuffer> }
    }
  | undefined
