// ─── Step Types ───────────────────────────────────────────────────────────────

export type StepType = 'CLICK' | 'WAIT' | 'SNAP' | 'NAVIGATE' | 'SCROLL' | 'HOVER' | 'SELECT' | 'TYPE' | 'SCROLL_ELEMENT' | 'SEARCH_SELECT' | 'FILTER' | 'MACRO';

export interface ClickStep {
  type: 'CLICK';
  id: string;
  label: string;
  selector: string;
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
  keyPress?: string;          // optional key to send instead of click (e.g. 'Enter', 'Tab')
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
  slideLayout?: PptxLayout;
  previewPath?: string;      // absolute path to live preview PNG captured during recording
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

export interface HoverStep {
  type: 'HOVER';
  id: string;
  label: string;
  selector: string;
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
}

export interface SelectStep {
  type: 'SELECT';
  id: string;
  label: string;
  selector: string;
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
  optionValue: string;
  clickOffAfter?: boolean;
}

export interface TypeStep {
  type: 'TYPE';
  id: string;
  label: string;
  selector: string;
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
  text: string;
  clearFirst?: boolean;
  clickOffAfter?: boolean;
}

export interface ScrollElementStep {
  type: 'SCROLL_ELEMENT';
  id: string;
  label: string;
  selector: string;
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
  scrollTop: number;
  scrollLeft?: number;
}

export interface SearchSelectStep {
  type: 'SEARCH_SELECT';
  id: string;
  label: string;
  selector: string;        // the search input selector
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
  searchText: string;       // text to type (supports {{variable}})
  waitForResults?: number;  // seconds to wait for dropdown, default 1
  clearFirst?: boolean;
  clickOffAfter?: boolean;
}

export interface FilterOptionSelector {
  selector: string;
  fallbackXY?: [number, number];
  label?: string;
}

export interface FilterStep {
  type: 'FILTER';
  id: string;
  label: string;
  selector: string;          // the filter trigger selector (opens the filter)
  fallbackXY?: [number, number];
  selectorStrategy: 'data-attr' | 'aria-label' | 'text' | 'css-combo' | 'xy-position';
  optionSelectors: FilterOptionSelector[];  // recorded option element selectors
  applySelector?: string;       // apply button selector; if empty, re-clicks trigger
  applyFallbackXY?: [number, number];
  clickOffAfter?: boolean;
}

export interface MacroAction {
  selector?: string;
  fallbackXY?: [number, number];
  selectorStrategy?: string;
  label?: string;
  action: 'click' | 'type' | 'select' | 'scroll' | 'snap' | 'key';
  key?: string;              // for key actions — e.g. 'Enter', 'Tab'
  value?: string;            // for type/select — supports {{variable}}
  scrollTarget?: {           // for scroll actions
    x: number;
    y: number;
    isPage: boolean;         // true = window scroll, false = element scroll
  };
  snapRegion?: {             // for snap actions
    x: number;
    y: number;
    width: number;
    height: number;
  };
  slideLayout?: PptxLayout;  // optional per-snap slide layout
  previewPath?: string;      // preview screenshot captured during recording
  elementMeta?: {
    tagName: string;
    inputType?: string;      // e.g. 'text', 'search', 'email'
    placeholder?: string;
    options?: string[];      // for <select> elements
  };
}

export interface MacroStep {
  type: 'MACRO';
  id: string;
  label: string;
  actions: MacroAction[];
  waitBetween?: number;      // ms between actions, default 500
}

export interface FlowVariable {
  name: string;
  defaultValue: string;
}

export type FlowStep = (ClickStep | WaitStep | SnapStep | NavigateStep | ScrollStep | HoverStep | SelectStep | TypeStep | ScrollElementStep | SearchSelectStep | FilterStep | MacroStep) & { group?: string; waitOverride?: number };

// ─── Flow ─────────────────────────────────────────────────────────────────────

export interface Flow {
  id: string;
  name: string;
  description?: string;
  template?: string; // path to .pptx template
  createdAt: string;
  updatedAt: string;
  steps: FlowStep[];
  variables?: FlowVariable[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface FlowConfig {
  defaults: {
    stepWaitSeconds: number;
    navigationTimeoutSeconds: number;
  };
  flows: Flow[];
}

export interface Bookmark {
  name: string;
  url: string;
}

export interface PptxLayout {
  imageX: number;      // inches, default 0.3
  imageY: number;      // inches, default 0.8
  imageW: number;      // inches, default 12.7
  imageH: number;      // inches, default 6.2
  showHeader: boolean; // default true
  showFooter: boolean; // default true
  fitMode: 'contain' | 'fill' | 'stretch'; // default 'contain'
  cropTop?: number;    // percent 0-50, default 0
  cropRight?: number;  // percent 0-50, default 0
  cropBottom?: number; // percent 0-50, default 0
  cropLeft?: number;   // percent 0-50, default 0
  templateSlideIndex?: number;  // 0-based index into template .pptx slides
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
  bookmarks?: Bookmark[];
  pptxLayout?: PptxLayout;
  // Enterprise settings
  disableAutoUpdate?: boolean;
  encryptConfigFiles?: boolean;
  outputRetentionDays?: number;  // 0 = never purge, default 5
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
  pptxPath?: string;
  batchRow?: number;
  batchTotal?: number;
  batchVariables?: Record<string, string>;
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
