const { contextBridge, ipcRenderer } = require("electron");

const update = Object.freeze({
  onStatus(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("app-update:status", handler);
    return () => ipcRenderer.removeListener("app-update:status", handler);
  },
  getStatus() {
    return ipcRenderer.invoke("app-update:get-status");
  },
  install() {
    return ipcRenderer.invoke("app-update:install");
  },
});

contextBridge.exposeInMainWorld("btaDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  separateSystemAudio: process.platform === "win32",
  localLoopbackMuted: process.platform === "win32",
  update,
}));
