import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { validateAxEnginePin } = require("../desktop/packages/electron/src/ax-engine-install-env.js")
const pin = validateAxEnginePin(require("../config/ax-engine-runtime.json"))
console.log(`AX Engine runtime pin check passed (${pin.version}, official Apple Silicon archive).`)
