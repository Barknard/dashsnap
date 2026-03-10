import { vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Electron IPC ───────────────────────────────────────────────────────

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
const ipcListeners = new Map<string, Array<(...args: unknown[]) => void>>();

export const mockIpcMain = {
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcHandlers.set(channel, handler);
  }),
  removeHandler: vi.fn((channel: string) => {
    ipcHandlers.delete(channel);
  }),
  on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    if (!ipcListeners.has(channel)) ipcListeners.set(channel, []);
    ipcListeners.get(channel)!.push(listener);
  }),
  removeAllListeners: vi.fn((channel?: string) => {
    if (channel) ipcListeners.delete(channel);
    else ipcListeners.clear();
  }),
};

export const mockIpcRenderer = {
  invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
    const handler = ipcHandlers.get(channel);
    if (handler) return handler({}, ...args);
    return undefined;
  }),
  send: vi.fn(),
  on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    if (!ipcListeners.has(channel)) ipcListeners.set(channel, []);
    ipcListeners.get(channel)!.push(listener);
    return mockIpcRenderer;
  }),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
};

// ─── Mock electron module ────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  ipcRenderer: mockIpcRenderer,
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData';
      if (name === 'documents') return '/mock/documents';
      if (name === 'temp') return '/mock/temp';
      return '/mock/' + name;
    }),
    getVersion: vi.fn(() => '1.0.0'),
    getName: vi.fn(() => 'DashSnap'),
    isReady: vi.fn(() => true),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    webContents: {
      send: vi.fn(),
      executeJavaScript: vi.fn(),
      on: vi.fn(),
    },
    on: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1920, height: 1080 })),
  })),
  BrowserView: vi.fn().mockImplementation(() => ({
    webContents: createMockWebContents(),
    setBounds: vi.fn(),
    setAutoResize: vi.fn(),
    destroy: vi.fn(),
  })),
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}));

// ─── Mock webContents factory ────────────────────────────────────────────────

export function createMockWebContents() {
  return {
    send: vi.fn(),
    executeJavaScript: vi.fn().mockResolvedValue(undefined),
    capturePage: vi.fn().mockResolvedValue({
      toPNG: vi.fn(() => Buffer.from('fake-png-data')),
      toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
      getSize: vi.fn(() => ({ width: 1920, height: 1080 })),
      crop: vi.fn().mockReturnValue({
        toPNG: vi.fn(() => Buffer.from('fake-cropped-png')),
      }),
      isEmpty: vi.fn(() => false),
    }),
    loadURL: vi.fn().mockResolvedValue(undefined),
    getURL: vi.fn(() => 'https://dashboard.example.com'),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setUserAgent: vi.fn(),
    session: {
      setProxy: vi.fn(),
    },
  };
}

// ─── Mock fs (node) ──────────────────────────────────────────────────────────

export const mockFs = {
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
  copyFileSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 1024 })),
};

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(async () => '{}'),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    readdir: vi.fn(async () => []),
    unlink: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ isFile: () => true, size: 1024 })),
    access: vi.fn(async () => undefined),
  },
  readFile: vi.fn(async () => '{}'),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  unlink: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ isFile: () => true, size: 1024 })),
  access: vi.fn(async () => undefined),
}));

// ─── Mock path (normalize for cross-platform) ───────────────────────────────

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    default: actual,
  };
});

// ─── DOM setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // Clear all IPC state
  ipcHandlers.clear();
  ipcListeners.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Global test utilities ───────────────────────────────────────────────────

export function simulateIpcEvent(channel: string, ...args: unknown[]) {
  const listeners = ipcListeners.get(channel);
  if (listeners) {
    listeners.forEach((listener) => listener(...args));
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
