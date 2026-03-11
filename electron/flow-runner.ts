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
  private _delayResolve: (() => void) | null = null;
  private _runTimestamp: string = '';

  private generateRunTimestamp(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  }

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
    this._runTimestamp = this.generateRunTimestamp();

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

    this._runTimestamp = this.generateRunTimestamp();

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
    this._runTimestamp = this.generateRunTimestamp();

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

    // Resolve any pending delay immediately so the run loop exits fast
    if (this._delayResolve) {
      this._delayResolve();
      this._delayResolve = null;
    }

    // Immediately tell the UI we've stopped
    this.sendProgress({
      flowId: '',
      currentStep: 0,
      totalSteps: 0,
      status: 'complete',
      results: [],
      completedAt: new Date().toISOString(),
    });

    this.running = false;
  }

  private async executeStep(
    step: FlowStep,
    defaults: { stepWaitSeconds: number; navigationTimeoutSeconds: number },
    outputDir: string,
    screenshots: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
    logLines: string[],
  ): Promise<RunStepResult> {
    const result: RunStepResult = { stepId: step.id, status: 'pending' };
    logLines.push(`Step: ${step.type} — ${step.label}`);
    // Per-step wait override with 1.5327s minimum, falling back to global default
    const wait = Math.max(1.5327, step.waitOverride ?? defaults.stepWaitSeconds);
    console.log(`[Playback] ── Step: ${step.type} — ${step.label} (wait: ${wait}s, selector: ${(step as any).selector || 'none'}, strategy: ${(step as any).selectorStrategy || 'n/a'})`);

    try {
      switch (step.type) {
        case 'CLICK':
          if (step.keyPress) {
            result.status = await this.executeKeyPress(step, wait);
          } else {
            result.status = await this.executeClick(step, wait);
          }
          break;

        case 'WAIT':
          await this.delay(step.seconds * 1000);
          result.status = 'success';
          break;

        case 'SNAP': {
          // Wait for page to finish rendering before capturing
          await this.delay(wait * 1000);
          const screenshotPath = await this.executeSnap(step, outputDir, screenshots.length);
          if (screenshotPath) {
            screenshots.push({ name: step.label, path: screenshotPath, slideLayout: (step as SnapStep).slideLayout });
            result.screenshotPath = screenshotPath;
            result.status = 'success';
          } else {
            result.status = 'error';
            result.message = 'Screenshot capture failed';
          }
          await this.delay(wait * 1000);
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
          result.status = await this.executeHover(step, wait);
          break;

        case 'SELECT':
          result.status = await this.executeSelect(step, wait);
          break;

        case 'TYPE':
          result.status = await this.executeType(step, wait);
          break;

        case 'SCROLL_ELEMENT':
          result.status = await this.executeScrollElement(step);
          break;

        case 'SEARCH_SELECT':
          result.status = await this.executeSearchSelect(step, wait);
          break;

        case 'FILTER':
          result.status = await this.executeFilter(step, wait);
          break;

        case 'MACRO':
          result.status = await this.executeMacro(step, defaults, outputDir, screenshots);
          break;
      }
    } catch (err) {
      result.status = 'error';
      result.message = String(err);
      console.log(`[Playback] ── Step ERROR: ${String(err)}`);
    }

    console.log(`[Playback] ── Step result: ${result.status} (URL: ${this.view.webContents.getURL().substring(0, 80)})`);
    return result;
  }

  /**
   * After firing a click, wait smartly: if navigation starts, wait for page load.
   * Otherwise wait a short default. Returns quickly when the page is ready.
   */
  private async waitAfterClick(wc: Electron.WebContents, waitSeconds: number): Promise<void> {
    // Listen for navigation starting within 500ms of the click
    const navStarted = await new Promise<boolean>((resolve) => {
      let resolved = false;
      const onStart = () => { if (!resolved) { resolved = true; resolve(true); } };
      wc.once('did-start-loading', onStart);
      setTimeout(() => {
        wc.removeListener('did-start-loading', onStart);
        if (!resolved) { resolved = true; resolve(false); }
      }, 500);
    });

    if (navStarted) {
      // Navigation detected — wait for page to finish loading (up to 10s)
      console.log('[Playback] Navigation detected, waiting for page load...');
      await new Promise<void>((resolve) => {
        let resolved = false;
        const onStop = () => { if (!resolved) { resolved = true; resolve(); } };
        wc.once('did-stop-loading', onStop);
        setTimeout(() => { wc.removeListener('did-stop-loading', onStop); onStop(); }, 10000);
      });
      // Short settle time for dynamic content after load
      await this.delay(800);
      console.log('[Playback] Page loaded, continuing.');
    } else {
      // No navigation — just a regular click, use configured wait
      await this.delay(waitSeconds * 1000);
    }
  }

  private async executeClick(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string },
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;

    // Try selector with retries — element may not exist yet after page navigation
    if (step.selector) {
      for (let attempt = 0; attempt < 5; attempt++) {
        console.log(`[Playback] Click: finding "${step.selector}" (attempt ${attempt + 1}/5, strategy: ${step.selectorStrategy})`);
        const clicked = await this.clickElementBySelector(wc, step.selector);

        if (clicked) {
          console.log(`[Playback] Click: success via el.click()`);
          await this.waitAfterClick(wc, waitSeconds);
          return 'success';
        }
        console.log(`[Playback] Click: selector not found, retrying in 1s...`);
        await this.delay(1000);
      }
      console.log(`[Playback] Click: selector "${step.selector}" failed after 5 attempts`);
    }

    // Fallback to stored XY coordinates
    if (step.fallbackXY) {
      const [x, y] = step.fallbackXY;
      console.log(`[Playback] Click: using fallback XY (${x}, ${y})`);
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      await this.waitAfterClick(wc, waitSeconds);
      return 'warning';
    }

    throw new Error(`Element not found: ${step.selector}`);
  }

  /**
   * Find element by selector (CSS or xpath:) and click it using multiple methods:
   * 1. el.click() — standard DOM click
   * 2. Dispatch mousedown + mouseup + click events — catches handlers listening
   *    for mousedown/pointerdown (common in custom dropdown/popup components)
   * This ensures clicks work across different UI frameworks and event patterns.
   */
  private async clickElementBySelector(wc: Electron.WebContents, selector: string): Promise<boolean> {
    const clickScript = `
      (function() {
        var el = __DS_FIND_EL__;
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        // Fire full event sequence: pointerdown → mousedown → pointerup → mouseup → click
        var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
        return { x: Math.round(cx), y: Math.round(cy), tag: el.tagName, text: (el.textContent || '').trim().substring(0, 40) };
      })()
    `;

    let findExpr: string;
    if (selector.startsWith('xpath:')) {
      const xpath = selector.substring(6);
      findExpr = `(function() { var r = document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return r.singleNodeValue; })()`;
    } else {
      findExpr = `document.querySelector(${JSON.stringify(selector)})`;
    }

    const result = await wc.executeJavaScript(
      clickScript.replace('__DS_FIND_EL__', findExpr)
    ).catch(() => null);

    if (result) {
      console.log(`[Playback] clickElement: hit <${result.tag}> "${result.text}" at (${result.x}, ${result.y})`);
      return true;
    }
    return false;
  }

  private async executeKeyPress(
    step: { selector: string; fallbackXY?: [number, number]; selectorStrategy: string; keyPress?: string },
    waitSeconds: number,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;
    const key = step.keyPress || 'Enter';

    // Focus the element first if we have a selector
    if (step.selector) {
      await wc.executeJavaScript(`
        (function() {
          const el = document.querySelector(${JSON.stringify(step.selector)});
          if (el) el.focus();
        })()
      `).catch(() => {});
    }

    // Send the keypress
    console.log(`[Playback] KeyPress: ${key}`);
    wc.sendInputEvent({ type: 'keyDown', keyCode: key });
    wc.sendInputEvent({ type: 'keyUp', keyCode: key });

    // Use smart wait — detects navigation automatically
    await this.waitAfterClick(wc, waitSeconds);
    return 'success';
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
      const filename = `snap_${this._runTimestamp}_${String(index + 1).padStart(2, '0')}${varSuffix}.png`;
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
          const el = document.querySelector(${JSON.stringify(step.selector)});
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
          const el = document.querySelector(${JSON.stringify(step.selector)});
          if (el && el.tagName === 'SELECT') {
            el.value = ${JSON.stringify(step.optionValue)};
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
          const el = document.querySelector(${JSON.stringify(step.selector)});
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
          const el = document.querySelector(${JSON.stringify(step.selector)});
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
          const el = document.querySelector(${JSON.stringify(step.selector)});
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
        const searchText = ${JSON.stringify(searchText)};
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
    defaults: { stepWaitSeconds: number; navigationTimeoutSeconds: number },
    outputDir?: string,
    screenshots?: Array<{ name: string; path: string; slideLayout?: PptxLayout }>,
  ): Promise<'success' | 'warning'> {
    const wc = this.view.webContents;
    // Use waitBetween (default 500ms) for inter-action delays — much shorter than
    // stepWaitSeconds so dropdown interactions don't time out between clicks
    const interActionMs = step.waitBetween != null ? step.waitBetween : 500;
    const interActionSec = interActionMs / 1000;
    let worstStatus: 'success' | 'warning' = 'success';

    for (let i = 0; i < step.actions.length; i++) {
      const action = step.actions[i];
      if (this.shouldStop) break;

      console.log(`[Playback] Macro action ${i + 1}/${step.actions.length}: ${action.action} — "${action.label || ''}" selector="${action.selector || 'none'}"`);

      let status: 'success' | 'warning' = 'success';

      switch (action.action) {
        case 'click': {
          status = await this.executeClick(
            { selector: action.selector || '', fallbackXY: action.fallbackXY, selectorStrategy: action.selectorStrategy || 'css' },
            interActionSec,
          );
          break;
        }

        case 'type': {
          status = await this.executeType(
            {
              selector: action.selector || '',
              fallbackXY: action.fallbackXY,
              selectorStrategy: action.selectorStrategy || 'css',
              text: action.value || '',
              clearFirst: true,
              clickOffAfter: false,
            },
            interActionSec,
          );
          break;
        }

        case 'select': {
          status = await this.executeSelect(
            {
              selector: action.selector || '',
              fallbackXY: action.fallbackXY,
              selectorStrategy: action.selectorStrategy || 'css',
              optionValue: this.substituteVariables(action.value || ''),
              clickOffAfter: false,
            },
            interActionSec,
          );
          break;
        }

        case 'scroll': {
          if (action.scrollTarget) {
            if (action.scrollTarget.isPage) {
              await wc.executeJavaScript(
                `window.scrollTo(${action.scrollTarget.x}, ${action.scrollTarget.y})`
              );
            } else if (action.selector) {
              status = await this.executeScrollElement({
                selector: action.selector,
                fallbackXY: action.fallbackXY,
                selectorStrategy: action.selectorStrategy || 'css',
                scrollTop: action.scrollTarget.y,
                scrollLeft: action.scrollTarget.x,
              });
            }
          }
          await this.delay(interActionMs);
          break;
        }

        case 'snap': {
          if (action.snapRegion && outputDir && screenshots) {
            try {
              const image = await wc.capturePage({
                x: action.snapRegion.x,
                y: action.snapRegion.y,
                width: action.snapRegion.width,
                height: action.snapRegion.height,
              });
              const varSuffix = Object.keys(this.currentVariables).length > 0
                ? '_' + Object.values(this.currentVariables).join('_').replace(/[^a-zA-Z0-9_-]/g, '')
                : '';
              const filename = `snap_${this._runTimestamp}_${String(screenshots.length + 1).padStart(2, '0')}${varSuffix}.png`;
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
          await this.delay(interActionMs);
          break;
        }

        case 'key': {
          status = await this.executeKeyPress(
            { selector: action.selector || '', fallbackXY: action.fallbackXY, selectorStrategy: action.selectorStrategy || 'css', keyPress: action.key || 'Enter' },
            interActionSec,
          );
          break;
        }
      }

      if (status === 'warning') worstStatus = 'warning';
    }

    return worstStatus;
  }

  private async clickSelector(
    wc: Electron.WebContents,
    selector: string,
    fallbackXY?: [number, number],
  ): Promise<'ok' | 'fallback' | false> {
    if (selector) {
      const clicked = await this.clickElementBySelector(wc, selector);
      if (clicked) {
        console.log(`[Playback] clickSelector: found and clicked "${selector}"`);
        return 'ok';
      }
      console.log(`[Playback] clickSelector: "${selector}" not found`);
    }
    if (fallbackXY) {
      const [x, y] = fallbackXY;
      console.log(`[Playback] clickSelector: using fallback XY (${x}, ${y})`);
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
    return new Promise(resolve => {
      this._delayResolve = resolve;
      setTimeout(() => {
        this._delayResolve = null;
        resolve();
      }, ms);
    });
  }

  private sendProgress(progress: RunProgress) {
    this.window.webContents.send('flow:progress', { ...progress });
  }
}
