// ─── Step Types ───────────────────────────────────────────────────────────────

export type StepType = 'CLICK' | 'WAIT' | 'SNAP' | 'NAVIGATE' | 'SCROLL';

export interface ClickStep {
  type: 'CLICK';
  id: string;
  label: string;
  selector: string;
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
}

export interface WaitStep {
  type: 'WAIT';
  id: string;
  label: string;
  seconds: number;
}

export interface SnapStep {
  type: 'SNAP';
  id: string;
  label: string;
  region: { x: number; y: number; width: number; height: number };
  fullPage?: boolean;
}

export interface NavigateStep {
  type: 'NAVIGATE';
  id: string;
  label: string;
  url: string;
}

export interface ScrollStep {
  type: 'SCROLL';
  id: string;
  label: string;
  x: number;
  y: number;
}

export type FlowStep = ClickStep | WaitStep | SnapStep | NavigateStep | ScrollStep;

// ─── Flow ─────────────────────────────────────────────────────────────────────

export interface Flow {
  id: string;
  name: string;
  description?: string;
  template?: string; // path to .pptx template
  createdAt: string;
  updatedAt: string;
  steps: FlowStep[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface FlowConfig {
  defaults: {
    clickWaitSeconds: number;
    snapWaitSeconds: number;
    navigationTimeoutSeconds: number;
  };
  flows: Flow[];
}

export interface AppSettings {
  browserProfilePath: string;
  outputPath: string;
  defaultTemplate?: string;
  startUrl: string;
  theme: 'dark' | 'light';
  showTips: boolean;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
  sidebarWidth: number;
}

// ─── Run State ────────────────────────────────────────────────────────────────

export type RunStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';

export interface RunStepResult {
  stepId: string;
  status: RunStepStatus;
  message?: string;
  screenshotPath?: string;
  duration?: number;
}

export interface RunProgress {
  flowId: string;
  currentStep: number;
  totalSteps: number;
  status: 'idle' | 'running' | 'paused' | 'complete' | 'error';
  results: RunStepResult[];
  startedAt?: string;
  completedAt?: string;
}

// ─── IPC Channel Types ────────────────────────────────────────────────────────

export interface IpcChannels {
  // Browser control
  'browser:navigate': (url: string) => void;
  'browser:back': () => void;
  'browser:forward': () => void;
  'browser:reload': () => void;
  'browser:get-url': () => string;

  // Recording
  'recorder:start-click': () => void;
  'recorder:start-snap': () => void;
  'recorder:stop': () => void;
  'recorder:element-picked': (data: { selector: string; label: string; strategy: string; xy: [number, number] }) => void;
  'recorder:region-selected': (data: { x: number; y: number; width: number; height: number }) => void;

  // Flow management
  'flow:save': (config: FlowConfig) => void;
  'flow:load': () => FlowConfig;
  'flow:export': (flowId: string) => void;
  'flow:import': () => Flow | null;

  // Flow execution
  'flow:run': (flowId: string) => void;
  'flow:run-step': (flowId: string, stepIndex: number) => void;
  'flow:stop': () => void;
  'flow:progress': (progress: RunProgress) => void;

  // PPTX
  'pptx:build': (flowId: string, screenshots: Array<{ name: string; path: string }>) => string;

  // Settings
  'settings:load': () => AppSettings;
  'settings:save': (settings: AppSettings) => void;
  'settings:browse-template': () => string | null;
  'settings:browse-folder': () => string | null;

  // App
  'app:get-version': () => string;
  'app:check-update': () => void;
  'app:update-available': (version: string) => void;
  'app:update-downloaded': () => void;
}
