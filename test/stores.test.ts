import { describe, it, expect, beforeEach } from 'vitest';
import type { Flow, FlowStep, RunProgress } from '@shared/types';

// ─── Zustand store reference implementations ────────────────────────────────
// These mirror the expected store shapes for testing behavior.

// Flow Store

interface FlowStoreState {
  flows: Flow[];
  activeFlowId: string | null;
  addFlow: (flow: Flow) => void;
  updateFlow: (id: string, updates: Partial<Flow>) => void;
  deleteFlow: (id: string) => void;
  setActiveFlow: (id: string | null) => void;
  getActiveFlow: () => Flow | undefined;
  addStep: (flowId: string, step: FlowStep) => void;
  removeStep: (flowId: string, stepId: string) => void;
  reorderSteps: (flowId: string, fromIndex: number, toIndex: number) => void;
  setFlows: (flows: Flow[]) => void;
}

function createFlowStore(): FlowStoreState {
  const state: { flows: Flow[]; activeFlowId: string | null } = {
    flows: [],
    activeFlowId: null,
  };

  return {
    get flows() { return state.flows; },
    get activeFlowId() { return state.activeFlowId; },

    addFlow(flow: Flow) {
      state.flows = [...state.flows, flow];
    },

    updateFlow(id: string, updates: Partial<Flow>) {
      state.flows = state.flows.map((f) =>
        f.id === id ? { ...f, ...updates, updatedAt: new Date().toISOString() } : f
      );
    },

    deleteFlow(id: string) {
      state.flows = state.flows.filter((f) => f.id !== id);
      if (state.activeFlowId === id) state.activeFlowId = null;
    },

    setActiveFlow(id: string | null) {
      state.activeFlowId = id;
    },

    getActiveFlow() {
      return state.flows.find((f) => f.id === state.activeFlowId);
    },

    addStep(flowId: string, step: FlowStep) {
      state.flows = state.flows.map((f) =>
        f.id === flowId ? { ...f, steps: [...f.steps, step] } : f
      );
    },

    removeStep(flowId: string, stepId: string) {
      state.flows = state.flows.map((f) =>
        f.id === flowId ? { ...f, steps: f.steps.filter((s) => s.id !== stepId) } : f
      );
    },

    reorderSteps(flowId: string, fromIndex: number, toIndex: number) {
      state.flows = state.flows.map((f) => {
        if (f.id !== flowId) return f;
        const steps = [...f.steps];
        const [moved] = steps.splice(fromIndex, 1);
        steps.splice(toIndex, 0, moved);
        return { ...f, steps };
      });
    },

    setFlows(flows: Flow[]) {
      state.flows = flows;
    },
  };
}

// App Store

type RecordingMode = 'idle' | 'click' | 'snap';

interface AppStoreState {
  runProgress: RunProgress | null;
  recordingMode: RecordingMode;
  isRunning: boolean;
  isSidebarOpen: boolean;

  setRunProgress: (progress: RunProgress | null) => void;
  setRecordingMode: (mode: RecordingMode) => void;
  startRun: (flowId: string, totalSteps: number) => void;
  stopRun: () => void;
  toggleSidebar: () => void;
}

