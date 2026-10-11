/**
 * JSON Tree utilities for interactive JSON viewing.
 * Provides parsing, tree building, flattening, and path utilities.
 */

export type JsonTreeNodeType = "object" | "array" | "string" | "number" | "boolean" | "null"

export interface JsonTreeNode {
  id: string
  key: string
  value: unknown
  type: JsonTreeNodeType
  depth: number
  children?: JsonTreeNode[]
  path: string[]
  isExpandable: boolean
  childCount?: number
}

export interface FlatJsonNode {
  node: JsonTreeNode
  isExpanded: boolean
}

interface JsonTreeOptions {
  maxDepth?: number
  maxNodes?: number
  initiallyExpandedDepth?: number
}

const DEFAULT_OPTIONS: Required<JsonTreeOptions> = {
  maxDepth: 50,
  maxNodes: 100_000,
  initiallyExpandedDepth: 2,
}

function getType(value: unknown): JsonTreeNodeType {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "object") return "object"
  if (typeof value === "string") return "string"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  return "null"
}

function getNodePath(pathSegments: string[]): string {
  if (pathSegments.length === 0) return "root"
  let result = "root"
  for (const segment of pathSegments) {
    if (/^\d+$/.test(segment)) {
      result += `[${segment}]`
    } else {
      result += `.${segment}`
    }
  }
  return result
}

/** Build directly from parsed JSON without serializing and reparsing it. */
export function buildJsonTree(data: unknown, options?: JsonTreeOptions): JsonTreeNode | null {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let nodeCount = 0
  const ancestors = new WeakSet<object>()

  function build(value: unknown, key: string, path: string[], depth: number): JsonTreeNode | null {
    if (nodeCount >= opts.maxNodes) return null
    nodeCount++
    const type = getType(value)
    const isExpandable = type === "object" || type === "array"
    const node: JsonTreeNode = {
      id: getNodePath(path), key, value, type, depth, path, isExpandable,
    }
    if (!isExpandable) return node

    const object = value as object
    if (ancestors.has(object)) throw new Error("JSON tree cannot contain cycles")
    const keys = type === "object" ? Object.keys(object) : null
    const count = keys ? keys.length : (value as unknown[]).length
    node.childCount = count
    if (depth >= opts.maxDepth) return node

    node.children = []
    ancestors.add(object)
    try {
      // Stop before reading or allocating entries outside the retained node budget.
      for (let index = 0; index < count && nodeCount < opts.maxNodes; index++) {
        const childKey = keys ? keys[index] : String(index)
        const childValue = (value as Record<string, unknown>)[childKey]
        const child = build(childValue, childKey, [...path, childKey], depth + 1)
        if (child) node.children.push(child)
      }
    } finally {
      ancestors.delete(object)
    }
    return node
  }

  try {
    if (data === undefined || typeof data === "bigint" || typeof data === "function" || typeof data === "symbol") {
      return null
    }
    return build(data, "root", [], 0)
  } catch {
    return null
  }
}

export function parseJsonToTree(text: string, options?: JsonTreeOptions): JsonTreeNode | null {
  try {
    const trimmed = text.trim()
    return trimmed ? buildJsonTree(JSON.parse(trimmed), options) : null
  } catch {
    return null
  }
}

export function flattenTree(root: JsonTreeNode | null, collapsedPaths: Set<string>): FlatJsonNode[] {
  if (!root) return []

  const result: FlatJsonNode[] = []

  function walk(node: JsonTreeNode) {
    const isExpanded = !collapsedPaths.has(node.id)
    result.push({ node, isExpanded })

    if (node.isExpandable && isExpanded && node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(root)
  return result
}

export function getAllExpandableIds(root: JsonTreeNode | null): string[] {
  if (!root) return []
  const ids: string[] = []

  function walk(node: JsonTreeNode) {
    if (node.isExpandable) {
      ids.push(node.id)
      if (node.children) {
        for (const child of node.children) {
          walk(child)
        }
      }
    }
  }

  walk(root)
  return ids
}

export function getExpandableIdsAboveDepth(root: JsonTreeNode | null, maxDepth: number): string[] {
  if (!root) return []
  const ids: string[] = []

  function walk(node: JsonTreeNode) {
    if (node.isExpandable && node.depth >= maxDepth) {
      ids.push(node.id)
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(root)
  return ids
}
