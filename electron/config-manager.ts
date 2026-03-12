import fs from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import type { FlowConfig, AppSettings } from '../shared/types';

const DEFAULT_FLOW_CONFIG: FlowConfig = {
  defaults: {
    stepWaitSeconds: 8,
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
  outputRetentionDays: 5,
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
    // Only write defaults if neither plain nor encrypted file exists
    if (!fs.existsSync(this.flowsPath) && !fs.existsSync(this.encPath(this.flowsPath))) {
      this.writeJSON(this.flowsPath, DEFAULT_FLOW_CONFIG);
    }
    if (!fs.existsSync(this.settingsPath) && !fs.existsSync(this.encPath(this.settingsPath))) {
      this.writeJSON(this.settingsPath, DEFAULT_SETTINGS);
    }
  }

  loadFlows(): FlowConfig {
    try {
      const data = this.readSecure(this.flowsPath);
      if (!data) return { ...DEFAULT_FLOW_CONFIG };
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
    const settings = this.loadSettings();
    this.writeSecure(this.flowsPath, config, !!settings.encryptConfigFiles);
  }

  loadSettings(): AppSettings {
    try {
      const data = this.readSecure(this.settingsPath);
      if (!data) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: AppSettings) {
    this.writeSecure(this.settingsPath, settings, !!settings.encryptConfigFiles);
  }

  // ─── Encryption helpers ────────────────────────────────────────────────

  private encPath(jsonPath: string): string {
    return jsonPath.replace('.json', '.enc');
  }

  private readSecure(jsonPath: string): string {
    const encrypted = this.encPath(jsonPath);

    // Prefer encrypted file if it exists and DPAPI is available
    if (fs.existsSync(encrypted)) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const buf = fs.readFileSync(encrypted);
          return safeStorage.decryptString(buf);
        }
      } catch {
        // Fall through to plain file
      }
    }

    // Fall back to plain JSON
    if (fs.existsSync(jsonPath)) {
      return fs.readFileSync(jsonPath, 'utf-8');
    }

    return '';
  }

  private writeSecure(jsonPath: string, data: unknown, encrypt: boolean) {
    const json = JSON.stringify(data, null, 2);

    if (encrypt && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json);
      fs.writeFileSync(this.encPath(jsonPath), encrypted);
      // Remove plain file if it exists (migration to encrypted)
      if (fs.existsSync(jsonPath)) {
        try { fs.unlinkSync(jsonPath); } catch { /* ignore */ }
      }
    } else {
      fs.writeFileSync(jsonPath, json, 'utf-8');
      // Remove encrypted file if switching back to plain
      const encFile = this.encPath(jsonPath);
      if (fs.existsSync(encFile)) {
        try { fs.unlinkSync(encFile); } catch { /* ignore */ }
      }
    }
  }

  private writeJSON(filePath: string, data: unknown) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