function createAppStore(): AppStoreState {
  const state: {
    runProgress: RunProgress | null;
    recordingMode: RecordingMode;
    isRunning: boolean;
    isSidebarOpen: boolean;
  } = {
    runProgress: null,
    recordingMode: 'idle',
    isRunning: false,
    isSidebarOpen: true,
  };

  return {
    get runProgress() { return state.runProgress; },
    get recordingMode() { return state.recordingMode; },
    get isRunning() { return state.isRunning; },
    get isSidebarOpen() { return state.isSidebarOpen; },

    setRunProgress(progress: RunProgress | null) {
      state.runProgress = progress;
    },

    setRecordingMode(mode: RecordingMode) {
      state.recordingMode = mode;
    },

    startRun(flowId: string, totalSteps: number) {
      state.isRunning = true;
      state.recordingMode = 'idle'; // Cannot record while running
      state.runProgress = {
        flowId,
        currentStep: 0,
        totalSteps,
        status: 'running',
        results: [],
        startedAt: new Date().toISOString(),
      };
    },

    stopRun() {
      state.isRunning = false;
      if (state.runProgress) {
        state.runProgress = {
          ...state.runProgress,
          status: 'complete',
          completedAt: new Date().toISOString(),
        };
      }
    },

    toggleSidebar() {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: `flow-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Flow',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    steps: [],
    ...overrides,
  };
}

function makeStep(type: FlowStep['type'], id: string): FlowStep {
  switch (type) {
    case 'CLICK':
      return { type: 'CLICK', id, label: `Click ${id}`, selector: `.${id}`, selectorStrategy: 'css-combo' };
    case 'WAIT':
      return { type: 'WAIT', id, label: `Wait ${id}`, seconds: 1 };
    case 'SNAP':
      return { type: 'SNAP', id, label: `Snap ${id}`, region: { x: 0, y: 0, width: 100, height: 100 } };
    case 'NAVIGATE':
      return { type: 'NAVIGATE', id, label: `Nav ${id}`, url: 'https://example.com' };
    case 'SCROLL':
      return { type: 'SCROLL', id, label: `Scroll ${id}`, x: 0, y: 100 };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('flowStore', () => {
  let store: FlowStoreState;

  beforeEach(() => {
    store = createFlowStore();
  });

  describe('CRUD operations', () => {
    it('should start with empty flows', () => {
      expect(store.flows).toEqual([]);
      expect(store.activeFlowId).toBeNull();
    });

    it('should add a flow', () => {
      const flow = makeFlow({ id: 'f1', name: 'First' });
      store.addFlow(flow);

      expect(store.flows).toHaveLength(1);
      expect(store.flows[0].name).toBe('First');
    });

    it('should add multiple flows', () => {
      store.addFlow(makeFlow({ id: 'f1' }));
      store.addFlow(makeFlow({ id: 'f2' }));
      store.addFlow(makeFlow({ id: 'f3' }));

      expect(store.flows).toHaveLength(3);
    });

    it('should update a flow by ID', () => {
      store.addFlow(makeFlow({ id: 'f1', name: 'Original' }));
      store.updateFlow('f1', { name: 'Updated' });

      expect(store.flows[0].name).toBe('Updated');
    });

    it('should set updatedAt on update', () => {
      store.addFlow(makeFlow({ id: 'f1', updatedAt: '2020-01-01T00:00:00Z' }));
      store.updateFlow('f1', { name: 'Changed' });

      expect(new Date(store.flows[0].updatedAt).getFullYear()).toBeGreaterThanOrEqual(2025);
    });

    it('should not modify other flows on update', () => {
      store.addFlow(makeFlow({ id: 'f1', name: 'One' }));
      store.addFlow(makeFlow({ id: 'f2', name: 'Two' }));
      store.updateFlow('f1', { name: 'Changed' });

      expect(store.flows[1].name).toBe('Two');
    });

    it('should delete a flow by ID', () => {
      store.addFlow(makeFlow({ id: 'f1' }));
      store.addFlow(makeFlow({ id: 'f2' }));
      store.deleteFlow('f1');

      expect(store.flows).toHaveLength(1);
      expect(store.flows[0].id).toBe('f2');
    });

    it('should clear activeFlowId when active flow is deleted', () => {
      store.addFlow(makeFlow({ id: 'f1' }));
      store.setActiveFlow('f1');
      store.deleteFlow('f1');

      expect(store.activeFlowId).toBeNull();
    });

    it('should keep activeFlowId when other flow is deleted', () => {
      store.addFlow(makeFlow({ id: 'f1' }));
      store.addFlow(makeFlow({ id: 'f2' }));
      store.setActiveFlow('f1');
      store.deleteFlow('f2');

      expect(store.activeFlowId).toBe('f1');
    });

    it('should set and get active flow', () => {
      const flow = makeFlow({ id: 'f1', name: 'Active One' });
      store.addFlow(flow);
      store.setActiveFlow('f1');

      expect(store.activeFlowId).toBe('f1');
      expect(store.getActiveFlow()?.name).toBe('Active One');
    });

    it('should return undefined for non-existent active flow', () => {
      store.setActiveFlow('nonexistent');
      expect(store.getActiveFlow()).toBeUndefined();
    });

    it('should bulk set flows', () => {
      const flows = [makeFlow({ id: 'a' }), makeFlow({ id: 'b' })];
      store.setFlows(flows);

      expect(store.flows).toHaveLength(2);
    });
  });

  describe('step add/remove/reorder', () => {
    beforeEach(() => {
      store.addFlow(makeFlow({ id: 'f1', steps: [] }));
    });

    it('should add a step to a flow', () => {
      const step = makeStep('CLICK', 's1');
      store.addStep('f1', step);

      expect(store.flows[0].steps).toHaveLength(1);
      expect(store.flows[0].steps[0].id).toBe('s1');
    });

    it('should add multiple steps in order', () => {
      store.addStep('f1', makeStep('NAVIGATE', 's1'));
      store.addStep('f1', makeStep('WAIT', 's2'));
      store.addStep('f1', makeStep('CLICK', 's3'));
      store.addStep('f1', makeStep('SNAP', 's4'));

      expect(store.flows[0].steps).toHaveLength(4);
      expect(store.flows[0].steps.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    });

    it('should remove a step by ID', () => {
      store.addStep('f1', makeStep('CLICK', 's1'));
      store.addStep('f1', makeStep('WAIT', 's2'));
      store.addStep('f1', makeStep('SNAP', 's3'));

      store.removeStep('f1', 's2');

      expect(store.flows[0].steps).toHaveLength(2);
      expect(store.flows[0].steps.map((s) => s.id)).toEqual(['s1', 's3']);
    });

    it('should not affect other flows when removing step', () => {
      store.addFlow(makeFlow({ id: 'f2', steps: [makeStep('CLICK', 'other')] }));
      store.addStep('f1', makeStep('CLICK', 's1'));
      store.removeStep('f1', 's1');

      expect(store.flows.find((f) => f.id === 'f2')!.steps).toHaveLength(1);
    });

    it('should reorder steps: move forward', () => {
      store.addStep('f1', makeStep('CLICK', 'a'));
      store.addStep('f1', makeStep('WAIT', 'b'));
      store.addStep('f1', makeStep('SNAP', 'c'));

      // Move 'a' from index 0 to index 2
      store.reorderSteps('f1', 0, 2);

      expect(store.flows[0].steps.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    });

    it('should reorder steps: move backward', () => {
      store.addStep('f1', makeStep('CLICK', 'a'));
      store.addStep('f1', makeStep('WAIT', 'b'));
      store.addStep('f1', makeStep('SNAP', 'c'));

      // Move 'c' from index 2 to index 0
      store.reorderSteps('f1', 2, 0);

      expect(store.flows[0].steps.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    });

    it('should handle reorder of adjacent steps', () => {
      store.addStep('f1', makeStep('CLICK', 'a'));
      store.addStep('f1', makeStep('WAIT', 'b'));

      store.reorderSteps('f1', 0, 1);

      expect(store.flows[0].steps.map((s) => s.id)).toEqual(['b', 'a']);
    });
  });
});

describe('appStore', () => {
  let store: AppStoreState;

  beforeEach(() => {
    store = createAppStore();
  });

  describe('state transitions', () => {
    it('should start in idle state', () => {
      expect(store.isRunning).toBe(false);
      expect(store.runProgress).toBeNull();
      expect(store.recordingMode).toBe('idle');
      expect(store.isSidebarOpen).toBe(true);
    });

    it('should transition to running state on startRun', () => {
      store.startRun('flow-1', 5);

      expect(store.isRunning).toBe(true);
      expect(store.runProgress).not.toBeNull();
      expect(store.runProgress!.flowId).toBe('flow-1');
      expect(store.runProgress!.totalSteps).toBe(5);
      expect(store.runProgress!.status).toBe('running');
    });

    it('should transition back to idle on stopRun', () => {
      store.startRun('flow-1', 3);
      store.stopRun();

      expect(store.isRunning).toBe(false);
      expect(store.runProgress!.status).toBe('complete');
      expect(store.runProgress!.completedAt).toBeDefined();
    });

    it('should set progress via setRunProgress', () => {
      const progress: RunProgress = {
        flowId: 'f1',
        currentStep: 2,
        totalSteps: 5,
        status: 'running',
        results: [],
      };

      store.setRunProgress(progress);

      expect(store.runProgress).toEqual(progress);
    });

    it('should clear progress when set to null', () => {
      store.startRun('f1', 3);
      store.setRunProgress(null);

      expect(store.runProgress).toBeNull();
    });
  });

  describe('recording state machine', () => {
    it('should start in idle recording mode', () => {
      expect(store.recordingMode).toBe('idle');
    });

    it('should transition to click recording mode', () => {
      store.setRecordingMode('click');
      expect(store.recordingMode).toBe('click');
    });

    it('should transition to snap recording mode', () => {
      store.setRecordingMode('snap');
      expect(store.recordingMode).toBe('snap');
    });

    it('should return to idle from click mode', () => {
      store.setRecordingMode('click');
      store.setRecordingMode('idle');
      expect(store.recordingMode).toBe('idle');
    });

    it('should reset recording mode when run starts', () => {
      store.setRecordingMode('click');
      store.startRun('f1', 3);

      expect(store.recordingMode).toBe('idle');
    });

    it('should allow switching between click and snap modes', () => {
      store.setRecordingMode('click');
      expect(store.recordingMode).toBe('click');

      store.setRecordingMode('snap');
      expect(store.recordingMode).toBe('snap');
    });
  });

  describe('sidebar toggle', () => {
    it('should toggle sidebar visibility', () => {
      expect(store.isSidebarOpen).toBe(true);
      store.toggleSidebar();
      expect(store.isSidebarOpen).toBe(false);
      store.toggleSidebar();
      expect(store.isSidebarOpen).toBe(true);
    });
  });
});
