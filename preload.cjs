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

const callWindow = Object.freeze({
  setFullscreen(enabled) {
    return ipcRenderer.invoke("call-window:set-fullscreen", Boolean(enabled));
  },
  onFullscreenChange(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on("call-window:fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("call-window:fullscreen-changed", handler);
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
  callWindow,
}));
