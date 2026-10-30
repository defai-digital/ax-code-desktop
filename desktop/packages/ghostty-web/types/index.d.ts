// Type entry for consumers. It pulls the runtime-global declarations into every program that imports this package, so
// a consumer type-checking lib/ (which is source, not a declaration bundle) needs no Bun types of its own.
/// <reference path="./runtime-globals.d.ts" />
export * from "../lib/index"
