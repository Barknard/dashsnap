import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import { CircleDot, Play, Tag, Images } from 'lucide-react';
import { TooltipProvider } from './components/ui/Tooltip';
import { Header } from './components/Header';
import { UrlBar } from './components/UrlBar';
import { FlowMenu } from './components/FlowMenu';
import { FlowPicker } from './components/FlowPicker';
import { RecordPanel } from './components/RecordPanel';
import { RunPanel } from './components/RunPanel';
import { OutputGallery } from './components/OutputGallery';
import { SettingsDialog } from './components/SettingsDialog';
import { StepEditDialog } from './components/StepEditDialog';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { useFlowStore } from './stores/flowStore';
import { useAppStore } from './stores/appStore';
import { recorder, app as appIpc, flow as flowIpc } from './lib/ipc';
import { generateId } from './lib/utils';
import type { FlowStep, ClickStep, SnapStep, HoverStep, SelectStep, TypeStep, ScrollElementStep, SearchSelectStep, FilterStep, MacroStep, MacroAction, RunProgress } from '@shared/types';
import { toast } from 'sonner';

export default function App() {
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const loadSettings = useAppStore(s => s.loadSettings);
  const setVersion = useAppStore(s => s.setVersion);
  const setUpdateAvailable = useAppStore(s => s.setUpdateAvailable);
  const stopRecording = useAppStore(s => s.stopRecording);
  const setRunProgress = useAppStore(s => s.setRunProgress);
  const setUpdateStatus = useAppStore(s => s.setUpdateStatus);
  const setUpdateProgress = useAppStore(s => s.setUpdateProgress);
  const setUpdateError = useAppStore(s => s.setUpdateError);
  const setUpdateDownloadComplete = useAppStore(s => s.setUpdateDownloadComplete);

  const loadFlows = useFlowStore(s => s.loadFlows);
  const addStep = useFlowStore(s => s.addStep);
  const activeFlowId = useFlowStore(s => s.activeFlowId);

  const [editingStep, setEditingStep] = useState<FlowStep | null>(null);

  // Name prompt state (replaces window.prompt)
  const [namePrompt, setNamePrompt] = useState<{
    open: boolean;
    defaultName: string;
    step: FlowStep | null;
  }>({ open: false, defaultName: '', step: null });
  const [nameInput, setNameInput] = useState('');

  const handleNameConfirm = () => {
    if (namePrompt.step) {
      const step = { ...namePrompt.step, label: nameInput.trim() || namePrompt.defaultName };
      addStep(step);
      toast.success(`Recorded: ${step.label}`);
    }
    setNamePrompt({ open: false, defaultName: '', step: null });
    setNameInput('');
  };

  const handleNameCancel = () => {
    setNamePrompt({ open: false, defaultName: '', step: null });
    setNameInput('');
  };

  // Initialize
  useEffect(() => {
    loadFlows();
    loadSettings();
    appIpc.getVersion().then(setVersion);

    appIpc.onUpdateChecking(() => setUpdateStatus('checking'));
    appIpc.onUpdateAvailable((v: string, releaseUrl?: string) => {
      setUpdateAvailable(v, releaseUrl);
      toast.info(`Update v${v} available!`);
    });
    appIpc.onUpdateNotAvailable(() => setUpdateStatus('up-to-date'));
    appIpc.onUpdateDownloadProgress((percent: number) => setUpdateProgress(percent));
    appIpc.onUpdateDownloaded(() => {
      setUpdateStatus('downloaded');
      toast.success('Update downloaded — restart to apply.');
    });
    appIpc.onUpdateDownloadComplete((filePath: string) => {
      setUpdateDownloadComplete(filePath);
      toast.success('Update downloaded to Downloads folder!');
    });
    appIpc.onUpdateError((message: string) => setUpdateError(message));
  }, [loadFlows, loadSettings, setVersion, setUpdateAvailable, setUpdateStatus, setUpdateProgress, setUpdateError, setUpdateDownloadComplete]);

  // Listen for recorded elements
  useEffect(() => {
    const handleElementPicked = (data: { selector: string; label: string; strategy: string; xy: [number, number]; rect?: { x: number; y: number; width: number; height: number } }) => {
      const currentRecordingType = useAppStore.getState().recordingType;
      stopRecording();

      const selectorStrategy = data.strategy as ClickStep['selectorStrategy'];

      let step: FlowStep;

      if (currentRecordingType === 'snap' && data.rect) {
        step = {
          type: 'SNAP',
          id: generateId('step'),
          label: data.label || 'Screenshot',
          region: data.rect,
        } as SnapStep;
      } else if (currentRecordingType === 'hover') {
        step = {
          type: 'HOVER',
          id: generateId('step'),
          label: `Hover: ${data.label || 'element'}`,
          selector: data.selector,
          selectorStrategy,
          fallbackXY: data.xy,
        } as HoverStep;
      } else if (currentRecordingType === 'select') {
        step = {
          type: 'SELECT',
          id: generateId('step'),
          label: `Select: ${data.label || 'dropdown'}`,
          selector: data.selector,
          selectorStrategy,
          fallbackXY: data.xy,
          optionValue: '',
          clickOffAfter: true,
        } as SelectStep;
      } else if (currentRecordingType === 'type') {
        step = {
          type: 'TYPE',
          id: generateId('step'),
          label: `Type in: ${data.label || 'input'}`,
          selector: data.selector,
          selectorStrategy,
          fallbackXY: data.xy,
          text: '',
          clearFirst: true,
          clickOffAfter: true,
        } as TypeStep;
      } else if (currentRecordingType === 'scroll-element') {
        step = {
          type: 'SCROLL_ELEMENT',
          id: generateId('step'),
          label: `Scroll: ${data.label || 'element'}`,
          selector: data.selector,
          selectorStrategy,
          fallbackXY: data.xy,
          scrollTop: 0,
        } as ScrollElementStep;
      } else if (currentRecordingType === 'search-select') {
        step = {
          type: 'SEARCH_SELECT',
          id: generateId('step'),
          label: `Search: ${data.label || 'input'}`,
          selector: data.selector,
          selectorStrategy,
          fallbackXY: data.xy,
          searchText: '',
          waitForResults: 1,
          clearFirst: true,
          clickOffAfter: true,
        } as SearchSelectStep;
      } else {
        step = {
          type: 'CLICK',
          id: generateId('step'),
          label: data.label || 'Click element',
          selector: data.selector,
          selectorStrategy,
          fallbackXY: data.xy,
        } as ClickStep;
      }

      setNameInput(step.label);
      setNamePrompt({ open: true, defaultName: step.label, step });
    };

    const handleRegionSelected = (data: { x: number; y: number; width: number; height: number }) => {
      stopRecording();
      const step: SnapStep = {
        type: 'SNAP',
        id: generateId('step'),
        label: 'Screenshot',
        region: data,
      };
      setNameInput(step.label);
      setNamePrompt({ open: true, defaultName: step.label, step });
    };

    const handleFilterRecorded = (data: {
      trigger: { selector: string; label: string; strategy: string; xy: [number, number] } | null;
      options: Array<{ selector: string; label: string; strategy: string; xy: [number, number] }>;
      apply: { selector: string; label: string; strategy: string; xy: [number, number] } | null;
    }) => {
      stopRecording();

      if (!data.trigger) {
        toast.error('Filter recording incomplete — no trigger recorded');
        return;
      }

      const step: FilterStep = {
        type: 'FILTER',
        id: generateId('step'),
        label: `Filter: ${data.trigger.label || 'element'} (${data.options.length} option${data.options.length !== 1 ? 's' : ''})`,
        selector: data.trigger.selector,
        selectorStrategy: data.trigger.strategy as FilterStep['selectorStrategy'],
        fallbackXY: data.trigger.xy,
        optionSelectors: data.options.map(o => ({
          selector: o.selector,
          fallbackXY: o.xy,
          label: o.label,
        })),
        applySelector: data.apply?.selector || undefined,
        applyFallbackXY: data.apply?.xy || undefined,
        clickOffAfter: true,
      };

      setNameInput(step.label);
      setNamePrompt({ open: true, defaultName: step.label, step });
    };

    const handleMacroRecorded = (actions: Array<{ selector?: string; selectorStrategy?: string; fallbackXY?: [number, number]; label?: string; action: string; value?: string; scrollTarget?: { x: number; y: number; isPage: boolean }; elementMeta?: { tagName: string; inputType?: string; placeholder?: string; options?: string[] } }>) => {
      stopRecording();

      if (!actions || actions.length === 0) {
        toast.error('Macro recording empty — no actions captured');
        return;
      }

      // Auto-detect which actions could use variables
      const typeActions = actions.filter(a => a.action === 'type' || a.action === 'select');
      const varHint = typeActions.length > 0
        ? ` (${typeActions.length} variable-ready)`
        : '';

      const step: MacroStep = {
        type: 'MACRO',
        id: generateId('step'),
        label: `Macro: ${actions.length} action${actions.length !== 1 ? 's' : ''}${varHint}`,
        actions: actions as MacroAction[],
        waitBetween: 500,
      };

      setNameInput(step.label);
      setNamePrompt({ open: true, defaultName: step.label, step });
    };

    const handleCancelled = () => {
      stopRecording();
      toast('Recording cancelled');
    };

    recorder.onElementPicked(handleElementPicked);
    recorder.onRegionSelected(handleRegionSelected);
    recorder.onFilterRecorded(handleFilterRecorded);
    recorder.onMacroRecorded(handleMacroRecorded);
    recorder.onCancelled(handleCancelled);

    return () => {
      recorder.offElementPicked(handleElementPicked as (...args: unknown[]) => void);
      recorder.offRegionSelected(handleRegionSelected as (...args: unknown[]) => void);
      recorder.offFilterRecorded(handleFilterRecorded as (...args: unknown[]) => void);
      recorder.offMacroRecorded(handleMacroRecorded as (...args: unknown[]) => void);
    };
  }, [addStep, stopRecording, setActiveTab]);

  // Listen for flow progress
  useEffect(() => {
    const handler = (progress: unknown) => setRunProgress(progress as RunProgress);
    flowIpc.onProgress(handler);
    return () => flowIpc.offProgress(handler as (...args: unknown[]) => void);
  }, [setRunProgress]);

  const hasActiveFlow = !!activeFlowId;

  const tabs = [
    { id: 'record', label: 'Record', icon: CircleDot },
    { id: 'run', label: 'Run', icon: Play },
    { id: 'output', label: 'Output', icon: Images },
  ] as const;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen w-[var(--sidebar-w,380px)] bg-ds-bg select-none overflow-hidden">
        <Header />
        <UrlBar />

        {hasActiveFlow ? (
          <>
            {/* Flow menu bar */}
            <FlowMenu />

            {/* 3 tabs */}
            <Tabs.Root
              value={activeTab}
              onValueChange={v => setActiveTab(v as typeof activeTab)}
              className="flex flex-col flex-1 min-h-0"
            >
              <Tabs.List className="flex border-b border-ds-border px-2 bg-ds-surface/30">
                {tabs.map(tab => (
                  <Tabs.Trigger
                    key={tab.id}
                    value={tab.id}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-ds-text-muted border-b-2 border-transparent transition-all hover:text-ds-text data-[state=active]:text-ds-accent data-[state=active]:border-ds-accent"
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <Tabs.Content value="record" className="h-full">
                  <RecordPanel onEditStep={setEditingStep} />
                </Tabs.Content>

                <Tabs.Content value="run" className="h-full">
                  <RunPanel />
                </Tabs.Content>

                <Tabs.Content value="output" className="h-full">
                  <OutputGallery />
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </>
        ) : (
          /* Flow picker — centered landing page */
          <div className="flex-1 min-h-0 overflow-y-auto">
            <FlowPicker />
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-ds-border bg-ds-surface/30 text-xs text-ds-text-dim">
          <span>
            {hasActiveFlow
              ? `${useFlowStore.getState().getActiveFlow()?.name} — ${useFlowStore.getState().getActiveFlow()?.steps.length} steps`
              : 'No flow selected'}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-ds-emerald" />
            Ready
          </span>
        </div>

        {/* Dialogs */}
        <SettingsDialog />
        <StepEditDialog step={editingStep} onClose={() => setEditingStep(null)} />

        {/* Name step dialog */}
        <Dialog.Root open={namePrompt.open} onOpenChange={open => { if (!open) handleNameCancel(); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
            <Dialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[340px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
              <Dialog.Title className="text-sm font-bold text-ds-text mb-1">
                Name This Step
              </Dialog.Title>
              <Dialog.Description className="text-xs text-ds-text-dim mb-4">
                Give it a short, descriptive name.
              </Dialog.Description>
              <Input
                icon={<Tag className="w-3.5 h-3.5" />}
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNameConfirm()}
                placeholder={namePrompt.defaultName}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={handleNameCancel}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleNameConfirm}>
                  Save
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </TooltipProvider>
  );
}
