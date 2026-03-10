import {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  dialog,
  shell,
  session,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import { ConfigManager } from './config-manager';
import { BrowserManager } from './browser-manager';
import { Recorder } from './recorder';
import { FlowRunner } from './flow-runner';
import { PptxBuilder } from './pptx-builder';

// ─── Globals ────────────────────────────────────────────────────────────────

let splashWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;
let configManager: ConfigManager;
let browserManager: BrowserManager;
let recorder: Recorder;
let flowRunner: FlowRunner;
let pptxBuilder: PptxBuilder;

const SIDEBAR_DEFAULT_WIDTH = 380;
let sidebarWidth = SIDEBAR_DEFAULT_WIDTH;

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

// ─── Disable GPU cache (Windows permission issues) ──────────────────────────

app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ─── Single instance lock ───────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── App paths ──────────────────────────────────────────────────────────────

function getAppDataPath(): string {
  // Default: Desktop/DashSnap_Data (always accessible, never in a temp folder)
  return path.join(app.getPath('desktop'), 'DashSnap_Data');
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ─── Splash screen ──────────────────────────────────────────────────────────

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    splashWindow.loadFile(path.join(path.dirname(__dirname), 'client', 'splash.html'));
  } else {
    splashWindow.loadFile(path.join(__dirname, '../dist/splash.html'));
  }

  splashWindow.once('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── Create main window ─────────────────────────────────────────────────────

function createWindow() {
  const appDataPath = getAppDataPath();
  ensureDir(appDataPath);
  ensureDir(path.join(appDataPath, 'config'));
  ensureDir(path.join(appDataPath, 'output'));

  // Initialize managers
  configManager = new ConfigManager(path.join(appDataPath, 'config'));
  const settings = configManager.loadSettings();
  sidebarWidth = settings.sidebarWidth || SIDEBAR_DEFAULT_WIDTH;

  // Restore window bounds
  const bounds = settings.windowBounds || { width: 1600, height: 900 };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1200,
    minHeight: 700,
    title: `DashSnap v${app.getVersion()}`,
    backgroundColor: '#13111C',
    titleBarStyle: 'default',
    darkTheme: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // ─── BrowserView for dashboard ────────────────────────────────────────

  const browserProfilePath = settings.browserProfilePath ||
    path.join(appDataPath, 'browser_profile');
  ensureDir(browserProfilePath);

  const persistSession = session.fromPartition('persist:dashsnap', {
    cache: true,
  });

  browserView = new BrowserView({
    webPreferences: {
      partition: 'persist:dashsnap',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setBrowserView(browserView);
  positionBrowserView();

  // Initialize modules
  browserManager = new BrowserManager(browserView, mainWindow);
  recorder = new Recorder(browserView, mainWindow);
  flowRunner = new FlowRunner(browserView, mainWindow, configManager);
  pptxBuilder = new PptxBuilder(configManager);

  // Load start URL
  const startUrl = settings.startUrl || 'about:blank';
  if (startUrl !== 'about:blank') {
    browserView.webContents.loadURL(startUrl);
  }

  // ─── Load React sidebar ───────────────────────────────────────────────

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173/');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
    // Close splash after a short delay so the main window is fully painted
    setTimeout(closeSplash, 500);
  });

  // ─── Window events ────────────────────────────────────────────────────

  mainWindow.on('resize', () => positionBrowserView());
  mainWindow.on('maximize', () => positionBrowserView());
  mainWindow.on('unmaximize', () => positionBrowserView());

  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      configManager.saveSettings({
        ...configManager.loadSettings(),
        windowBounds: bounds,
        sidebarWidth,
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    browserView = null;
  });
}

function positionBrowserView() {
  if (!mainWindow || !browserView) return;
  const [width, height] = mainWindow.getContentSize();
  browserView.setBounds({
    x: sidebarWidth,
    y: 0,
    width: Math.max(0, width - sidebarWidth),
    height,
  });
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

function setupIPC() {
  // Browser control
  ipcMain.on('browser:navigate', (_e, url: string) => browserManager?.navigate(url));
  ipcMain.on('browser:back', () => browserManager?.back());
  ipcMain.on('browser:forward', () => browserManager?.forward());
  ipcMain.on('browser:reload', () => browserManager?.reload());
  ipcMain.handle('browser:get-url', () => browserManager?.getUrl() || '');

  // Recorder
  ipcMain.on('recorder:start-click', () => recorder?.startClickRecording());
  ipcMain.on('recorder:start-snap', () => recorder?.startSnapRecording());
  ipcMain.on('recorder:start-screenshot', () => recorder?.startScreenshotRecording());
  ipcMain.on('recorder:stop', () => recorder?.stop());

  // Flow management
  ipcMain.handle('flow:save', (_e, config) => configManager.saveFlows(config));
  ipcMain.handle('flow:load', () => configManager.loadFlows());
  ipcMain.handle('flow:export', async (_e, flowId: string) => {
    const flows = configManager.loadFlows();
    const flow = flows.flows.find((f: { id: string }) => f.id === flowId);
    if (!flow || !mainWindow) return;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${flow.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`,
      filters: [{ name: 'Flow JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(flow, null, 2));
    }
  });
  ipcMain.handle('flow:import', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Flow JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    try {
      const data = fs.readFileSync(result.filePaths[0], 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  });

  // Flow execution
  ipcMain.on('flow:run', (_e, flowId: string) => flowRunner?.run(flowId));
  ipcMain.on('flow:run-step', (_e, flowId: string, stepIndex: number) =>
    flowRunner?.runSingleStep(flowId, stepIndex));
  ipcMain.on('flow:stop', () => flowRunner?.stop());

  // PPTX
  ipcMain.handle('pptx:build', (_e, flowId: string, screenshots: Array<{ name: string; path: string; slideLayout?: import('../shared/types').PptxLayout }>) =>
    pptxBuilder?.build(flowId, screenshots));

  // Settings
  ipcMain.handle('settings:load', () => configManager.loadSettings());
  ipcMain.handle('settings:save', (_e, settings) => {
    configManager.saveSettings(settings);
    // Apply sidebar width change
    if (settings.sidebarWidth && settings.sidebarWidth !== sidebarWidth) {
      sidebarWidth = settings.sidebarWidth;
      positionBrowserView();
    }
  });
  ipcMain.handle('settings:browse-template', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'PowerPoint Template', extensions: ['pptx'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.handle('settings:browse-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // App
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.on('app:check-update', () => {
    mainWindow?.webContents.send('app:update-checking');
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch(() => {
        // electron-updater failed (portable build) — try GitHub API
        checkGitHubRelease();
      });
    } else {
      // Dev mode — just check GitHub
      checkGitHubRelease();
    }
  });
  ipcMain.on('app:install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.on('app:download-update', () => {
    downloadGitHubUpdate();
  });
  ipcMain.handle('app:open-path', (_e, filePath: string) => {
    if (filePath) {
      shell.openPath(filePath);
    } else {
      shell.openPath(path.join(getAppDataPath(), 'output'));
    }
  });
  ipcMain.handle('app:open-external', (_e, url: string) => shell.openExternal(url));

  // List output files (screenshots + pptx)
  ipcMain.handle('app:list-outputs', () => {
    const outputDir = configManager.loadSettings().outputPath ||
      path.join(getAppDataPath(), 'output');
    if (!fs.existsSync(outputDir)) return [];
    const files = fs.readdirSync(outputDir)
      .filter(f => /\.(png|jpg|jpeg|pptx)$/i.test(f))
      .map(f => {
        const fullPath = path.join(outputDir, f);
        const stat = fs.statSync(fullPath);
        const isPng = /\.(png|jpg|jpeg)$/i.test(f);
        let dataUrl: string | null = null;
        // Inline small images as base64 for preview (under 500KB)
        if (isPng && stat.size < 512000) {
          const ext = path.extname(f).slice(1).toLowerCase();
          const mime = ext === 'jpg' ? 'jpeg' : ext;
          dataUrl = `data:image/${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
        }
        return {
          name: f,
          path: fullPath,
          size: stat.size,
          modified: stat.mtimeMs,
          type: isPng ? 'image' : 'pptx',
          dataUrl,
        };
      })
      .sort((a, b) => b.modified - a.modified); // newest first
    return files;
  });

  // Sidebar resize
  ipcMain.on('sidebar:resize', (_e, width: number) => {
    sidebarWidth = Math.max(300, Math.min(600, width));
    positionBrowserView();
  });
}

// ─── Auto-updater ───────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (isDev) return;

  // Try electron-updater first (works for NSIS installs)
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('app:update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('app:update-available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('app:update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('app:update-download-progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('app:update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
    // Fallback for portable: check GitHub API directly
    checkGitHubRelease();
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Portable exe can't auto-update, fall back to GitHub check
    checkGitHubRelease();
  });
}

// Store the download URL for the portable exe from the latest release
let pendingDownloadUrl: string | null = null;
let pendingDownloadFilename: string | null = null;

async function checkGitHubRelease() {
  try {
    const https = await import('https');
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Barknard/dashsnap/releases/latest',
      headers: { 'User-Agent': 'DashSnap/' + app.getVersion() },
    };
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latest = (release.tag_name || '').replace(/^v/, '');
          const current = app.getVersion();
          const releaseUrl = release.html_url || 'https://github.com/Barknard/dashsnap/releases/latest';

          // Find the portable exe or installer in assets
          const assets = release.assets || [];
          const portableAsset = assets.find((a: { name: string }) =>
            /portable/i.test(a.name) && a.name.endsWith('.exe')
          ) || assets.find((a: { name: string }) =>
            /setup/i.test(a.name) && a.name.endsWith('.exe')
          ) || assets.find((a: { name: string }) =>
            a.name.endsWith('.exe')
          );

          if (portableAsset) {
            pendingDownloadUrl = portableAsset.browser_download_url;
            pendingDownloadFilename = portableAsset.name;
          } else {
            pendingDownloadUrl = null;
            pendingDownloadFilename = null;
          }

          if (latest && latest !== current) {
            mainWindow?.webContents.send('app:update-available', latest, releaseUrl);
          } else {
            mainWindow?.webContents.send('app:update-not-available');
          }
        } catch {
          mainWindow?.webContents.send('app:update-error', 'Failed to parse release info');
        }
      });
    });
    req.on('error', (err) => {
      mainWindow?.webContents.send('app:update-error', String(err.message || err));
    });
  } catch (err) {
    mainWindow?.webContents.send('app:update-error', String(err));
  }
}

