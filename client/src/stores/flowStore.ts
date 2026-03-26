import { create } from 'zustand';
import type { Flow, FlowStep, FlowConfig } from '@shared/types';
import { generateId } from '@/lib/utils';
import { flow as flowIpc } from '@/lib/ipc';
import { toast } from 'sonner';

interface FlowStore {
  flows: Flow[];
  activeFlowId: string | null;
  defaults: { stepWaitSeconds: number; navigationTimeoutSeconds: number };
  selectedStepIndex: number | null;

  // Computed
  getActiveFlow: () => Flow | undefined;

  // Flow CRUD
  loadFlows: () => Promise<void>;
  saveFlows: () => Promise<void>;
  createFlow: (name: string) => void;
  deleteFlow: (id: string) => void;
  renameFlow: (id: string, name: string) => void;
  duplicateFlow: (id: string) => void;
  setActiveFlow: (id: string | null) => void;
  updateFlowTemplate: (id: string, template: string) => void;
  updateFlowDescription: (id: string, description: string) => void;

  // Step operations
  addStep: (step: FlowStep) => void;
  removeStep: (stepId: string) => void;
  removeGroup: (groupId: string) => void;
  updateStep: (stepId: string, updates: Partial<FlowStep>) => void;
  moveStepUp: (stepId: string) => void;
  moveStepDown: (stepId: string) => void;
  reorderStep: (fromIndex: number, toIndex: number) => void;
  selectStep: (index: number | null) => void;

  // Defaults
  setStepWait: (seconds: number) => void;

  // Import/Export
  exportFlow: (id: string) => Promise<void>;
  importFlow: () => Promise<void>;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  flows: [],
  activeFlowId: null,
  defaults: { stepWaitSeconds: 8, navigationTimeoutSeconds: 30 },
  selectedStepIndex: null,

  getActiveFlow: () => {
    const { flows, activeFlowId } = get();
    return flows.find(f => f.id === activeFlowId);
  },

  loadFlows: async () => {
    try {
      const config = (await flowIpc.load()) as FlowConfig;
      if (config) {
        set({
          flows: config.flows || [],
          defaults: config.defaults || get().defaults,
          activeFlowId: config.flows?.[0]?.id || null,
        });
      }
    } catch (err) {
      console.error('Failed to load flows:', err);
    }
  },

  saveFlows: async () => {
    const { flows, defaults } = get();
    try {
      await flowIpc.save({ defaults, flows });
    } catch (err) {
      console.error('Failed to save flows:', err);
    }
  },

  createFlow: (name: string) => {
    const now = new Date().toISOString();
    const newFlow: Flow = {
      id: generateId('flow'),
      name,
      createdAt: now,
      updatedAt: now,
      steps: [],
    };
    set(state => ({
      flows: [...state.flows, newFlow],
      activeFlowId: newFlow.id,
      selectedStepIndex: null,
    }));
    get().saveFlows();
  },

  deleteFlow: (id: string) => {
    const deletedFlow = get().flows.find(f => f.id === id);
    set(state => {
      const remaining = state.flows.filter(f => f.id !== id);
      const switchedTo = state.activeFlowId === id ? remaining[0] : null;
      if (switchedTo) {
        toast(`Switched to "${switchedTo.name}"`);
      }
      return {
        flows: remaining,
        activeFlowId: state.activeFlowId === id ? (remaining[0]?.id || null) : state.activeFlowId,
        selectedStepIndex: null,
      };
    });
    get().saveFlows();
  },

  renameFlow: (id: string, name: string) => {
    set(state => ({
      flows: state.flows.map(f =>
        f.id === id ? { ...f, name, updatedAt: new Date().toISOString() } : f
      ),
    }));
    get().saveFlows();
  },

