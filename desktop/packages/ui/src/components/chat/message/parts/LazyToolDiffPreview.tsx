import React from "react"
import { lazyWithChunkRecovery } from "@/lib/chunkLoadRecovery"
import { PlainDiffFallback } from "./PlainDiffFallback"
import type { DiffViewMode } from "../types"

export interface ToolDiffPreviewProps {
  diff: string
  diffViewMode: DiffViewMode
}

const ToolDiffPreview = lazyWithChunkRecovery(() =>
  import("./ToolDiffPreview").then((module) => ({ default: module.ToolDiffPreview })),
)

export const LazyToolDiffPreview: React.FC<ToolDiffPreviewProps> = (props) => (
  <React.Suspense fallback={<PlainDiffFallback diff={props.diff} />}>
    <ToolDiffPreview {...props} />
  </React.Suspense>
)
