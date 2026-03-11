import { BrowserView, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConfigManager } from './config-manager';
import type { Flow, FlowStep, PptxLayout, RunProgress, RunStepResult, SnapStep, SearchSelectStep, FilterStep, MacroStep } from '../shared/types';

export class FlowRunner {
  private view: BrowserView;
  private window: BrowserWindow;
  private config: ConfigManager;
  private running = false;
  private shouldStop = false;
  private currentVariables: Record<string, string> = {};

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

    const screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }> = [];
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

    const screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }> = [];
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

  private substituteVariables(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      return this.currentVariables[name] ?? `{{${name}}}`;
    });
  }

  async runBatch(flowId: string, rows: Record<string, string>[]) {
    const flowConfig = this.config.loadFlows();
    const flow = flowConfig.flows.find((f: Flow) => f.id === flowId);
    if (!flow || this.running) return;

    this.running = true;
    this.shouldStop = false;

    const settings = this.config.loadSettings();
    const outputDir = settings.outputPath ||
      path.join(this.config.getBasePath(), '..', 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      if (this.shouldStop) break;

      this.currentVariables = rows[rowIdx];

      const screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }> = [];
      const progress: RunProgress = {
        flowId,
        currentStep: 0,
        totalSteps: flow.steps.length,
        status: 'running',
        results: [],
        startedAt: new Date().toISOString(),
        batchRow: rowIdx + 1,
        batchTotal: rows.length,
        batchVariables: this.currentVariables,
      };
      this.sendProgress(progress);

      const logLines: string[] = [];
      const varSummary = Object.entries(this.currentVariables).map(([k, v]) => `${k}=${v}`).join(', ');
      logLines.push(`Batch Row ${rowIdx + 1}/${rows.length}: ${varSummary}`);

      for (let i = 0; i < flow.steps.length; i++) {
        if (this.shouldStop) break;

        progress.currentStep = i;
        this.sendProgress(progress);

        const step = flow.steps[i];
        const startTime = Date.now();
        const result = await this.executeStep(step, flowConfig.defaults, outputDir, screenshots, logLines);
        result.duration = Date.now() - startTime;
        progress.results.push(result);
      }

      // Save screenshots for this row (no PPTX in batch — just screenshots)
      progress.status = 'complete';
      progress.completedAt = new Date().toISOString();
      this.sendProgress(progress);
    }

    this.currentVariables = {};
    this.running = false;
  }

  stop() {
    this.shouldStop = true;
  }

  private async executeStep(
    step: FlowStep,
    defaults: { clickWaitSeconds: number; snapWaitSeconds: number; navigationTimeoutSeconds: number },
    outputDir: string,
    screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
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
            screenshots.push({ name: step.label, path: screenshotPath, slideLayout: (step as SnapStep).slideLayout });
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
          result.status = 'success';
          break;

        case 'SCROLL':
          await this.view.webContents.executeJavaScript(
            `window.scrollTo(${step.x}, ${step.y})`
          );
          await this.delay(500);
          result.status = 'success';
          break;

        case 'HOVER':
          result.status = await this.executeHover(step, defaults.clickWaitSeconds);
          break;

        case 'SELECT':
          result.status = await this.executeSelect(step, defaults.clickWaitSeconds);
          break;

        case 'TYPE':
          result.status = await this.executeType(step, defaults.clickWaitSeconds);
          break;

        case 'SCROLL_ELEMENT':
          result.status = await this.executeScrollElement(step);
          break;

        case 'SEARCH_SELECT':
          result.status = await this.executeSearchSelect(step, defaults.clickWaitSeconds);
          break;

        case 'FILTER':
          result.status = await this.executeFilter(step, defaults.clickWaitSeconds);
          break;

        case 'MACRO':
          result.status = await this.executeMacro(step, outputDir, screenshots);
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

      // Include variable values in filename for batch runs
      const varSuffix = Object.keys(this.currentVariables).length > 0
        ? '_' + Object.values(this.currentVariables).join('_').replace(/[^a-zA-Z0-9_-]/g, '')
        : '';
      const filename = `snap_${String(index + 1).padStart(2, '0')}${varSuffix}.png`;
      const filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, image.toPNG());
      return filePath;
    } catch (err) {
      console.error('Screenshot failed:', err);
      return null;
    }
  }

  private async executeHover(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string },
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;

    if (step.selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${step.selector.replace(/'/g, "\\'")}');
          if (el) {
            const rect = el.getBoundingClientRect();
            const evt = new MouseEvent('mouseover', { bubbles: true, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 });
            el.dispatchEvent(evt);
            const evt2 = new MouseEvent('mouseenter', { bubbles: false, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 });
            el.dispatchEvent(evt2);
            return true;
          }
          return false;
        })()
      `).catch(() => false);

      if (found) {
        await this.delay(waitSeconds * 1000);
        return 'success';
      }
    }

    if (step.fallbackXY) {
      const [x, y] = step.fallbackXY;
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      await this.delay(waitSeconds * 1000);
      return 'warning';
    }

    throw new Error(`Element not found: ${step.selector}`);
  }

  private async executeSelect(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string; optionValue: string; clickOffAfter?: boolean },
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;

    if (step.selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${step.selector.replace(/'/g, "\\'")}');
          if (el && el.tagName === 'SELECT') {
            el.value = '${step.optionValue.replace(/'/g, "\\'")}';
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          if (el) {
            el.click();
            return true;
          }
          return false;
        })()
      `).catch(() => false);

      if (found) {
        await this.delay(waitSeconds * 1000);
        if (step.clickOffAfter !== false) {
          await this.clickOff(wc);
        }
        return 'success';
      }
    }

    if (step.fallbackXY) {
      const [x, y] = step.fallbackXY;
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await this.delay(waitSeconds * 1000);
      if (step.clickOffAfter !== false) {
        await this.clickOff(wc);
      }
      return 'warning';
    }

    throw new Error(`Element not found: ${step.selector}`);
  }

  private async executeType(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string; text: string; clearFirst?: boolean; clickOffAfter?: boolean },
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;

    if (step.selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${step.selector.replace(/'/g, "\\'")}');
          if (el) {
            el.focus();
            ${step.clearFirst ? "el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));" : ''}
            return true;
          }
          return false;
        })()
      `).catch(() => false);

      if (found) {
        const typeText = this.substituteVariables(step.text);
        for (const char of typeText) {
          wc.sendInputEvent({ type: 'char', keyCode: char });
          await this.delay(30);
        }
        await this.delay(waitSeconds * 1000);
        if (step.clickOffAfter !== false) {
          await this.clickOff(wc);
        }
        return 'success';
      }
    }

    if (step.fallbackXY) {
      const [x, y] = step.fallbackXY;
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await this.delay(200);
      const typeText = this.substituteVariables(step.text);
      for (const char of typeText) {
        wc.sendInputEvent({ type: 'char', keyCode: char });
        await this.delay(30);
      }
      await this.delay(waitSeconds * 1000);
      if (step.clickOffAfter !== false) {
        await this.clickOff(wc);
      }
      return 'warning';
    }

    throw new Error(`Element not found: ${step.selector}`);
  }

  private async executeScrollElement(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string; scrollTop: number; scrollLeft?: number },
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;

    if (step.selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${step.selector.replace(/'/g, "\\'")}');
          if (el) {
            el.scrollTop = ${step.scrollTop};
            ${step.scrollLeft != null ? `el.scrollLeft = ${step.scrollLeft};` : ''}
            return true;
          }
          return false;
        })()
      `).catch(() => false);

      if (found) {
        await this.delay(500);
        return 'success';
      }
    }

    throw new Error(`Element not found: ${step.selector}`);
  }

  private async executeSearchSelect(
    step: SearchSelectStep,
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;
    const searchText = this.substituteVariables(step.searchText);
    const waitForResults = (step.waitForResults ?? 1) * 1000;

    // 1. Click and focus the search input
    if (step.selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${step.selector.replace(/'/g, "\\\\'")}');
          if (el) {
            el.focus();
            el.click();
            ${step.clearFirst ? "el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));" : ''}
            return true;
          }
          return false;
        })()
      `).catch(() => false);

      if (!found) {
        if (step.fallbackXY) {
          const [x, y] = step.fallbackXY;
          wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
          await this.delay(200);
        } else {
          throw new Error(`Search input not found: ${step.selector}`);
        }
      }
    }

    await this.delay(200);

    // 2. Type the search text
    for (const char of searchText) {
      wc.sendInputEvent({ type: 'char', keyCode: char });
      await this.delay(30);
    }

    // 3. Wait for results to appear
    await this.delay(waitForResults);

    // 4. Find and click the matching result by text content
    const clicked = await wc.executeJavaScript(`
      (function() {
        const searchText = '${searchText.replace(/'/g, "\\\\'")}';
        // Look for visible elements containing the exact text
        const all = document.querySelectorAll('*');
        for (const el of all) {
          if (el.children.length === 0 || el.tagName === 'OPTION' || el.tagName === 'LI' || el.getAttribute('role') === 'option') {
            const text = (el.textContent || '').trim();
            if (text === searchText || text.toLowerCase() === searchText.toLowerCase()) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                el.click();
                return true;
              }
            }
          }
        }
        // Fallback: partial match
        for (const el of all) {
          if (el.children.length === 0 || el.tagName === 'OPTION' || el.tagName === 'LI' || el.getAttribute('role') === 'option') {
            const text = (el.textContent || '').trim();
            if (text.toLowerCase().includes(searchText.toLowerCase())) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                el.click();
                return true;
              }
            }
          }
        }
        return false;
      })()
    `).catch(() => false);

    await this.delay(waitSeconds * 1000);

    if (step.clickOffAfter !== false) {
      await this.clickOff(wc);
    }

    return clicked ? 'success' : 'warning';
  }

  private async executeFilter(
    step: FilterStep,
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;
    let usedFallback = false;

    // 1. Click to open the filter trigger
    const triggerClicked = await this.clickSelector(wc, step.selector, step.fallbackXY);
    if (!triggerClicked) throw new Error(`Filter trigger not found: ${step.selector}`);
    if (triggerClicked === 'fallback') usedFallback = true;

    await this.delay(waitSeconds * 1000);

    // 2. Click each recorded option selector
    for (const option of (step.optionSelectors || [])) {
      const optionClicked = await this.clickSelector(wc, option.selector, option.fallbackXY);
      if (!optionClicked) usedFallback = true;
      if (optionClicked === 'fallback') usedFallback = true;
      await this.delay(300);
    }

    await this.delay(500);

    // 3. Apply — click apply button or re-click trigger to close
    if (step.applySelector) {
      const applyClicked = await this.clickSelector(wc, step.applySelector, step.applyFallbackXY);
      if (applyClicked === 'fallback') usedFallback = true;
    } else {
      // Re-click the trigger to close/apply
      await this.clickSelector(wc, step.selector, step.fallbackXY);
    }

    await this.delay(waitSeconds * 1000);

    if (step.clickOffAfter !== false) {
      await this.clickOff(wc);
    }

    return usedFallback ? 'warning' : 'success';
  }

  private async executeMacro(
    step: MacroStep,
    outputDir?: string,
    screenshots?: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;
    const waitBetween = step.waitBetween ?? 500;
    let usedFallback = false;

    for (const action of step.actions) {
      if (this.shouldStop) break;

      switch (action.action) {
        case 'click': {
          const clicked = await this.clickSelector(wc, action.selector || '', action.fallbackXY);
          if (!clicked) throw new Error(`Macro click failed: ${action.label || action.selector}`);
          if (clicked === 'fallback') usedFallback = true;
          break;
        }

        case 'type': {
          const text = this.substituteVariables(action.value || '');
          if (action.selector) {
            const found = await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector('${action.selector.replace(/'/g, "\\\\'")}');
                if (el) { el.focus(); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
                return false;
              })()
            `).catch(() => false);

            if (found) {
              for (const char of text) {
                wc.sendInputEvent({ type: 'char', keyCode: char });
                await this.delay(30);
              }
            } else if (action.fallbackXY) {
              const [x, y] = action.fallbackXY;
              wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
              wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
              await this.delay(200);
              for (const char of text) {
                wc.sendInputEvent({ type: 'char', keyCode: char });
                await this.delay(30);
              }
              usedFallback = true;
            }
          }
          break;
        }

        case 'select': {
          const value = this.substituteVariables(action.value || '');
          if (action.selector) {
            await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector('${action.selector.replace(/'/g, "\\\\'")}');
                if (el && el.tagName === 'SELECT') {
                  el.value = '${value.replace(/'/g, "\\\\'")}';
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (el) {
                  el.click();
                }
              })()
            `).catch(() => {});
          } else if (action.fallbackXY) {
            const [x, y] = action.fallbackXY;
            wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
            wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
            usedFallback = true;
          }
          break;
        }

        case 'scroll': {
          if (action.scrollTarget) {
            if (action.scrollTarget.isPage) {
              await wc.executeJavaScript(
                `window.scrollTo(${action.scrollTarget.x}, ${action.scrollTarget.y})`
              );
            } else if (action.selector) {
              await wc.executeJavaScript(`
                (function() {
                  const el = document.querySelector('${action.selector.replace(/'/g, "\\\\'")}');
                  if (el) { el.scrollTop = ${action.scrollTarget.y}; el.scrollLeft = ${action.scrollTarget.x}; }
                })()
              `).catch(() => {});
            }
          }
          break;
        }

        case 'snap': {
          if (action.snapRegion && outputDir && screenshots) {
            try {
              const image = await this.view.webContents.capturePage({
                x: action.snapRegion.x,
                y: action.snapRegion.y,
                width: action.snapRegion.width,
                height: action.snapRegion.height,
              });
              const varSuffix = Object.keys(this.currentVariables).length > 0
                ? '_' + Object.values(this.currentVariables).join('_').replace(/[^a-zA-Z0-9_-]/g, '')
                : '';
              const filename = `snap_${String(screenshots.length + 1).padStart(2, '0')}${varSuffix}.png`;
              const filePath = path.join(outputDir, filename);
              fs.writeFileSync(filePath, image.toPNG());
              screenshots.push({
                name: action.label || 'Macro Screenshot',
                path: filePath,
                slideLayout: action.slideLayout,
              });
            } catch (err) {
              console.error('Macro snap failed:', err);
            }
          }
          break;
        }
      }

      await this.delay(waitBetween);
    }

    return usedFallback ? 'warning' : 'success';
  }

  private async clickSelector(
    wc: Electron.WebContents,
    selector: string,
    fallbackXY?: [number, number],
  ): Promise<'ok' | 'fallback' | false> {
    if (selector) {
      const found = await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\\\'")}');
          if (el) { el.click(); return true; }
          return false;
        })()
      `).catch(() => false);
      if (found) return 'ok';
    }
    if (fallbackXY) {
      const [x, y] = fallbackXY;
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return 'fallback';
    }
    return false;
  }

  private async clickOff(wc: Electron.WebContents): Promise<void> {
    // Blur the active element, then click the body to trigger any apply/commit handlers
    await wc.executeJavaScript(`
      (function() {
        const active = document.activeElement;
        if (active && active !== document.body) {
          active.blur();
          active.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Click the body at a neutral spot to dismiss popups/dropdowns
        document.body.click();
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 }));
        document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 1, clientY: 1 }));
      })()
    `).catch(() => {});
    await this.delay(300);
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
