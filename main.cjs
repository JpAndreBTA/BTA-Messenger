const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
  shell,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

const APP_ORIGIN = "https://engine.btastudio.com";
const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const CAPTURE_PERMISSIONS = new Set([
  "media",
  "display-capture",
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
]);

let mainWindow = null;
let capturePicker = null;
let pendingCapture = null;
let updateStatus = { state: "idle" };
let updateInstalling = false;

function publishUpdateStatus(nextStatus) {
  updateStatus = nextStatus;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app-update:status", nextStatus);
  }
}

function configureAutoUpdates() {
  // Development runs intentionally never contact the release service. A
  // packaged app performs this setup exactly once during each launch.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    publishUpdateStatus({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    publishUpdateStatus({ state: "downloading", version: info.version, percent: 0 });
  });
  autoUpdater.on("download-progress", (progress) => {
    publishUpdateStatus({
      state: "downloading",
      version: updateStatus.version,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    });
  });
  autoUpdater.on("update-not-available", () => {
    publishUpdateStatus({ state: "idle" });
  });
  autoUpdater.on("update-downloaded", (info) => {
    publishUpdateStatus({ state: "downloaded", version: info.version, percent: 100 });
  });
  autoUpdater.on("error", (error) => {
    console.error("Desktop update failed", error);
    // Update failures stay silent in the UI so a temporary network problem
    // never interrupts a call or prevents the Messenger from opening.
    publishUpdateStatus({ state: "error" });
  });

  // Deliberately no interval and no checkForUpdatesAndNotify: one check per
  // process launch, with the installer started only by the user's button.
  void autoUpdater.checkForUpdates();
}

function configureUpdateInstall() {
  ipcMain.handle("app-update:get-status", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return { state: "idle" };
    return updateStatus;
  });
  ipcMain.handle("app-update:install", (event) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return false;
    if (updateStatus.state !== "downloaded" || updateInstalling) return false;
    updateInstalling = true;
    publishUpdateStatus({ state: "installing", version: updateStatus.version, percent: 100 });
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
}

function configureWindowFullscreen() {
  const setWindowFullscreen = (event, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
    mainWindow.setFullScreen(Boolean(enabled));
    return true;
  };
  // Keep the original call channel for already-installed 0.1.0 clients while
  // exposing one generic channel for games and future immersive surfaces.
  ipcMain.handle("window:set-fullscreen", setWindowFullscreen);
  ipcMain.handle("call-window:set-fullscreen", setWindowFullscreen);
}

function parsedUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedOrigin(value) {
  const url = parsedUrl(value);
  return Boolean(url && (url.origin === APP_ORIGIN || LOCAL_ORIGINS.has(url.origin)));
}

function isSafeExternalUrl(value) {
  const url = parsedUrl(value);
  return Boolean(url && ["https:", "http:"].includes(url.protocol));
}

function openExternal(value) {
  if (isSafeExternalUrl(value)) void shell.openExternal(value);
}

function configurePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isAllowedOrigin(requestingOrigin) && CAPTURE_PERMISSIONS.has(permission);
  });
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isAllowedOrigin(webContents?.getURL() || "") && CAPTURE_PERMISSIONS.has(permission));
  });
}

function serialiseSources(sources) {
  return sources.map((source) => ({
    id: source.id,
    kind: source.id.startsWith("screen:") ? "screen" : "window",
    name: source.name,
    thumbnail: source.thumbnail?.toDataURL() || "",
    appIcon: source.appIcon?.toDataURL() || "",
  }));
}

function closeCapturePicker(result = null) {
  const request = pendingCapture;
  pendingCapture = null;
  if (capturePicker && !capturePicker.isDestroyed()) capturePicker.close();
  capturePicker = null;
  request?.resolve(result);
}

async function chooseCaptureSource(sources) {
  if (pendingCapture) return null;
  return new Promise((resolve) => {
    pendingCapture = { resolve };
    capturePicker = new BrowserWindow({
      width: 920,
      height: 620,
      minWidth: 620,
      minHeight: 420,
      title: "Escolha o que compartilhar",
      parent: mainWindow || undefined,
      modal: Boolean(mainWindow),
      resizable: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "picker-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    capturePicker.on("closed", () => {
      capturePicker = null;
      if (pendingCapture) {
        const request = pendingCapture;
        pendingCapture = null;
        request.resolve(null);
      }
    });
    void capturePicker.loadFile(path.join(__dirname, "capture-picker.html"));
    capturePicker.webContents.once("did-finish-load", () => {
      if (!capturePicker || capturePicker.isDestroyed()) return;
      capturePicker.webContents.send("capture-picker:sources", serialiseSources(sources));
    });
  });
}

function configureDisplayCapture() {
  ipcMain.on("capture-picker:select", (event, sourceId) => {
    if (!capturePicker || event.sender !== capturePicker.webContents || !pendingCapture) return;
    const source = String(sourceId || "");
    if (!source || source.length > 200) return;
    closeCapturePicker(source);
  });
  ipcMain.on("capture-picker:cancel", (event) => {
    if (!capturePicker || event.sender !== capturePicker.webContents) return;
    closeCapturePicker(null);
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isAllowedOrigin(request.securityOrigin)) return callback(null);
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });
      const selectedId = await chooseCaptureSource(sources);
      const selected = sources.find((source) => source.id === selectedId);
      if (!selected) return callback(null);

      // Windows loopbackWithMute keeps captured system audio separate from the
      // microphone and mutes the local loopback while it is being captured.
      // This prevents the sharer from sending the call's own output back to
      // participants. The web fallback remains responsible for microphone
      // echo cancellation when the operating system cannot provide loopback.
      const systemAudio = process.platform === "win32" && request.audioRequested
        ? "loopbackWithMute"
        : undefined;
      return callback({
        video: selected,
        ...(systemAudio ? { audio: systemAudio } : {}),
      });
    } catch (error) {
      console.error("Display capture failed", error);
      return callback(null);
    }
  });
}

function configureNavigation(contents) {
  contents.on("will-navigate", (event, navigationUrl) => {
    if (isAllowedOrigin(navigationUrl)) return;
    event.preventDefault();
    openExternal(navigationUrl);
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedOrigin(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0c0f14",
    title: "BTA Messenger",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  configureNavigation(mainWindow.webContents);
  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app-update:status", updateStatus);
    }
  });
  mainWindow.on("enter-full-screen", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window:fullscreen-changed", true);
      mainWindow.webContents.send("call-window:fullscreen-changed", true);
    }
  });
  mainWindow.on("leave-full-screen", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("window:fullscreen-changed", false);
      mainWindow.webContents.send("call-window:fullscreen-changed", false);
    }
  });
  // Keep the desktop client visually and behaviorally identical to the web
  // Messenger. Authentication, themes, buttons and synchronization all come
  // from the same official application route.
  void mainWindow.loadURL(`${APP_ORIGIN}/chat`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  configurePermissions();
  configureDisplayCapture();
  configureUpdateInstall();
  configureWindowFullscreen();
  app.on("web-contents-created", (_event, contents) => configureNavigation(contents));
  createMainWindow();
  configureAutoUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
