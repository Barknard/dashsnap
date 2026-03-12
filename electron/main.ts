import {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  dialog,
  shell,
  session,
  protocol,
  net,
} from 'electron';
import path from 'path';
import fs from 'fs';

// Heavy modules loaded lazily so the splash screen can paint first
type ConfigManager = import('./config-manager').ConfigManager;
type BrowserManager = import('./browser-manager').BrowserManager;
type Recorder = import('./recorder').Recorder;
type FlowRunner = import('./flow-runner').FlowRunner;
type PptxBuilder = import('./pptx-builder').PptxBuilder;

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
const TOOLBAR_HEIGHT = 44;
const MAIN_TAB_BAR_HEIGHT = 36;
let sidebarWidth = SIDEBAR_DEFAULT_WIDTH;
let browserViewHidden = false;

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

// ─── Prevent uncaught exceptions from crashing the app ──────────────────────

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Surface the error to the user instead of crashing
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update-error', `Error: ${err.message}`);
  }
});

// ─── Disable GPU cache (Windows permission issues) ──────────────────────────

app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ─── Register dsfile:// protocol for serving local images to renderer ───────

protocol.registerSchemesAsPrivileged([
  { scheme: 'dsfile', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } },
]);

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

function splashProgress(percent: number, message: string) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:progress', percent, message);
  }
}

function showSplash(): Promise<void> {
  return new Promise((resolve) => {
    splashWindow = new BrowserWindow({
      width: 320,
      height: 280,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      center: true,
      skipTaskbar: false,
      transparent: false,
      show: false,            // show after content is painted
      backgroundColor: '#13111C',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'splash-preload.cjs'),
      },
    });

    if (isDev) {
      splashWindow.loadFile(path.join(path.dirname(__dirname), 'client', 'splash.html'));
    } else {
      splashWindow.loadFile(path.join(__dirname, '../dist/splash.html'));
    }

    // Show and resolve once the HTML is painted
    splashWindow.once('ready-to-show', () => {
      splashWindow?.show();
      resolve();
    });

    splashWindow.once('closed', () => { splashWindow = null; });
  });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashProgress(100, 'Ready!');
    splashWindow.webContents.send('splash:closing');
    // Wait for fade-out animation then close
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
    }, 350);
  }
}

// ─── Create main window ─────────────────────────────────────────────────────

