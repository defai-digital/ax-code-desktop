// `new WeakRef(target)` is the language constructor, but CodeQL's externs model
// WeakRef as a zero-argument class and treat the target as unused. Omitting it
// throws TypeError and breaks deref identity. Reflect.construct still passes
// the target, and still uses a WeakRef global installed by a test.
export function weakRef<T extends object>(target: T): WeakRef<T> {
  return Reflect.construct(WeakRef, [target])
}
