const { contextBridge, ipcRenderer } = require("electron")
contextBridge.exposeInMainWorld("nativeMarkdownBenchmark", {
  parse: (request) => ipcRenderer.invoke("benchmark:markdown", request),
})