  duplicateFlow: (id: string) => {
    const source = get().flows.find(f => f.id === id);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: Flow = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId('flow'),
      name: `${source.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      steps: source.steps.map(s => ({ ...s, id: generateId('step') })),
    };
    set(state => ({
      flows: [...state.flows, copy],
      activeFlowId: copy.id,
    }));
    get().saveFlows();
  },

  setActiveFlow: (id: string | null) => {
    set({ activeFlowId: id, selectedStepIndex: null });
  },

  updateFlowTemplate: (id: string, template: string) => {
    set(state => ({
      flows: state.flows.map(f =>
        f.id === id ? { ...f, template, updatedAt: new Date().toISOString() } : f
      ),
    }));
    get().saveFlows();
  },

  updateFlowDescription: (id: string, description: string) => {
    set(state => ({
      flows: state.flows.map(f =>
        f.id === id ? { ...f, description, updatedAt: new Date().toISOString() } : f
      ),
    }));
    get().saveFlows();
  },

  addStep: async (step: FlowStep) => {
    const { activeFlowId } = get();
    if (!activeFlowId) return;

    // On first step, save the window size so playback can restore it
    const activeFlow = get().flows.find(f => f.id === activeFlowId);
    let windowSize = activeFlow?.recordedWindowSize;
    if (!windowSize && activeFlow?.steps.length === 0) {
      try {
        const { app: appIpc } = await import('@/lib/ipc');
        windowSize = (await appIpc.getWindowSize()) ?? undefined;
      } catch { /* non-Electron env */ }
    }

    set(state => ({
      flows: state.flows.map(f =>
        f.id === activeFlowId
          ? {
              ...f,
              steps: [...f.steps, step],
              updatedAt: new Date().toISOString(),
              ...(windowSize && !f.recordedWindowSize ? { recordedWindowSize: windowSize } : {}),
            }
          : f
      ),
    }));
    get().saveFlows();
  },

  removeStep: (stepId: string) => {
    const { activeFlowId } = get();
    if (!activeFlowId) return;
    set(state => ({
      flows: state.flows.map(f =>
        f.id === activeFlowId
          ? { ...f, steps: f.steps.filter(s => s.id !== stepId), updatedAt: new Date().toISOString() }
          : f
      ),
      selectedStepIndex: null,
    }));
    get().saveFlows();
  },

  removeGroup: (groupId: string) => {
    const { activeFlowId } = get();
    if (!activeFlowId) return;
    set(state => ({
      flows: state.flows.map(f =>
        f.id === activeFlowId
          ? { ...f, steps: f.steps.filter(s => s.group !== groupId), updatedAt: new Date().toISOString() }
          : f
      ),
      selectedStepIndex: null,
    }));
    get().saveFlows();
  },

  updateStep: (stepId: string, updates: Partial<FlowStep>) => {
    const { activeFlowId } = get();
    if (!activeFlowId) return;
    set(state => ({
      flows: state.flows.map(f =>
        f.id === activeFlowId
          ? {
              ...f,
              steps: f.steps.map(s => s.id === stepId ? { ...s, ...updates } as FlowStep : s),
              updatedAt: new Date().toISOString(),
            }
          : f
      ),
    }));
    get().saveFlows();
  },

  moveStepUp: (stepId: string) => {
    const flow = get().getActiveFlow();
    if (!flow) return;
    const idx = flow.steps.findIndex(s => s.id === stepId);
    if (idx <= 0) return;
    const steps = [...flow.steps];
    [steps[idx - 1], steps[idx]] = [steps[idx], steps[idx - 1]];
    set(state => ({
      flows: state.flows.map(f =>
        f.id === flow.id ? { ...f, steps, updatedAt: new Date().toISOString() } : f
      ),
      selectedStepIndex: idx - 1,
    }));
    get().saveFlows();
  },

  moveStepDown: (stepId: string) => {
    const flow = get().getActiveFlow();
    if (!flow) return;
    const idx = flow.steps.findIndex(s => s.id === stepId);
    if (idx < 0 || idx >= flow.steps.length - 1) return;
    const steps = [...flow.steps];
    [steps[idx], steps[idx + 1]] = [steps[idx + 1], steps[idx]];
    set(state => ({
      flows: state.flows.map(f =>
        f.id === flow.id ? { ...f, steps, updatedAt: new Date().toISOString() } : f
      ),
      selectedStepIndex: idx + 1,
    }));
    get().saveFlows();
  },

  reorderStep: (fromIndex: number, toIndex: number) => {
    const flow = get().getActiveFlow();
    if (!flow) return;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= flow.steps.length || toIndex >= flow.steps.length) return;
    const steps = [...flow.steps];
    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, moved);
    set(state => ({
      flows: state.flows.map(f =>
        f.id === flow.id ? { ...f, steps, updatedAt: new Date().toISOString() } : f
      ),
      selectedStepIndex: toIndex,
    }));
    get().saveFlows();
  },

  selectStep: (index: number | null) => set({ selectedStepIndex: index }),

  setStepWait: (seconds: number) => {
    set(state => ({ defaults: { ...state.defaults, stepWaitSeconds: seconds } }));
    get().saveFlows();
  },

  exportFlow: async (id: string) => {
    await flowIpc.exportFlow(id);
  },

  importFlow: async () => {
    const imported = (await flowIpc.importFlow()) as Flow | null;
    if (imported) {
      const now = new Date().toISOString();
      const flow: Flow = {
        ...imported,
        id: generateId('flow'),
        createdAt: now,
        updatedAt: now,
        steps: imported.steps.map(s => ({ ...s, id: generateId('step') })),
      };
      set(state => ({
        flows: [...state.flows, flow],
        activeFlowId: flow.id,
      }));
      get().saveFlows();
    }
  },
}));
