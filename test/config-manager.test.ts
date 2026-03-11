import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockFs } from './setup';
import type { Flow, FlowConfig, AppSettings } from '@shared/types';

// ─── ConfigManager reference implementation ──────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  browserProfilePath: '',
  outputPath: '',
  startUrl: 'about:blank',
  theme: 'dark',
  showTips: true,
  sidebarWidth: 320,
};

const DEFAULT_FLOW_CONFIG: FlowConfig = {
  defaults: {
    stepWaitSeconds: 8,
    navigationTimeoutSeconds: 30,
  },
  flows: [],
};

class ConfigManager {
  private configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  get flowsPath(): string {
    return `${this.configDir}/flows.json`;
  }

  get settingsPath(): string {
    return `${this.configDir}/settings.json`;
  }

  loadFlows(): FlowConfig {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.flowsPath)) {
        this.saveFlows(DEFAULT_FLOW_CONFIG);
        return { ...DEFAULT_FLOW_CONFIG };
      }
      const raw = fs.readFileSync(this.flowsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<FlowConfig>;
      // Merge with defaults to ensure all fields exist
      return {
        defaults: { ...DEFAULT_FLOW_CONFIG.defaults, ...parsed.defaults },
        flows: parsed.flows || [],
      };
    } catch {
      return { ...DEFAULT_FLOW_CONFIG };
    }
  }

  saveFlows(config: FlowConfig): void {
    const fs = require('fs');
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.flowsPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  loadSettings(): AppSettings {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.settingsPath)) {
        this.saveSettings(DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS };
      }
      const raw = fs.readFileSync(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: AppSettings): void {
    const fs = require('fs');
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  exportFlow(flowId: string): string | null {
    const config = this.loadFlows();
    const flow = config.flows.find((f) => f.id === flowId);
    if (!flow) return null;
    return JSON.stringify(flow, null, 2);
  }

  importFlow(json: string): Flow {
    const flow = JSON.parse(json) as Flow;
    const config = this.loadFlows();

    // Check for ID collision - generate new ID if needed
    const existing = config.flows.find((f) => f.id === flow.id);
    if (existing) {
      flow.id = `${flow.id}-imported-${Date.now()}`;
    }

    flow.updatedAt = new Date().toISOString();
    config.flows.push(flow);
    this.saveFlows(config);
    return flow;
  }

  mergeConfig(incoming: Partial<FlowConfig>): FlowConfig {
    const current = this.loadFlows();

    // Merge defaults
    const merged: FlowConfig = {
      defaults: { ...current.defaults, ...incoming.defaults },
      flows: [...current.flows],
    };

    // Merge flows: update existing by ID, add new ones
    if (incoming.flows) {
      for (const incomingFlow of incoming.flows) {
        const existingIdx = merged.flows.findIndex((f) => f.id === incomingFlow.id);
        if (existingIdx >= 0) {
          // Keep the newer version
          const existing = merged.flows[existingIdx];
          if (incomingFlow.updatedAt > existing.updatedAt) {
            merged.flows[existingIdx] = incomingFlow;
          }
        } else {
          merged.flows.push(incomingFlow);
        }
      }
    }

    this.saveFlows(merged);
    return merged;
  }
}

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createManager(): ConfigManager {
  return new ConfigManager('/mock/userData/config');
}

function sampleFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    steps: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{}');
  });

  describe('loadFlows', () => {
    it('should return parsed flow config from file', () => {
      const config: FlowConfig = {
        defaults: { stepWaitSeconds: 2, navigationTimeoutSeconds: 60 },
        flows: [sampleFlow()],
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(config));

      const manager = createManager();
      const result = manager.loadFlows();

      expect(result.defaults.stepWaitSeconds).toBe(2);
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].name).toBe('Test Flow');
    });

    it('should create default config when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const manager = createManager();
      const result = manager.loadFlows();

      expect(result.defaults).toEqual(DEFAULT_FLOW_CONFIG.defaults);
      expect(result.flows).toEqual([]);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should merge with defaults for missing fields', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        defaults: { stepWaitSeconds: 5 },
        flows: [],
      }));

      const manager = createManager();
      const result = manager.loadFlows();

      expect(result.defaults.stepWaitSeconds).toBe(5);
      expect(result.defaults.navigationTimeoutSeconds).toBe(30); // default
    });

    it('should return defaults on parse error', () => {
      mockFs.readFileSync.mockReturnValue('not valid json!!!');

      const manager = createManager();
      const result = manager.loadFlows();

      expect(result).toEqual(DEFAULT_FLOW_CONFIG);
    });
  });

  describe('saveFlows', () => {
    it('should write config as formatted JSON', () => {
      const config: FlowConfig = {
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [sampleFlow()],
      };

      const manager = createManager();
      manager.saveFlows(config);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/mock/userData/config', { recursive: true });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/userData/config/flows.json',
        expect.any(String),
        'utf-8'
      );

      const written = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(written.flows).toHaveLength(1);
    });
  });

  describe('loadSettings', () => {
    it('should return parsed settings', () => {
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        theme: 'light',
        startUrl: 'https://dashboard.example.com',
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(settings));

      const manager = createManager();
      const result = manager.loadSettings();

      expect(result.theme).toBe('light');
      expect(result.startUrl).toBe('https://dashboard.example.com');
    });

    it('should create defaults when file missing', () => {
      mockFs.existsSync.mockReturnValue(false);

      const manager = createManager();
      const result = manager.loadSettings();

      expect(result).toEqual(DEFAULT_SETTINGS);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should merge partial settings with defaults', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ theme: 'light' }));

      const manager = createManager();
      const result = manager.loadSettings();

      expect(result.theme).toBe('light');
      expect(result.sidebarWidth).toBe(320); // default preserved
      expect(result.showTips).toBe(true); // default preserved
    });
  });

  describe('saveSettings', () => {
    it('should persist settings to disk', () => {
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        outputPath: '/custom/output',
      };

      const manager = createManager();
      manager.saveSettings(settings);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/userData/config/settings.json',
        expect.stringContaining('/custom/output'),
        'utf-8'
      );
    });
  });

  describe('exportFlow', () => {
    it('should return JSON string for existing flow', () => {
      const flow = sampleFlow({ id: 'export-me', name: 'Export This' });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [flow],
      }));

      const manager = createManager();
      const result = manager.exportFlow('export-me');

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!);
      expect(parsed.id).toBe('export-me');
      expect(parsed.name).toBe('Export This');
    });

    it('should return null for non-existent flow', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [],
      }));

      const manager = createManager();
      const result = manager.exportFlow('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('importFlow', () => {
    it('should add imported flow to config', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(DEFAULT_FLOW_CONFIG));

      const manager = createManager();
      const flow = sampleFlow({ id: 'imported-1', name: 'Imported Flow' });
      const result = manager.importFlow(JSON.stringify(flow));

      expect(result.id).toBe('imported-1');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should generate new ID on collision', () => {
      const existing = sampleFlow({ id: 'dupe-id' });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [existing],
      }));

      const manager = createManager();
      const imported = sampleFlow({ id: 'dupe-id', name: 'Duplicate' });
      const result = manager.importFlow(JSON.stringify(imported));

      expect(result.id).not.toBe('dupe-id');
      expect(result.id).toContain('dupe-id');
      expect(result.id).toContain('imported');
    });

    it('should set updatedAt to current time', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(DEFAULT_FLOW_CONFIG));

      const manager = createManager();
      const flow = sampleFlow({ updatedAt: '2020-01-01T00:00:00Z' });
      const result = manager.importFlow(JSON.stringify(flow));

      expect(new Date(result.updatedAt).getFullYear()).toBeGreaterThanOrEqual(2025);
    });
  });

  describe('mergeConfig', () => {
    it('should merge defaults without losing existing values', () => {
      const current: FlowConfig = {
        defaults: { stepWaitSeconds: 3, navigationTimeoutSeconds: 30 },
        flows: [sampleFlow({ id: 'existing' })],
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(current));

      const manager = createManager();
      const result = manager.mergeConfig({
        defaults: { stepWaitSeconds: 5 } as FlowConfig['defaults'],
      });

      expect(result.defaults.stepWaitSeconds).toBe(5); // updated
      expect(result.defaults.navigationTimeoutSeconds).toBe(30); // preserved
      expect(result.flows).toHaveLength(1); // preserved
    });

    it('should add new flows without removing existing ones', () => {
      const current: FlowConfig = {
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [sampleFlow({ id: 'a', name: 'Flow A' })],
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(current));

      const manager = createManager();
      const result = manager.mergeConfig({
        flows: [sampleFlow({ id: 'b', name: 'Flow B' })],
      });

      expect(result.flows).toHaveLength(2);
      expect(result.flows.map((f) => f.id)).toContain('a');
      expect(result.flows.map((f) => f.id)).toContain('b');
    });

    it('should update existing flow when incoming is newer', () => {
      const current: FlowConfig = {
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [sampleFlow({ id: 'same', name: 'Old Name', updatedAt: '2025-01-01T00:00:00Z' })],
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(current));

      const manager = createManager();
      const result = manager.mergeConfig({
        flows: [sampleFlow({ id: 'same', name: 'New Name', updatedAt: '2025-06-01T00:00:00Z' })],
      });

      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].name).toBe('New Name');
    });

    it('should keep existing flow when incoming is older', () => {
      const current: FlowConfig = {
        defaults: DEFAULT_FLOW_CONFIG.defaults,
        flows: [sampleFlow({ id: 'same', name: 'Current', updatedAt: '2025-06-01T00:00:00Z' })],
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(current));

      const manager = createManager();
      const result = manager.mergeConfig({
        flows: [sampleFlow({ id: 'same', name: 'Older', updatedAt: '2025-01-01T00:00:00Z' })],
      });

      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].name).toBe('Current');
    });

    it('should save merged config to disk', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(DEFAULT_FLOW_CONFIG));

      const manager = createManager();
      manager.mergeConfig({ flows: [sampleFlow()] });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });
});
