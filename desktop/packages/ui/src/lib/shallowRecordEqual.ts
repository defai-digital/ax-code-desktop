/** Own enumerable string keys and shallow values; nested objects keep reference identity. */
export const shallowRecordEqual = (
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean => {
  if (left === right) return true
  if (!left || !right) return false
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key) || !Object.is(left[key], right[key])) return false
  }
  return true
}
