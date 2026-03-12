import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AuditEntry {
  action: string;
  flowId?: string;
  flowName?: string;
  url?: string;
  detail?: string;
}

export class AuditLogger {
  private logPath: string;

  constructor(basePath: string) {
    this.logPath = path.join(basePath, 'audit.log');
  }

  log(entry: AuditEntry) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      user: os.userInfo().username,
      hostname: os.hostname(),
      ...entry,
    }) + '\n';

    try {
      fs.appendFileSync(this.logPath, line, 'utf-8');
    } catch {
      // Don't crash the app if audit logging fails
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}
