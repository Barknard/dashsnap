import { BrowserView, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConfigManager } from './config-manager';
import type { Flow, FlowStep, RunProgress, RunStepResult } from '../shared/types';

export class FlowRunner {
  private view: BrowserView;
  private window: BrowserWindow;
  private config: ConfigManager;
  private running = false;
  private shouldStop = false;

  constructor(view: BrowserView, window: BrowserWindow, config: ConfigManager) {
    this.view = view;
    this.window = window;
    this.config = config;
  }

  async run(flowId: string) {
    const flowConfig = this.config.loadFlows();
    const flow = flowConfig.flows.find((f: Flow) => f.id === flowId);
    if (!flow || this.running) return;

    this.running = true;
    this.shouldStop = false;

    const settings = this.config.loadSettings();
    const outputDir = settings.outputPath ||
      path.join(this.config.getBasePath(), '..', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const screenshots: Array<{ name: string; path: string }> = [];
    const progress: RunProgress = {
      flowId,
      currentStep: 0,
      totalSteps: flow.steps.length,
      status: 'running',
      results: [],
      startedAt: new Date().toISOString(),
    };
    this.sendProgress(progress);

    const logLines: string[] = [];
    logLines.push(`DashSnap Run Log — ${new Date().toISOString()}`);
    logLines.push(`Flow: ${flow.name} (${flow.steps.length} steps)`);
    logLines.push('─'.repeat(50));

    for (let i = 0; i < flow.steps.length; i++) {
      if (this.shouldStop) {
        progress.status = 'complete';
        progress.completedAt = new Date().toISOString();
        logLines.push(`[STOPPED] Run stopped by user at step ${i + 1}`);
        break;
      }

      progress.currentStep = i;
      this.sendProgress(progress);

      const step = flow.steps[i];
      const startTime = Date.now();
      const result = await this.executeStep(step, flowConfig.defaults, outputDir, screenshots, logLines);
      result.duration = Date.now() - startTime;
      progress.results.push(result);

      logLines.push(`  [${result.status.toUpperCase()}] ${result.duration}ms${result.message ? ' — ' + result.message : ''}`);

      if (result.status === 'error') {
        // Send to renderer for skip/abort decision — for now, continue
        logLines.push(`  [WARN] Error on step ${i + 1}, continuing...`);
      }
    }

    if (!this.shouldStop) {
      progress.status = 'complete';
      progress.completedAt = new Date().toISOString();
    }
    this.sendProgress(progress);

    // Build PPTX if we have screenshots
    if (screenshots.length > 0) {
      try {
        const PptxBuilder = (await import('./pptx-builder')).PptxBuilder;
        const builder = new PptxBuilder(this.config);
        const outputPath = await builder.build(flowId, screenshots);
        logLines.push('─'.repeat(50));
        logLines.push(`Output: ${outputPath}`);
        logLines.push(`Screenshots: ${screenshots.length}`);
      } catch (err) {
        logLines.push(`[ERROR] PPTX build failed: ${err}`);
      }
    }

    // Write log
    const logPath = path.join(this.config.getBasePath(), '..', 'run_log.txt');
    fs.writeFileSync(logPath, logLines.join('\n'), 'utf-8');

    this.running = false;
  }

  async runSingleStep(flowId: string, stepIndex: number) {
    const flowConfig = this.config.loadFlows();
    const flow = flowConfig.flows.find((f: Flow) => f.id === flowId);
    if (!flow || !flow.steps[stepIndex]) return;

    const settings = this.config.loadSettings();
    const outputDir = settings.outputPath ||
      path.join(this.config.getBasePath(), '..', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const screenshots: Array<{ name: string; path: string }> = [];
    const logLines: string[] = [];

    const progress: RunProgress = {
      flowId,
      currentStep: stepIndex,
      totalSteps: 1,
      status: 'running',
      results: [],
      startedAt: new Date().toISOString(),
    };
    this.sendProgress(progress);

    const startTime = Date.now();
    const result = await this.executeStep(
      flow.steps[stepIndex], flowConfig.defaults, outputDir, screenshots, logLines
    );
    result.duration = Date.now() - startTime;
    progress.results.push(result);
    progress.status = 'complete';
    progress.completedAt = new Date().toISOString();
    this.sendProgress(progress);
  }

  stop() {
    this.shouldStop = true;
  }

  private async executeStep(
    step: FlowStep,
    defaults: { clickWaitSeconds: number; snapWaitSeconds: number; navigationTimeoutSeconds: number },
    outputDir: string,
    screenshots: Array<{ name: string; path: string }>,
    logLines: string[],
  ): Promise<RunStepResult> {
    const result: RunStepResult = { stepId: step.id, status: 'pending' };
    logLines.push(`Step: ${step.type} — ${step.label}`);

    try {
      switch (step.type) {
        case 'CLICK':
          result.status = await this.executeClick(step, defaults.clickWaitSeconds);
          break;

        case 'WAIT':
          await this.delay(step.seconds * 1000);
          result.status = 'success';
          break;

        case 'SNAP': {
          const screenshotPath = await this.executeSnap(step, outputDir, screenshots.length);
          if (screenshotPath) {
            screenshots.push({ name: step.label, path: screenshotPath });
            result.screenshotPath = screenshotPath;
            result.status = 'success';
          } else {
            result.status = 'error';
            result.message = 'Screenshot capture failed';
          }
          await this.delay(defaults.snapWaitSeconds * 1000);
          break;
        }

        case 'NAVIGATE':
          await this.view.webContents.loadURL(step.url);
          await this.waitForLoad(defaults.navigationTimeoutSeconds * 1000);
          result.status = 'success';
          break;

        case 'SCROLL':
          await this.view.webContents.executeJavaScript(
            `window.scrollTo(${step.x}, ${step.y})`
          );
          await this.delay(500);
          result.status = 'success';
          break;
      }
    } catch (err) {
      result.status = 'error';
      result.message = String(err);
    }

    return result;
  }

  private async executeClick(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string },
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;

    // Try selector first
    if (step.selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${step.selector.replace(/'/g, "\\'")}');
          if (el) { el.click(); return true; }
          return false;
        })()
      `).catch(() => false);

      if (found) {
        await this.delay(waitSeconds * 1000);
        return 'success';
      }
    }

    // Fallback to XY click
    if (step.fallbackXY) {
      const [x, y] = step.fallbackXY;
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await this.delay(waitSeconds * 1000);
      return 'warning'; // XY fallback used
    }

    throw new Error(`Element not found: ${step.selector}`);
  }

  private async executeSnap(
    step: { region: { x: number; y: number; width: number; height: number }; fullPage?: boolean },
    outputDir: string,
    index: number,
  ): Promise<string | null> {
    try {
      const image = await this.view.webContents.capturePage({
        x: step.region.x,
        y: step.region.y,
        width: step.region.width,
        height: step.region.height,
      });

      const filename = `snap_${String(index + 1).padStart(2, '0')}.png`;
      const filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, image.toPNG());
      return filePath;
    } catch (err) {
      console.error('Screenshot failed:', err);
      return null;
    }
  }

  private async waitForLoad(timeout: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeout);
      this.view.webContents.once('did-finish-load', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private sendProgress(progress: RunProgress) {
    this.window.webContents.send('flow:progress', { ...progress });
  }
}
