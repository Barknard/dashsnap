import fs from 'fs';
import path from 'path';
import type { FlowConfig, AppSettings } from '../shared/types';

const DEFAULT_FLOW_CONFIG: FlowConfig = {
  defaults: {
    clickWaitSeconds: 3,
    snapWaitSeconds: 5,
    navigationTimeoutSeconds: 30,
  },
  flows: [],
};

const DEFAULT_SETTINGS: AppSettings = {
  browserProfilePath: '',
  outputPath: '',
  startUrl: 'about:blank',
  theme: 'dark',
  showTips: true,
  sidebarWidth: 380,
};

export class ConfigManager {
  private basePath: string;
  private flowsPath: string;
  private settingsPath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.flowsPath = path.join(basePath, 'flows.json');
    this.settingsPath = path.join(basePath, 'settings.json');
    this.ensureDefaults();
  }

  getBasePath(): string {
    return this.basePath;
  }

  private ensureDefaults() {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
    if (!fs.existsSync(this.flowsPath)) {
      this.writeJSON(this.flowsPath, DEFAULT_FLOW_CONFIG);
    }
    if (!fs.existsSync(this.settingsPath)) {
      this.writeJSON(this.settingsPath, DEFAULT_SETTINGS);
    }
  }

  loadFlows(): FlowConfig {
    try {
      const data = fs.readFileSync(this.flowsPath, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        defaults: { ...DEFAULT_FLOW_CONFIG.defaults, ...parsed.defaults },
        flows: parsed.flows || [],
      };
    } catch {
      return { ...DEFAULT_FLOW_CONFIG };
    }
  }

  saveFlows(config: FlowConfig) {
    this.writeJSON(this.flowsPath, config);
  }

  loadSettings(): AppSettings {
    try {
      const data = fs.readFileSync(this.settingsPath, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: AppSettings) {
    this.writeJSON(this.settingsPath, settings);
  }

  private writeJSON(filePath: string, data: unknown) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
