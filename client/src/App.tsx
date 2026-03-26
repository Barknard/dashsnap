import { useEffect, useState, useCallback, useRef } from 'react';
import { Images, Monitor, Presentation, Camera } from 'lucide-react';
import { TooltipProvider } from './components/ui/Tooltip';
import { Header } from './components/Header';
import { UrlBar } from './components/UrlBar';
import { FlowMenu } from './components/FlowMenu';
import { FlowPicker } from './components/FlowPicker';
import { RecordPanel } from './components/RecordPanel';
import { SlideCanvas } from './components/SlideCanvas';
import { OutputGallery } from './components/OutputGallery';
import { SettingsDialog } from './components/SettingsDialog';
import { StepEditDialog } from './components/StepEditDialog';
import { Button } from './components/ui/Button';
import { useFlowStore } from './stores/flowStore';
import { useAppStore } from './stores/appStore';
import { recorder, app as appIpc, flow as flowIpc, browser } from './lib/ipc';
import { generateId, cn } from './lib/utils';
import { deriveSlides } from './lib/slides';
import type { FlowStep, ClickStep, SnapStep, HoverStep, SelectStep, TypeStep, ScrollElementStep, SearchSelectStep, FilterStep, RunProgress } from '@shared/types';
import { toast } from 'sonner';