function createWindow() {
  const appDataPath = getAppDataPath();
  ensureDir(appDataPath);
  ensureDir(path.join(appDataPath, 'config'));
  ensureDir(path.join(appDataPath, 'output'));

  // Lazy-load heavy modules (deferred so splash can paint first)
  // Path is ./electron/* because TSC outputs to dist-electron/electron/
  // while Vite outputs main.cjs to dist-electron/
  const { ConfigManager: CM } = require('./electron/config-manager') as typeof import('./config-manager');
  const { BrowserManager: BM } = require('./electron/browser-manager') as typeof import('./browser-manager');
  const { Recorder: Rec } = require('./electron/recorder') as typeof import('./recorder');
  const { FlowRunner: FR } = require('./electron/flow-runner') as typeof import('./flow-runner');
  const { PptxBuilder: PB } = require('./electron/pptx-builder') as typeof import('./pptx-builder');

  // Initialize managers
  configManager = new CM(path.join(appDataPath, 'config'));
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

  splashProgress(40, 'Setting up browser...');

  // Redirect session storage to our stable data folder so cookies,
  // certificates, and auth tokens persist across launches
  app.setPath('sessionData', browserProfilePath);

  const persistSession = session.fromPartition('persist:dashsnap', {
    cache: true,
  });

  // Enable persistent cookie storage (don't treat all cookies as session-only)
  persistSession.cookies.flushStore().catch(() => {});

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

  splashProgress(55, 'Initializing modules...');

  // Initialize modules
  browserManager = new BM(browserView, mainWindow);
  recorder = new Rec(browserView, mainWindow);
  flowRunner = new FR(browserView, mainWindow, configManager);
  pptxBuilder = new PB(configManager);

  splashProgress(65, 'Loading interface...');

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
  if (browserViewHidden) {
    // Move off-screen when hidden so React content underneath is visible
    browserView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
    return;
  }
  const [width, height] = mainWindow.getContentSize();
  browserView.setBounds({
    x: sidebarWidth,
    y: TOOLBAR_HEIGHT + MAIN_TAB_BAR_HEIGHT,
    width: Math.max(0, width - sidebarWidth),
    height: Math.max(0, height - TOOLBAR_HEIGHT - MAIN_TAB_BAR_HEIGHT),
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
  ipcMain.on('browser:hide', () => {
    browserViewHidden = true;
    positionBrowserView();
  });
  ipcMain.on('browser:show', () => {
    browserViewHidden = false;
    positionBrowserView();
  });

  // Element highlight in BrowserView
  ipcMain.on('browser:highlight-element', (_e, selector: string) => {
    if (!browserView) return;
    browserView.webContents.executeJavaScript(`
      (function() {
        let h = document.getElementById('__dashsnap_step_highlight');
        if (!h) {
          h = document.createElement('div');
          h.id = '__dashsnap_step_highlight';
          h.style.cssText = 'position:fixed;z-index:2147483645;border:2px solid #7C5CFC;background:rgba(124,92,252,0.12);border-radius:3px;pointer-events:none;transition:all 0.15s ease;';
          document.body.appendChild(h);
        }
        const sel = '${selector.replace(/'/g, "\\'")}';
        const el = sel ? document.querySelector(sel) : null;
        if (el) {
          const r = el.getBoundingClientRect();
          h.style.display = 'block';
          h.style.left = r.left + 'px';
          h.style.top = r.top + 'px';
          h.style.width = r.width + 'px';
          h.style.height = r.height + 'px';
        } else {
          h.style.display = 'none';
        }
      })()
    `).catch(() => {});
  });
  ipcMain.on('browser:clear-highlight', () => {
    if (!browserView) return;
    browserView.webContents.executeJavaScript(`
      (function() {
        const h = document.getElementById('__dashsnap_step_highlight');
        if (h) h.style.display = 'none';
      })()
    `).catch(() => {});
  });

  // Recorder
  ipcMain.on('recorder:start-click', () => recorder?.startClickRecording());
  ipcMain.on('recorder:start-snap', () => recorder?.startSnapRecording());
  ipcMain.on('recorder:start-screenshot', () => recorder?.startScreenshotRecording());
  ipcMain.on('recorder:start-hover', () => recorder?.startHoverRecording());
  ipcMain.on('recorder:start-select', () => recorder?.startSelectRecording());
  ipcMain.on('recorder:start-type', () => recorder?.startTypeRecording());
  ipcMain.on('recorder:start-scroll-element', () => recorder?.startScrollElementRecording());
  ipcMain.on('recorder:start-search-select', () => recorder?.startClickRecording());
  ipcMain.on('recorder:start-filter', () => recorder?.startFilterRecording());
  ipcMain.on('recorder:start-macro', () => recorder?.startMacroRecording());
  ipcMain.on('recorder:stop', () => recorder?.stop());

  // Flow management
  ipcMain.handle('flow:save', (_e, config) => configManager?.saveFlows(config));
  ipcMain.handle('flow:load', () => configManager?.loadFlows());
  ipcMain.handle('flow:export', async (_e, flowId: string) => {
    const flows = configManager?.loadFlows();
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
  ipcMain.on('flow:run-batch', (_e, flowId: string, rows: Record<string, string>[]) =>
    flowRunner?.runBatch(flowId, rows));
  ipcMain.on('flow:stop', () => flowRunner?.stop());

  // CSV file picker for batch runs
  ipcMain.handle('flow:browse-csv', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      // Simple CSV parser: split lines, first line = headers
      const lines = raw.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return { headers: [], rows: [] };
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        return row;
      });
      return { headers, rows, path: result.filePaths[0] };
    } catch {
      return null;
    }
  });

  // PPTX
  ipcMain.handle('pptx:build', (_e, flowId: string, screenshots: Array<{ name: string; path: string; slideLayout?: import('../shared/types').PptxLayout }>) =>
    pptxBuilder?.build(flowId, screenshots));

  // Settings
  ipcMain.handle('settings:load', () => configManager?.loadSettings());
  ipcMain.handle('settings:save', (_e, settings) => {
    configManager?.saveSettings(settings);
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
      const { autoUpdater: au } = require('electron-updater') as typeof import('electron-updater');
      au.checkForUpdates().catch(() => {
        // electron-updater failed (portable build) — try GitHub API
        checkGitHubRelease();
      });
    } else {
      // Dev mode — just check GitHub
      checkGitHubRelease();
    }
  });
  ipcMain.on('app:install-update', () => {
    const { autoUpdater: au } = require('electron-updater') as typeof import('electron-updater');
    au.quitAndInstall(false, true);
  });
  ipcMain.on('app:download-update', () => {
    downloadGitHubUpdate();
  });
  ipcMain.on('app:apply-update', (_e, downloadedPath: string) => {
    applyPortableUpdate(downloadedPath);
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
    const outputDir = configManager?.loadSettings()?.outputPath ||
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

  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

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
let pendingDownloadVersion: string | null = null;

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
            pendingDownloadVersion = latest;
          } else {
            pendingDownloadUrl = null;
            pendingDownloadFilename = null;
            pendingDownloadVersion = null;
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

  // Download to temp so we can hot-swap later
  const tempDir = app.getPath('temp');
  const savePath = path.join(tempDir, `dashsnap-update-${pendingDownloadVersion || 'latest'}.exe`);

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
        let fileStream: fs.WriteStream;
        try {
          fileStream = fs.createWriteStream(savePath);
        } catch (fsErr) {
          mainWindow?.webContents.send('app:update-error', `Cannot write to ${savePath}: ${fsErr}`);
          return;
        }

        fileStream.on('error', (err) => {
          mainWindow?.webContents.send('app:update-error', `Write failed: ${err.message}`);
        });

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

// ─── Portable self-update ────────────────────────────────────────────────────

function applyPortableUpdate(downloadedExe: string) {
  const currentExe = process.execPath;

  // Only do the hot-swap for portable exe (not dev mode, not NSIS install)
  if (!app.isPackaged || !currentExe.toLowerCase().endsWith('.exe')) {
    mainWindow?.webContents.send('app:update-error', 'Self-update only works for portable exe');
    return;
  }

  if (!fs.existsSync(downloadedExe)) {
    mainWindow?.webContents.send('app:update-error', 'Downloaded update file not found');
    return;
  }

  // Write a batch script that:
  // 1. Waits for this process to exit
  // 2. Overwrites the current exe with the new one
  // 3. Relaunches the app
  // 4. Cleans up temp files and itself
  const tempDir = app.getPath('temp');
  const batchPath = path.join(tempDir, 'dashsnap-update.cmd');
  const vbsPath = path.join(tempDir, 'dashsnap-update.vbs');
  const pid = process.pid;

  // Batch script does the actual work
  const script = `@echo off
:waitloop
tasklist /FI "PID eq ${pid}" 2>NUL | find /I "${pid}" >NUL
if not errorlevel 1 (
  timeout /t 1 /nobreak >NUL
  goto waitloop
)
timeout /t 1 /nobreak >NUL
copy /Y "${downloadedExe}" "${currentExe}" >NUL
if errorlevel 1 exit /b 1
del /Q "${downloadedExe}" >NUL 2>&1
start "" "${currentExe}"
del /Q "${vbsPath.replace(/\\/g, '\\\\')}" >NUL 2>&1
(goto) 2>NUL & del /Q "%~f0"
`;

  // VBScript launcher runs the batch completely hidden (no terminal window)
  const vbs = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${batchPath.replace(/\\/g, '\\\\')}""", 0, False
`;

  fs.writeFileSync(batchPath, script, 'utf-8');
  fs.writeFileSync(vbsPath, vbs, 'utf-8');

  // Launch via wscript (completely invisible — no terminal at all)
  const { spawn } = require('child_process') as typeof import('child_process');
  spawn('wscript.exe', [vbsPath], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  // Quit the app so the batch script can replace the exe
  app.quit();
}

// ─── App lifecycle ──────────────────────────────────────────────────────────

// Show splash immediately, wait for it to paint, THEN load heavy modules
app.whenReady().then(async () => {
  // Handle dsfile:// protocol — serves local PNG files to the renderer
  protocol.handle('dsfile', (request) => {
    // dsfile:///C:/path/to/file.png → file:///C:/path/to/file.png
    const filePath = decodeURIComponent(request.url.replace('dsfile://', 'file://'));
    return net.fetch(filePath);
  });

  await showSplash();

  // Yield one tick so the splash is fully visible before blocking with imports
  await new Promise(r => setTimeout(r, 50));

  splashProgress(10, 'Loading configuration...');
  setupIPC();
  splashProgress(30, 'Creating window...');
  createWindow();
  splashProgress(80, 'Checking for updates...');
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Flush cookies to disk before quitting so auth persists
  const ses = session.fromPartition('persist:dashsnap');
  ses.cookies.flushStore().catch(() => {}).finally(() => app.quit());
});
