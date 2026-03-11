import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockWebContents } from './setup';
import type {
  Flow,
  FlowStep,
  ClickStep,
  WaitStep,
  SnapStep,
  NavigateStep,
  ScrollStep,
  RunProgress,
  RunStepResult,
} from '@shared/types';

// ─── Flow Runner module mock ─────────────────────────────────────────────────
// Since the actual module doesn't exist yet, we define the expected interface
// and a reference implementation that tests will validate against.

interface FlowRunnerOptions {
  webContents: ReturnType<typeof createMockWebContents>;
  onProgress: (progress: RunProgress) => void;
  screenshotDir: string;
  defaults: {
    stepWaitSeconds: number;
    navigationTimeoutSeconds: number;
  };
}

class FlowRunner {
  private webContents: ReturnType<typeof createMockWebContents>;
  private onProgress: (progress: RunProgress) => void;
  private screenshotDir: string;
  private defaults: FlowRunnerOptions['defaults'];
  private stopped = false;
  private progress: RunProgress;

  constructor(options: FlowRunnerOptions) {
    this.webContents = options.webContents;
    this.onProgress = options.onProgress;
    this.screenshotDir = options.screenshotDir;
    this.defaults = options.defaults;
    this.progress = {
      flowId: '',
      currentStep: 0,
      totalSteps: 0,
      status: 'idle',
      results: [],
    };
  }

  async run(flow: Flow): Promise<RunStepResult[]> {
    this.stopped = false;
    this.progress = {
      flowId: flow.id,
      currentStep: 0,
      totalSteps: flow.steps.length,
      status: 'running',
      results: [],
      startedAt: new Date().toISOString(),
    };
    this.onProgress({ ...this.progress });

    for (let i = 0; i < flow.steps.length; i++) {
      if (this.stopped) {
        this.progress.status = 'complete';
        this.progress.completedAt = new Date().toISOString();
        this.onProgress({ ...this.progress });
        return this.progress.results;
      }

      this.progress.currentStep = i;
      this.onProgress({ ...this.progress });

      const step = flow.steps[i];
      const result = await this.executeStep(step);
      this.progress.results.push(result);

      if (result.status === 'error') {
        this.progress.status = 'error';
        this.progress.completedAt = new Date().toISOString();
        this.onProgress({ ...this.progress });
        return this.progress.results;
      }
    }

    this.progress.status = 'complete';
    this.progress.completedAt = new Date().toISOString();
    this.onProgress({ ...this.progress });
    return this.progress.results;
  }

  stop() {
    this.stopped = true;
  }

