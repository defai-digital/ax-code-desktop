/** Explicit initialization shared by the public entry point and terminal instances. */
import { AkittyEngine } from './engine';
let current: AkittyEngine | undefined;
let loading: Promise<void> | undefined;
export function init(path?: string | URL): Promise<void> {
  if (current) return Promise.resolve();
  return loading ??= AkittyEngine.load(path).then(engine => { current = engine; }).catch(error => { loading = undefined; throw error; });
}
export function getEngine(): AkittyEngine {
  if (!current) throw new Error('AkiTTY is not initialized. Await init() or supply an engine to the Terminal constructor.');
  return current;
}