async function downloadGitHubUpdate() {
  if (!pendingDownloadUrl || !pendingDownloadFilename) {
    mainWindow?.webContents.send('app:update-error', 'No download URL available');
    return;
  }

  const downloadDir = app.getPath('downloads');
  const savePath = path.join(downloadDir, pendingDownloadFilename);

  mainWindow?.webContents.send('app:update-download-progress', 0);

  try {
    const https = await import('https');

    const download = (url: string) => {
      https.get(url, {
        headers: { 'User-Agent': 'DashSnap/' + app.getVersion() },
      }, (res) => {
        // Follow redirects (GitHub uses 302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            download(redirectUrl);
            return;
          }
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;
        const fileStream = fs.createWriteStream(savePath);

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          fileStream.write(chunk);
          if (totalBytes > 0) {
            const percent = Math.round((receivedBytes / totalBytes) * 100);
            mainWindow?.webContents.send('app:update-download-progress', percent);
          }
        });

        res.on('end', () => {
          fileStream.end();
          mainWindow?.webContents.send('app:update-download-complete', savePath);
          // Open the Downloads folder with the file selected
          shell.showItemInFolder(savePath);
        });

        res.on('error', (err) => {
          fileStream.end();
          mainWindow?.webContents.send('app:update-error', `Download failed: ${err.message}`);
        });
      }).on('error', (err) => {
        mainWindow?.webContents.send('app:update-error', `Download failed: ${err.message}`);
      });
    };

    download(pendingDownloadUrl);
  } catch (err) {
    mainWindow?.webContents.send('app:update-error', `Download failed: ${err}`);
  }
}

// ─── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Show splash immediately, then defer heavy work so the splash paints first
  showSplash();

  setTimeout(() => {
    setupIPC();
    createWindow();
    setupAutoUpdater();
  }, 100);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