  private async executeStep(step: FlowStep): Promise<RunStepResult> {
    const startTime = Date.now();

    try {
      switch (step.type) {
        case 'CLICK':
          return await this.executeClick(step);
        case 'WAIT':
          return await this.executeWait(step);
        case 'SNAP':
          return await this.executeSnap(step);
        case 'NAVIGATE':
          return await this.executeNavigate(step);
        case 'SCROLL':
          return await this.executeScroll(step);
        default:
          return {
            stepId: (step as FlowStep).id,
            status: 'error',
            message: `Unknown step type`,
            duration: Date.now() - startTime,
          };
      }
    } catch (err) {
      return {
        stepId: step.id,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeClick(step: ClickStep): Promise<RunStepResult> {
    const startTime = Date.now();

    // Try to find element by selector
    const found = await this.webContents.executeJavaScript(
      `!!document.querySelector('${step.selector}')`
    );

    if (found) {
      await this.webContents.executeJavaScript(
        `document.querySelector('${step.selector}').click()`
      );
      return {
        stepId: step.id,
        status: 'success',
        message: `Clicked ${step.selector}`,
        duration: Date.now() - startTime,
      };
    }

    // Fallback to XY coordinates
    if (step.fallbackXY) {
      await this.webContents.executeJavaScript(
        `document.elementFromPoint(${step.fallbackXY[0]}, ${step.fallbackXY[1]})?.click()`
      );
      return {
        stepId: step.id,
        status: 'warning',
        message: `Selector not found, used fallback XY [${step.fallbackXY}]`,
        duration: Date.now() - startTime,
      };
    }

    return {
      stepId: step.id,
      status: 'error',
      message: `Selector "${step.selector}" not found and no fallbackXY provided`,
      duration: Date.now() - startTime,
    };
  }

  private async executeWait(step: WaitStep): Promise<RunStepResult> {
    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, step.seconds * 1000));
    return {
      stepId: step.id,
      status: 'success',
      message: `Waited ${step.seconds}s`,
      duration: Date.now() - startTime,
    };
  }

  private async executeSnap(step: SnapStep): Promise<RunStepResult> {
    const startTime = Date.now();
    const image = await this.webContents.capturePage(
      step.fullPage ? undefined : step.region
    );
    const screenshotPath = `${this.screenshotDir}/${step.id}.png`;
    return {
      stepId: step.id,
      status: 'success',
      message: `Captured screenshot`,
      screenshotPath,
      duration: Date.now() - startTime,
    };
  }

  private async executeNavigate(step: NavigateStep): Promise<RunStepResult> {
    const startTime = Date.now();
    const timeoutMs = this.defaults.navigationTimeoutSeconds * 1000;

    const loadPromise = this.webContents.loadURL(step.url);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Navigation timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    await Promise.race([loadPromise, timeoutPromise]);

    return {
      stepId: step.id,
      status: 'success',
      message: `Navigated to ${step.url}`,
      duration: Date.now() - startTime,
    };
  }

  private async executeScroll(step: ScrollStep): Promise<RunStepResult> {
    const startTime = Date.now();
    await this.webContents.executeJavaScript(
      `window.scrollTo(${step.x}, ${step.y})`
    );
    return {
      stepId: step.id,
      status: 'success',
      message: `Scrolled to (${step.x}, ${step.y})`,
      duration: Date.now() - startTime,
    };
  }
}

// ─── Test helpers ────────────────────────────────────────────────────────────

function createTestFlow(steps: FlowStep[]): Flow {
  return {
    id: 'test-flow-1',
    name: 'Test Flow',
    description: 'A flow for testing',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    steps,
  };
}

function createRunner(overrides: Partial<FlowRunnerOptions> = {}) {
  const webContents = createMockWebContents();
  const onProgress = vi.fn();
  const runner = new FlowRunner({
    webContents,
    onProgress,
    screenshotDir: '/mock/screenshots',
    defaults: {
      stepWaitSeconds: 1,
      navigationTimeoutSeconds: 30,
    },
    ...overrides,
  });
  return { runner, webContents, onProgress };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FlowRunner', () => {
  describe('CLICK step execution', () => {
    it('should click element when selector is found', async () => {
      const { runner, webContents, onProgress } = createRunner();
      webContents.executeJavaScript
        .mockResolvedValueOnce(true) // selector check returns true
        .mockResolvedValueOnce(undefined); // click action

      const step: ClickStep = {
        type: 'CLICK',
        id: 'click-1',
        label: 'Click Login',
        selector: '[data-testid="login-btn"]',
        selectorStrategy: 'data-attr',
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].stepId).toBe('click-1');
      expect(webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('[data-testid="login-btn"]')
      );
    });

    it('should use fallbackXY when selector is not found', async () => {
      const { runner, webContents } = createRunner();
      webContents.executeJavaScript
        .mockResolvedValueOnce(false) // selector not found
        .mockResolvedValueOnce(undefined); // click via XY

      const step: ClickStep = {
        type: 'CLICK',
        id: 'click-2',
        label: 'Click fallback',
        selector: '.nonexistent',
        fallbackXY: [500, 300],
        selectorStrategy: 'css-combo',
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('warning');
      expect(results[0].message).toContain('fallback XY');
      expect(webContents.executeJavaScript).toHaveBeenCalledWith(
        expect.stringContaining('elementFromPoint(500, 300)')
      );
    });

    it('should error when selector not found and no fallback', async () => {
      const { runner, webContents } = createRunner();
      webContents.executeJavaScript.mockResolvedValueOnce(false);

      const step: ClickStep = {
        type: 'CLICK',
        id: 'click-3',
        label: 'Click missing',
        selector: '.missing',
        selectorStrategy: 'css-combo',
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].message).toContain('not found');
      expect(results[0].message).toContain('no fallbackXY');
    });
  });

