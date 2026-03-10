import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dashsnap', {
  invoke: (channel: string, ...args: unknown[]) => {
    const allowedInvoke = [
      'browser:get-url',
      'flow:save', 'flow:load', 'flow:export', 'flow:import',
      'pptx:build',
      'settings:load', 'settings:save', 'settings:browse-template', 'settings:browse-folder',
      'app:get-version', 'app:open-path', 'app:open-external', 'app:list-outputs',
    ];
    if (allowedInvoke.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`IPC invoke not allowed: ${channel}`));
  },

  send: (channel: string, ...args: unknown[]) => {
    const allowedSend = [
      'browser:navigate', 'browser:back', 'browser:forward', 'browser:reload',
      'recorder:start-click', 'recorder:start-snap', 'recorder:start-screenshot', 'recorder:stop',
      'flow:run', 'flow:run-step', 'flow:stop',
      'app:check-update', 'app:install-update', 'app:download-update',
      'sidebar:resize',
    ];
    if (allowedSend.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowedOn = [
      'browser:url-changed', 'browser:title-changed', 'browser:loading',
      'recorder:element-picked', 'recorder:region-selected', 'recorder:cancelled',
      'flow:progress',
      'app:update-checking', 'app:update-available', 'app:update-not-available',
      'app:update-download-progress', 'app:update-downloaded', 'app:update-download-complete',
      'app:update-error',
    ];
    if (allowedOn.includes(channel)) {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, handler);
      // Store reference for cleanup
      (callback as unknown as Record<string, unknown>).__handler = handler;
    }
  },

  off: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (callback as unknown as Record<string, unknown>).__handler as
      ((_event: Electron.IpcRendererEvent, ...args: unknown[]) => void) | undefined;
    if (handler) {
      ipcRenderer.removeListener(channel, handler);
    }
  },
});
