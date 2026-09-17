const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("capturePicker", Object.freeze({
  onSources(callback) {
    const handler = (_event, sources) => callback(sources);
    ipcRenderer.on("capture-picker:sources", handler);
    return () => ipcRenderer.removeListener("capture-picker:sources", handler);
  },
  select(sourceId) {
    ipcRenderer.send("capture-picker:select", sourceId);
  },
  cancel() {
    ipcRenderer.send("capture-picker:cancel");
  },
}));
