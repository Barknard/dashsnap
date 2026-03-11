/**
 * Type-safe IPC bridge for communicating with Electron main process.
 * Falls back gracefully when running in a regular browser (dev mode).
 */

interface DashSnapBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
  send: (channel: string, ...args: unknown[]) => void;
}

declare global {
  interface Window {
    dashsnap?: DashSnapBridge;
  }
}

const isElectron = typeof window !== 'undefined' && !!window.dashsnap;

function warnNotElectron(channel: string) {
  console.warn(`[DashSnap IPC] Not in Electron — skipping "${channel}"`);
}

// ─── Browser Control ────────────────────────────────────────────────────────

export const browser = {
  navigate: (url: string) => {
    if (!isElectron) { warnNotElectron('browser:navigate'); return; }
    window.dashsnap!.send('browser:navigate', url);
  },
  back: () => {
    if (!isElectron) return;
    window.dashsnap!.send('browser:back');
  },
  forward: () => {
    if (!isElectron) return;
    window.dashsnap!.send('browser:forward');
  },
  reload: () => {
    if (!isElectron) return;
    window.dashsnap!.send('browser:reload');
  },
  getUrl: async (): Promise<string> => {
    if (!isElectron) return 'https://example.com';
    return (await window.dashsnap!.invoke('browser:get-url')) as string;
  },
  onUrlChanged: (cb: (url: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('browser:url-changed', cb as (...args: unknown[]) => void);
  },
  offUrlChanged: (cb: (url: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.off('browser:url-changed', cb as (...args: unknown[]) => void);
  },
  onTitleChanged: (cb: (title: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('browser:title-changed', cb as (...args: unknown[]) => void);
  },
  highlightElement: (selector: string) => {
    if (!isElectron) return;
    window.dashsnap!.send('browser:highlight-element', selector);
  },
  clearHighlight: () => {
    if (!isElectron) return;
    window.dashsnap!.send('browser:clear-highlight');
  },
};

// ─── Recorder ───────────────────────────────────────────────────────────────

export const recorder = {
  startClick: () => {
    if (!isElectron) { warnNotElectron('recorder:start-click'); return; }
    window.dashsnap!.send('recorder:start-click');
  },
  startSnap: () => {
    if (!isElectron) { warnNotElectron('recorder:start-snap'); return; }
    window.dashsnap!.send('recorder:start-snap');
  },
  startScreenshot: () => {
    if (!isElectron) { warnNotElectron('recorder:start-screenshot'); return; }
    window.dashsnap!.send('recorder:start-screenshot');
  },
  startHover: () => {
    if (!isElectron) { warnNotElectron('recorder:start-hover'); return; }
    window.dashsnap!.send('recorder:start-hover');
  },
  startSelect: () => {
    if (!isElectron) { warnNotElectron('recorder:start-select'); return; }
    window.dashsnap!.send('recorder:start-select');
  },
  startType: () => {
    if (!isElectron) { warnNotElectron('recorder:start-type'); return; }
    window.dashsnap!.send('recorder:start-type');
  },
  startScrollElement: () => {
    if (!isElectron) { warnNotElectron('recorder:start-scroll-element'); return; }
    window.dashsnap!.send('recorder:start-scroll-element');
  },
  startSearchSelect: () => {
    if (!isElectron) { warnNotElectron('recorder:start-search-select'); return; }
    window.dashsnap!.send('recorder:start-search-select');
  },
  startFilter: () => {
    if (!isElectron) { warnNotElectron('recorder:start-filter'); return; }
    window.dashsnap!.send('recorder:start-filter');
  },
  startMacro: () => {
    if (!isElectron) { warnNotElectron('recorder:start-macro'); return; }
    window.dashsnap!.send('recorder:start-macro');
  },
  stop: () => {
    if (!isElectron) return;
    window.dashsnap!.send('recorder:stop');
  },
  onElementPicked: (cb: (data: { selector: string; label: string; strategy: string; xy: [number, number] }) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('recorder:element-picked', cb as (...args: unknown[]) => void);
  },
  offElementPicked: (cb: (...args: unknown[]) => void) => {
    if (!isElectron) return;
    window.dashsnap!.off('recorder:element-picked', cb);
  },
  onRegionSelected: (cb: (data: { x: number; y: number; width: number; height: number; preview?: string }) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('recorder:region-selected', cb as (...args: unknown[]) => void);
  },
  offRegionSelected: (cb: (...args: unknown[]) => void) => {
    if (!isElectron) return;
    window.dashsnap!.off('recorder:region-selected', cb);
  },
  onFilterRecorded: (cb: (data: {
    trigger: { selector: string; label: string; strategy: string; xy: [number, number] } | null;
    options: Array<{ selector: string; label: string; strategy: string; xy: [number, number] }>;
    apply: { selector: string; label: string; strategy: string; xy: [number, number] } | null;
  }) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('recorder:filter-recorded', cb as (...args: unknown[]) => void);
  },
  offFilterRecorded: (cb: (...args: unknown[]) => void) => {
    if (!isElectron) return;
    window.dashsnap!.off('recorder:filter-recorded', cb);
  },
  onMacroRecorded: (cb: (actions: Array<{
    selector?: string; selectorStrategy?: string; fallbackXY?: [number, number];
    label?: string; action: string; value?: string;
    scrollTarget?: { x: number; y: number; isPage: boolean };
    elementMeta?: { tagName: string; inputType?: string; placeholder?: string; options?: string[] };
  }>, startUrl: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('recorder:macro-recorded', cb as (...args: unknown[]) => void);
  },
  offMacroRecorded: (cb: (...args: unknown[]) => void) => {
    if (!isElectron) return;
    window.dashsnap!.off('recorder:macro-recorded', cb);
  },
  onCancelled: (cb: () => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('recorder:cancelled', cb as (...args: unknown[]) => void);
  },
};

// ─── Flow Management ────────────────────────────────────────────────────────

export const flow = {
  save: async (config: unknown) => {
    if (!isElectron) { console.log('[IPC Mock] Saving flows', config); return; }
    return window.dashsnap!.invoke('flow:save', config);
  },
  load: async () => {
    if (!isElectron) return { defaults: { stepWaitSeconds: 8, navigationTimeoutSeconds: 30 }, flows: [] };
    return window.dashsnap!.invoke('flow:load');
  },
  exportFlow: async (flowId: string) => {
    if (!isElectron) return;
    return window.dashsnap!.invoke('flow:export', flowId);
  },
  importFlow: async () => {
    if (!isElectron) return null;
    return window.dashsnap!.invoke('flow:import');
  },
  run: (flowId: string) => {
    if (!isElectron) { warnNotElectron('flow:run'); return; }
    window.dashsnap!.send('flow:run', flowId);
  },
  runStep: (flowId: string, stepIndex: number) => {
    if (!isElectron) return;
    window.dashsnap!.send('flow:run-step', flowId, stepIndex);
  },
  runBatch: (flowId: string, rows: Record<string, string>[]) => {
    if (!isElectron) { warnNotElectron('flow:run-batch'); return; }
    window.dashsnap!.send('flow:run-batch', flowId, rows);
  },
  browseCsv: async (): Promise<{ headers: string[]; rows: Record<string, string>[]; path: string } | null> => {
    if (!isElectron) return null;
    return (await window.dashsnap!.invoke('flow:browse-csv')) as { headers: string[]; rows: Record<string, string>[]; path: string } | null;
  },
  stop: () => {
    if (!isElectron) return;
    window.dashsnap!.send('flow:stop');
  },
  onProgress: (cb: (progress: unknown) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('flow:progress', cb as (...args: unknown[]) => void);
  },
  offProgress: (cb: (...args: unknown[]) => void) => {
    if (!isElectron) return;
    window.dashsnap!.off('flow:progress', cb);
  },
};

// ─── PPTX ───────────────────────────────────────────────────────────────────

export const pptx = {
  build: async (flowId: string, screenshots: Array<{ name: string; path: string }>): Promise<string> => {
    if (!isElectron) return '/mock/output.pptx';
    return (await window.dashsnap!.invoke('pptx:build', flowId, screenshots)) as string;
  },
};

// ─── Settings ───────────────────────────────────────────────────────────────

export const settings = {
  load: async () => {
    if (!isElectron) {
      return {
        browserProfilePath: '',
        outputPath: '',
        startUrl: 'about:blank',
        theme: 'dark' as const,
        showTips: true,
        sidebarWidth: 380,
      };
    }
    return window.dashsnap!.invoke('settings:load');
  },
  save: async (s: unknown) => {
    if (!isElectron) return;
    return window.dashsnap!.invoke('settings:save', s);
  },
  browseTemplate: async (): Promise<string | null> => {
    if (!isElectron) return null;
    return (await window.dashsnap!.invoke('settings:browse-template')) as string | null;
  },
  browseFolder: async (): Promise<string | null> => {
    if (!isElectron) return null;
    return (await window.dashsnap!.invoke('settings:browse-folder')) as string | null;
  },
};

// ─── App ────────────────────────────────────────────────────────────────────

export const app = {
  getVersion: async (): Promise<string> => {
    if (!isElectron) return '1.0.0-dev';
    return (await window.dashsnap!.invoke('app:get-version')) as string;
  },
  checkUpdate: () => {
    if (!isElectron) return;
    window.dashsnap!.send('app:check-update');
  },
  installUpdate: () => {
    if (!isElectron) return;
    window.dashsnap!.send('app:install-update');
  },
  downloadUpdate: () => {
    if (!isElectron) return;
    window.dashsnap!.send('app:download-update');
  },
  applyUpdate: (downloadedPath: string) => {
    if (!isElectron) return;
    window.dashsnap!.send('app:apply-update', downloadedPath);
  },
  onUpdateChecking: (cb: () => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-checking', cb as (...args: unknown[]) => void);
  },
  onUpdateAvailable: (cb: (version: string, releaseUrl?: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-available', cb as (...args: unknown[]) => void);
  },
  onUpdateNotAvailable: (cb: () => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-not-available', cb as (...args: unknown[]) => void);
  },
  onUpdateDownloadProgress: (cb: (percent: number) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-download-progress', cb as (...args: unknown[]) => void);
  },
  onUpdateDownloaded: (cb: () => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-downloaded', cb as (...args: unknown[]) => void);
  },
  onUpdateDownloadComplete: (cb: (filePath: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-download-complete', cb as (...args: unknown[]) => void);
  },
  onUpdateError: (cb: (message: string) => void) => {
    if (!isElectron) return;
    window.dashsnap!.on('app:update-error', cb as (...args: unknown[]) => void);
  },
  listOutputs: async (): Promise<Array<{ name: string; path: string; size: number; modified: number; type: string; dataUrl: string | null }>> => {
    if (!isElectron) return [];
    return (await window.dashsnap!.invoke('app:list-outputs')) as Array<{ name: string; path: string; size: number; modified: number; type: string; dataUrl: string | null }>;
  },
  openPath: async (path: string) => {
    if (!isElectron) return;
    return window.dashsnap!.invoke('app:open-path', path);
  },
  openExternal: async (url: string) => {
    if (!isElectron) return;
    return window.dashsnap!.invoke('app:open-external', url);
  },
};
