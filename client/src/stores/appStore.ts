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
  recordingType: 'click' | 'snap' | 'screenshot' | 'hover' | 'select' | 'type' | 'scroll-element' | 'search-select' | 'filter' | 'macro' | null;
  startRecording: (type: 'click' | 'snap' | 'screenshot' | 'hover' | 'select' | 'type' | 'scroll-element' | 'search-select' | 'filter' | 'macro') => void;
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
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'download-complete' | 'up-to-date' | 'error';
  updateProgress: number;
  updateError: string | null;
  updateDownloadPath: string | null;
  setVersion: (v: string) => void;
  setUpdateAvailable: (v: string | null, releaseUrl?: string) => void;
  setUpdateStatus: (status: AppStore['updateStatus']) => void;
  setUpdateProgress: (percent: number) => void;
  setUpdateError: (err: string | null) => void;
  setUpdateDownloadComplete: (filePath: string) => void;

  // UI
  activeTab: 'record' | 'output';
  setActiveTab: (tab: 'record' | 'output') => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  slideEditMode: boolean;
  setSlideEditMode: (mode: boolean) => void;
  mainTab: 'browser' | 'slides';
  setMainTab: (tab: 'browser' | 'slides') => void;
  templateSlides: Array<{ index: number; name: string; xmlPath: string }>;
  setTemplateSlides: (slides: Array<{ index: number; name: string; xmlPath: string }>) => void;
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
  updateDownloadPath: null,
  setVersion: (v) => set({ version: v }),
  setUpdateAvailable: (v, releaseUrl) => set({ updateAvailable: v, updateReleaseUrl: releaseUrl || null, updateStatus: 'available' }),
  setUpdateStatus: (status) => set({ updateStatus: status }),
  setUpdateProgress: (percent) => set({ updateProgress: percent, updateStatus: 'downloading' }),
  setUpdateError: (err) => set({ updateError: err, updateStatus: 'error' }),
  setUpdateDownloadComplete: (filePath) => set({ updateStatus: 'download-complete', updateDownloadPath: filePath }),

  // UI
  activeTab: 'record',
  setActiveTab: (tab) => set({ activeTab: tab }),
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),
  slideEditMode: false,
  setSlideEditMode: (mode) => set({ slideEditMode: mode }),
  mainTab: 'browser',
  setMainTab: (tab) => set({ mainTab: tab }),
  templateSlides: [],
  setTemplateSlides: (slides) => set({ templateSlides: slides }),
}));