  describe('WAIT step execution', () => {
    it('should delay for the specified seconds', async () => {
      vi.useFakeTimers();
      const { runner, onProgress } = createRunner();

      const step: WaitStep = {
        type: 'WAIT',
        id: 'wait-1',
        label: 'Wait 2 seconds',
        seconds: 2,
      };

      const runPromise = runner.run(createTestFlow([step]));
      await vi.advanceTimersByTimeAsync(2000);
      const results = await runPromise;

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].message).toContain('2s');

      vi.useRealTimers();
    });

    it('should report correct step ID', async () => {
      vi.useFakeTimers();
      const { runner } = createRunner();

      const step: WaitStep = {
        type: 'WAIT',
        id: 'wait-specific-id',
        label: 'Short wait',
        seconds: 0.1,
      };

      const runPromise = runner.run(createTestFlow([step]));
      await vi.advanceTimersByTimeAsync(100);
      const results = await runPromise;

      expect(results[0].stepId).toBe('wait-specific-id');
      vi.useRealTimers();
    });
  });

  describe('SNAP step execution', () => {
    it('should capture a region screenshot', async () => {
      const { runner, webContents } = createRunner();

      const step: SnapStep = {
        type: 'SNAP',
        id: 'snap-1',
        label: 'Capture chart',
        region: { x: 100, y: 200, width: 800, height: 600 },
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].screenshotPath).toBe('/mock/screenshots/snap-1.png');
      expect(webContents.capturePage).toHaveBeenCalledWith(
        expect.objectContaining({ x: 100, y: 200, width: 800, height: 600 })
      );
    });

    it('should capture full page when fullPage is set', async () => {
      const { runner, webContents } = createRunner();

      const step: SnapStep = {
        type: 'SNAP',
        id: 'snap-full',
        label: 'Full page capture',
        region: { x: 0, y: 0, width: 1920, height: 1080 },
        fullPage: true,
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results[0].status).toBe('success');
      expect(webContents.capturePage).toHaveBeenCalledWith(undefined);
    });
  });

  describe('NAVIGATE step execution', () => {
    it('should navigate to the specified URL', async () => {
      const { runner, webContents } = createRunner();

      const step: NavigateStep = {
        type: 'NAVIGATE',
        id: 'nav-1',
        label: 'Go to dashboard',
        url: 'https://dashboard.example.com/reports',
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].message).toContain('https://dashboard.example.com/reports');
      expect(webContents.loadURL).toHaveBeenCalledWith(
        'https://dashboard.example.com/reports'
      );
    });

    it('should error on navigation timeout', async () => {
      vi.useFakeTimers();
      const { runner, webContents } = createRunner({
        webContents: (() => {
          const wc = createMockWebContents();
          wc.loadURL.mockImplementation(
            () => new Promise(() => {}) // never resolves
          );
          return wc;
        })(),
      });

      const step: NavigateStep = {
        type: 'NAVIGATE',
        id: 'nav-timeout',
        label: 'Slow page',
        url: 'https://slow.example.com',
      };

      const runPromise = runner.run(createTestFlow([step]));
      await vi.advanceTimersByTimeAsync(30000);
      const results = await runPromise;

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].message).toContain('timeout');

      vi.useRealTimers();
    });
  });

  describe('run progress updates', () => {
    it('should emit progress for each step', async () => {
      const { runner, webContents, onProgress } = createRunner();
      webContents.executeJavaScript.mockResolvedValue(true);

      const flow = createTestFlow([
        { type: 'CLICK', id: 's1', label: 'Step 1', selector: '.a', selectorStrategy: 'css-combo' as const },
        { type: 'CLICK', id: 's2', label: 'Step 2', selector: '.b', selectorStrategy: 'css-combo' as const },
      ]);

      await runner.run(flow);

      // Initial + step 0 + step 1 + complete = at least 4 calls
      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      const firstCall = calls[0][0] as RunProgress;
      expect(firstCall.status).toBe('running');
      expect(firstCall.totalSteps).toBe(2);

      const lastCall = calls[calls.length - 1][0] as RunProgress;
      expect(lastCall.status).toBe('complete');
      expect(lastCall.completedAt).toBeDefined();
    });

    it('should include startedAt timestamp', async () => {
      vi.useFakeTimers();
      const { runner, onProgress } = createRunner();

      const step: WaitStep = { type: 'WAIT', id: 'w1', label: 'wait', seconds: 0.01 };
      const runPromise = runner.run(createTestFlow([step]));
      await vi.advanceTimersByTimeAsync(10);
      await runPromise;

      const firstProgress = onProgress.mock.calls[0][0] as RunProgress;
      expect(firstProgress.startedAt).toBeDefined();
      expect(new Date(firstProgress.startedAt!).getTime()).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('stop mid-run', () => {
    it('should stop execution between steps', async () => {
      vi.useFakeTimers();
      const { runner, onProgress } = createRunner();

      const flow = createTestFlow([
        { type: 'WAIT', id: 'w1', label: 'Wait 1', seconds: 0.1 },
        { type: 'WAIT', id: 'w2', label: 'Wait 2', seconds: 0.1 },
        { type: 'WAIT', id: 'w3', label: 'Wait 3', seconds: 0.1 },
      ]);

      const runPromise = runner.run(flow);

      // Let first step complete, then stop
      await vi.advanceTimersByTimeAsync(100);
      runner.stop();
      await vi.advanceTimersByTimeAsync(100);
      const results = await runPromise;

      // Should have completed at most 2 steps (first completes, stop checked before third)
      expect(results.length).toBeLessThan(3);

      const lastProgress = onProgress.mock.calls[onProgress.mock.calls.length - 1][0] as RunProgress;
      expect(lastProgress.status).toBe('complete');

      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should catch and report step execution errors', async () => {
      const { runner, webContents } = createRunner();
      webContents.executeJavaScript.mockRejectedValueOnce(
        new Error('Element detached from DOM')
      );

      const step: ClickStep = {
        type: 'CLICK',
        id: 'err-1',
        label: 'Broken click',
        selector: '.detached',
        selectorStrategy: 'css-combo',
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].message).toContain('Element detached from DOM');
    });

    it('should stop run on error and set error status', async () => {
      const { runner, webContents, onProgress } = createRunner();
      webContents.executeJavaScript.mockRejectedValueOnce(new Error('fail'));

      const flow = createTestFlow([
        { type: 'CLICK', id: 'c1', label: 'Fail', selector: '.x', selectorStrategy: 'css-combo' as const },
        { type: 'WAIT', id: 'w1', label: 'Never reached', seconds: 1 },
      ]);

      const results = await runner.run(flow);

      expect(results).toHaveLength(1); // Second step never executed
      const lastProgress = onProgress.mock.calls[onProgress.mock.calls.length - 1][0] as RunProgress;
      expect(lastProgress.status).toBe('error');
    });

    it('should include duration even on error', async () => {
      const { runner, webContents } = createRunner();
      webContents.executeJavaScript.mockRejectedValueOnce(new Error('timeout'));

      const step: ClickStep = {
        type: 'CLICK',
        id: 'dur-err',
        label: 'Timed error',
        selector: '.timeout',
        selectorStrategy: 'css-combo',
      };

      const results = await runner.run(createTestFlow([step]));

      expect(results[0].duration).toBeDefined();
      expect(results[0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('multi-step flow', () => {
    it('should execute all step types in sequence', async () => {
      vi.useFakeTimers();
      const { runner, webContents } = createRunner();
      webContents.executeJavaScript.mockResolvedValue(true);

      const flow = createTestFlow([
        { type: 'NAVIGATE', id: 'n1', label: 'Go', url: 'https://example.com' },
        { type: 'WAIT', id: 'w1', label: 'Wait', seconds: 0.01 },
        { type: 'CLICK', id: 'c1', label: 'Click', selector: '.btn', selectorStrategy: 'css-combo' as const },
        { type: 'SNAP', id: 's1', label: 'Snap', region: { x: 0, y: 0, width: 1920, height: 1080 } },
        { type: 'SCROLL', id: 'sc1', label: 'Scroll', x: 0, y: 500 },
      ]);

      const runPromise = runner.run(flow);
      await vi.advanceTimersByTimeAsync(10);
      const results = await runPromise;

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.status === 'success')).toBe(true);

      vi.useRealTimers();
    });
  });
});
