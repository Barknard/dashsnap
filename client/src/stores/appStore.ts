import { create } from 'zustand';
import type { RunProgress, AppSettings } from '@shared/types';
import { settings as settingsIpc, app as appIpc } from '@/lib/ipc';

interface AppStore {
  // Browser
  browserUrl: string;
  browserTitle: string;
  setBrowserUrl: (url: string) => void;
  setBrowserTitle: (title: string) => void;

  // Recording
  isRecording: boolean;
  recordingType: 'click' | 'snap' | null;
  startRecording: (type: 'click' | 'snap') => void;
  stopRecording: () => void;

  // Run state
  runProgress: RunProgress | null;
  isRunning: boolean;
  setRunProgress: (progress: RunProgress | null) => void;

  // Settings
  settings: AppSettings;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;

  // App info
  version: string;
  updateAvailable: string | null;
  updateReleaseUrl: string | null;
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  updateProgress: number;
  updateError: string | null;
  setVersion: (v: string) => void;
  setUpdateAvailable: (v: string | null, releaseUrl?: string) => void;
  setUpdateStatus: (status: AppStore['updateStatus']) => void;
  setUpdateProgress: (percent: number) => void;
  setUpdateError: (err: string | null) => void;

  // UI
  activeTab: 'record' | 'run' | 'output';
  setActiveTab: (tab: 'record' | 'run' | 'output') => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

const defaultSettings: AppSettings = {
  browserProfilePath: '',
  outputPath: '',
  startUrl: 'about:blank',
  theme: 'dark',
  showTips: true,
  sidebarWidth: 380,
};

export const useAppStore = create<AppStore>((set, get) => ({
  // Browser
  browserUrl: 'about:blank',
  browserTitle: '',
  setBrowserUrl: (url: string) => set({ browserUrl: url }),
  setBrowserTitle: (title: string) => set({ browserTitle: title }),

  // Recording
  isRecording: false,
  recordingType: null,
  startRecording: (type) => set({ isRecording: true, recordingType: type }),
  stopRecording: () => set({ isRecording: false, recordingType: null }),

  // Run state
  runProgress: null,
  isRunning: false,
  setRunProgress: (progress) => set({
    runProgress: progress,
    isRunning: progress ? progress.status === 'running' : false,
  }),

  // Settings
  settings: defaultSettings,
  loadSettings: async () => {
    try {
      const loaded = (await settingsIpc.load()) as AppSettings;
      if (loaded) set({ settings: { ...defaultSettings, ...loaded } });
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },
  saveSettings: async (updates) => {
    const merged = { ...get().settings, ...updates };
    set({ settings: merged });
    try {
      await settingsIpc.save(merged);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  },

  // App info
  version: '1.0.0',
  updateAvailable: null,
  updateReleaseUrl: null,
  updateStatus: 'idle',
  updateProgress: 0,
  updateError: null,
  setVersion: (v) => set({ version: v }),
  setUpdateAvailable: (v, releaseUrl) => set({ updateAvailable: v, updateReleaseUrl: releaseUrl || null, updateStatus: 'available' }),
  setUpdateStatus: (status) => set({ updateStatus: status }),
  setUpdateProgress: (percent) => set({ updateProgress: percent, updateStatus: 'downloading' }),
  setUpdateError: (err) => set({ updateError: err, updateStatus: 'error' }),

  // UI
  activeTab: 'record',
  setActiveTab: (tab) => set({ activeTab: tab }),
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),
}));
