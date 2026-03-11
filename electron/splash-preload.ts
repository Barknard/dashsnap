import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dashsnapSplash', {
  onProgress: (cb: (percent: number, message: string) => void) => {
    ipcRenderer.on('splash:progress', (_e, percent: number, message: string) => cb(percent, message));
  },
  onClosing: (cb: () => void) => {
    ipcRenderer.on('splash:closing', () => cb());
  },
});