export default function App() {
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
  const isRunning = useAppStore(s => s.isRunning);
  const slideEditMode = useAppStore(s => s.slideEditMode);
  const setSlideEditMode = useAppStore(s => s.setSlideEditMode);
  const globalLayout = useAppStore(s => s.settings.pptxLayout);
  const mainTab = useAppStore(s => s.mainTab);
  const setMainTab = useAppStore(s => s.setMainTab);
  const prevIsRunning = useRef(false);

  const loadFlows = useFlowStore(s => s.loadFlows);
  const addStep = useFlowStore(s => s.addStep);
  const updateStep = useFlowStore(s => s.updateStep);
  const activeFlowId = useFlowStore(s => s.activeFlowId);
  const activeFlowName = useFlowStore(s => s.getActiveFlow()?.name);
  const activeFlowStepCount = useFlowStore(s => s.getActiveFlow()?.steps.length ?? 0);
  const activeFlow = useFlowStore(s => s.getActiveFlow());

  const [editingStep, setEditingStep] = useState<FlowStep | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);

  // Derive all slides and the selected one
  const allSlides = activeFlow ? deriveSlides(activeFlow.steps).slides : [];
  const selectedSlide = allSlides.find(s => s.id === selectedSlideId) || null;

  // When a slide is selected, just track it (tab switching is separate)
  const handleSlideSelected = useCallback((slideId: string | null) => {
    setSelectedSlideId(slideId);
  }, []);

  // Sync BrowserView visibility with mainTab
  useEffect(() => {
    if (mainTab === 'browser') {
      browser.show();
    } else {
      browser.hide();
    }
  }, [mainTab]);

  // Restore browser tab when flow is cleared
  useEffect(() => {
    if (!activeFlowId) {
      setMainTab('browser');
    }
  }, [activeFlowId, setMainTab]);

  // Auto-select first slide when switching to slides tab or when slides change
  useEffect(() => {
    if (mainTab === 'slides' && allSlides.length > 0 && !selectedSlide) {
      setSelectedSlideId(allSlides[0].id);
    }
  }, [mainTab, allSlides, selectedSlide]);

  // Auto-switch tabs on run start / complete
  useEffect(() => {
    if (isRunning && !prevIsRunning.current) {
      // Run just started — switch to browser to watch
      setMainTab('browser');
    }
    if (!isRunning && prevIsRunning.current) {
      // Run just finished — switch to slides to see results
      setMainTab('slides');
    }
    prevIsRunning.current = isRunning;
  }, [isRunning, setMainTab]);

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
    const handleElementPicked = (data: { selector: string; label: string; strategy: string; xy: [number, number]; rect?: { x: number; y: number; width: number; height: number }; viewport?: { width: number; height: number }; previewPath?: string }) => {
      const currentRecordingType = useAppStore.getState().recordingType;
      stopRecording();

      const selectorStrategy = data.strategy as ClickStep['selectorStrategy'];

      let step: FlowStep;

      if (currentRecordingType === 'snap' && data.rect) {
        step = {
          type: 'SNAP',
          id: generateId('step'),
          label: data.label || 'Screenshot',
          selector: data.selector,
          selectorStrategy: data.strategy,
          region: data.rect,
          recordedViewport: data.viewport,
          previewPath: data.previewPath,
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

      addStep(step);
      toast.success(`Recorded: ${step.label}`);
    };

    const handleRegionSelected = (data: { x: number; y: number; width: number; height: number; previewPath?: string }) => {
      stopRecording();
      const step: SnapStep = {
        type: 'SNAP',
        id: generateId('step'),
        label: 'Screenshot',
        region: data,
        previewPath: data.previewPath,
      };
      addStep(step);
      toast.success(`Recorded: ${step.label}`);
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

      addStep(step);
      toast.success(`Recorded: ${step.label}`);
    };

    const handleMacroRecorded = (actions: Array<{ selector?: string; selectorStrategy?: string; fallbackXY?: [number, number]; label?: string; action: string; value?: string; scrollTarget?: { x: number; y: number; isPage: boolean }; snapRegion?: { x: number; y: number; width: number; height: number }; recordedViewport?: { width: number; height: number }; previewPath?: string; elementMeta?: { tagName: string; inputType?: string; placeholder?: string; options?: string[] } }>, startUrl: string) => {
      stopRecording();

      if (!actions || actions.length === 0) {
        toast.error('Macro recording empty — no actions captured');
        return;
      }

      const groupId = `rec_${Date.now()}`;

      if (startUrl && startUrl !== 'about:blank') {
        const navStep: FlowStep = {
          type: 'NAVIGATE',
          id: generateId('step'),
          label: `Navigate: ${new URL(startUrl).hostname}`,
          url: startUrl,
          group: groupId,
        };
        addStep(navStep);
      }
      for (const action of actions) {
        const selectorStrategy = (action.selectorStrategy || 'css') as ClickStep['selectorStrategy'];
        let step: FlowStep;

        switch (action.action) {
          case 'click':
            step = {
              type: 'CLICK',
              id: generateId('step'),
              label: action.label || 'Click element',
              selector: action.selector || '',
              selectorStrategy,
              fallbackXY: action.fallbackXY,
              group: groupId,
            } as FlowStep;
            break;
          case 'type':
            step = {
              type: 'TYPE',
              id: generateId('step'),
              label: action.value ? `Type: "${action.value.substring(0, 30)}"` : `Type in: ${action.label || 'input'}`,
              selector: action.selector || '',
              selectorStrategy,
              fallbackXY: action.fallbackXY,
              text: action.value || '',
              clearFirst: true,
              clickOffAfter: false,
              group: groupId,
            } as FlowStep;
            break;
          case 'select':
            step = {
              type: 'SELECT',
              id: generateId('step'),
              label: `Select: ${action.label || 'dropdown'}`,
              selector: action.selector || '',
              selectorStrategy,
              fallbackXY: action.fallbackXY,
              optionValue: action.value || '',
              clickOffAfter: false,
              group: groupId,
            } as FlowStep;
            break;
          case 'scroll':
            if (action.scrollTarget?.isPage) {
              step = {
                type: 'SCROLL',
                id: generateId('step'),
                label: action.label || `Scroll to (${action.scrollTarget.x}, ${action.scrollTarget.y})`,
                x: action.scrollTarget.x,
                y: action.scrollTarget.y,
                group: groupId,
              } as FlowStep;
            } else {
              step = {
                type: 'SCROLL_ELEMENT',
                id: generateId('step'),
                label: action.label || 'Scroll element',
                selector: action.selector || '',
                selectorStrategy,
                fallbackXY: action.fallbackXY,
                scrollTop: action.scrollTarget?.y ?? 0,
                scrollLeft: action.scrollTarget?.x ?? 0,
                group: groupId,
              } as FlowStep;
            }
            break;
          case 'snap':
            step = {
              type: 'SNAP',
              id: generateId('step'),
              label: action.label || 'Screenshot',
              selector: action.selector,
              selectorStrategy: action.selectorStrategy,
              region: action.snapRegion || { x: 0, y: 0, width: 100, height: 100 },
              recordedViewport: action.recordedViewport,
              previewPath: action.previewPath,
              group: groupId,
            } as FlowStep;
            break;
          case 'key':
            step = {
              type: 'CLICK',
              id: generateId('step'),
              label: action.label || `Press ${(action as any).key || 'Enter'}`,
              selector: action.selector || '',
              selectorStrategy,
              fallbackXY: action.fallbackXY,
              keyPress: (action as any).key || 'Enter',
              group: groupId,
            } as FlowStep;
            break;
          default:
            continue;
        }

        addStep(step);
      }

      toast.success(`Recorded ${actions.length} steps`);
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
      recorder.offCancelled(handleCancelled as (...args: unknown[]) => void);
    };
  }, [addStep, stopRecording]);

  // Listen for flow progress
  useEffect(() => {
    const handler = (progress: unknown) => {
      const p = progress as RunProgress;
      setRunProgress(p);
      // Update SNAP step previewPaths from run results so slides show the actual screenshots
      if (p.status === 'complete' && p.results) {
        // Read fresh from store to avoid stale closure
        const flow = useFlowStore.getState().getActiveFlow();
        if (flow) {
          for (const result of p.results) {
            if (result.screenshotPath && result.stepId) {
              const step = flow.steps.find(s => s.id === result.stepId);
              if (step && step.type === 'SNAP') {
                console.log('[Slides] Updating previewPath for', result.stepId, '→', result.screenshotPath);
                useFlowStore.getState().updateStep(result.stepId, { previewPath: result.screenshotPath } as Partial<FlowStep>);
              }
            }
          }
        }
      }
    };
    flowIpc.onProgress(handler);
    return () => flowIpc.offProgress(handler as (...args: unknown[]) => void);
  }, [setRunProgress]);

  const hasActiveFlow = !!activeFlowId;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen w-full bg-ds-bg select-none overflow-hidden">

        {/* ═══ Top Toolbar — full width: Logo + URL Bar ═══ */}
        <div
          className="flex items-center shrink-0 border-b border-ds-border bg-ds-surface/80 glass"
          style={{ height: 'var(--toolbar-h, 44px)' }}
        >
          <Header />
          <div className="w-px h-5 bg-ds-border/50 shrink-0" />
          <UrlBar />
        </div>

        {/* ═══ Main Area: Sidebar + Content ═══ */}
        <div className="flex flex-1 min-h-0">

          {/* ─── Sidebar (380px) — "common region" container ─── */}
          <div
            className="flex flex-col bg-ds-surface/60 overflow-hidden shrink-0 shadow-[3px_0_16px_rgba(0,0,0,0.5)] border-r border-ds-border/60 relative z-10"
            style={{ width: 'var(--sidebar-w, 380px)' }}
          >
            {hasActiveFlow ? (
              <>
                <FlowMenu />
                <div className="flex-1 min-h-0 overflow-hidden">
                  {showOutput ? (
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-ds-border bg-ds-surface/30">
                        <span className="text-xs font-medium text-ds-text-dim uppercase tracking-wider flex items-center gap-1.5">
                          <Images className="w-3.5 h-3.5" />
                          Output Gallery
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setShowOutput(false)}>
                          Back
                        </Button>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <OutputGallery />
                      </div>
                    </div>
                  ) : (
                    <RecordPanel
                      onEditStep={setEditingStep}
                      onShowOutput={() => setShowOutput(true)}
                      onSlideSelected={handleSlideSelected}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <FlowPicker />
              </div>
            )}

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-ds-border bg-ds-surface/30 text-xs text-ds-text-dim shrink-0">
              <span>
                {hasActiveFlow
                  ? `${activeFlowName} — ${activeFlowStepCount} actions`
                  : 'No report selected'}
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-ds-accent animate-pulse' : 'bg-ds-emerald'}`} />
                {isRunning ? 'Running' : 'Ready'}
              </span>
            </div>
          </div>

          {/* ─── Main content area with tab bar ─── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Tab bar — 36px, sits above BrowserView */}
            <div className="flex items-center shrink-0 border-b border-ds-border bg-ds-surface/60" style={{ height: '36px' }}>
              <button
                onClick={() => setMainTab('browser')}
                className={cn(
                  'flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors',
                  mainTab === 'browser'
                    ? 'border-ds-accent text-ds-accent bg-ds-accent/10 font-semibold'
                    : 'border-transparent text-ds-text-muted bg-ds-surface/30 hover:text-ds-text hover:bg-ds-surface-hover hover:border-ds-border',
                )}
              >
                <Monitor className="w-3.5 h-3.5" />
                Browser
                {isRunning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-ds-accent animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setMainTab('slides')}
                className={cn(
                  'flex items-center gap-1.5 px-4 h-full text-xs font-medium border-b-2 transition-colors',
                  mainTab === 'slides'
                    ? 'border-ds-emerald text-ds-emerald bg-ds-emerald/10 font-semibold'
                    : 'border-transparent text-ds-text-muted bg-ds-surface/30 hover:text-ds-text hover:bg-ds-surface-hover hover:border-ds-border',
                )}
              >
                <Presentation className="w-3.5 h-3.5" />
                Slides
                {selectedSlide && (
                  <span className="text-[10px] text-ds-text-dim font-mono">
                    #{(selectedSlide.slideIndex ?? 0) + 1}
                  </span>
                )}
              </button>
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 relative flex flex-col">
              {mainTab === 'slides' ? (
                allSlides.length > 0 ? (
                  <>
                    {/* Slide sub-tabs */}
                    {allSlides.length > 1 && (
                      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-ds-border/50 bg-ds-surface/30 shrink-0 overflow-x-auto">
                        {allSlides.map((slide) => (
                          <button
                            key={slide.id}
                            onClick={() => setSelectedSlideId(slide.id)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                              selectedSlideId === slide.id
                                ? 'bg-ds-emerald/15 text-ds-emerald border border-ds-emerald/30'
                                : 'text-ds-text-muted hover:text-ds-text hover:bg-ds-surface-hover border border-transparent',
                            )}
                          >
                            <Camera className="w-3 h-3" />
                            Slide {slide.slideIndex + 1}
                            {slide.captureStep.previewPath && (
                              <span className="w-1.5 h-1.5 rounded-full bg-ds-emerald" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Slide canvas */}
                    <div className="flex-1 min-h-0">
                      {selectedSlide ? (
                        <SlideCanvas
                          slide={selectedSlide}
                          globalLayout={globalLayout}
                          flowName={activeFlowName}
                          onUpdateStep={updateStep}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center bg-ds-bg">
                          <p className="text-sm text-ds-text-dim">Select a slide above</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-ds-bg">
                    <div className="text-center space-y-2 opacity-40">
                      <Presentation className="w-10 h-10 mx-auto text-ds-text-dim" />
                      <p className="text-sm text-ds-text-dim">No slides yet</p>
                      <p className="text-xs text-ds-text-dim">Record captures to create slides</p>
                    </div>
                  </div>
                )
              ) : (
                /* Browser tab — BrowserView overlays this area natively */
                <div className="h-full flex items-center justify-center bg-ds-bg">
                  <div className="text-center space-y-2 opacity-40">
                    <Monitor className="w-10 h-10 mx-auto text-ds-text-dim" />
                    <p className="text-sm text-ds-text-dim">Browser renders here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dialogs */}
        <SettingsDialog />
        <StepEditDialog step={editingStep} onClose={() => setEditingStep(null)} />
      </div>
    </TooltipProvider>
  );
}
