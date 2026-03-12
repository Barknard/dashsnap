import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Progress from '@radix-ui/react-progress';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  Timer, Globe, ArrowDownToLine,
  Plus, Clapperboard, Play, Square,
  CheckCircle2, AlertTriangle, XCircle, Clock, SkipForward,
  FlaskConical, Sparkles, Presentation, FolderOpen, Images,
  FileCheck, Download, Camera, Check, Layout,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { RecordingOverlay } from './RecordingOverlay';
import { SlideCard, EmptySlideCard } from './SlideCard';
import { ActionPanel } from './ActionPanel';
import { SlideLayoutPanel } from './SlideLayoutPanel';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';
import { recorder, flow as flowIpc, app as appIpc, browser } from '@/lib/ipc';
import { generateId, formatDuration, cn } from '@/lib/utils';
import { deriveSlides } from '@/lib/slides';
import type { FlowStep, RunStepStatus, RunProgress } from '@shared/types';

function StatusIcon({ status }: { status: RunStepStatus }) {
  switch (status) {
    case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-ds-emerald" />;
    case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-ds-amber" />;
    case 'error': return <XCircle className="w-3.5 h-3.5 text-ds-red" />;
    case 'running': return <Clock className="w-3.5 h-3.5 text-ds-accent animate-pulse" />;
    case 'skipped': return <SkipForward className="w-3.5 h-3.5 text-ds-text-dim" />;
    default: return <div className="w-3.5 h-3.5 rounded-full border border-ds-border" />;
  }
}

// ─── Stepper Phase Definitions ──────────────────────────────────────────────

type Phase = 'record' | 'slides' | 'run';

const PHASES: Array<{
  id: Phase;
  label: string;
  icon: typeof Presentation;
  color: string;
}> = [
  { id: 'record', label: 'Record', icon: Clapperboard, color: 'ds-accent' },
  { id: 'slides', label: 'Slides', icon: Layout, color: 'ds-emerald' },
  { id: 'run', label: 'Run', icon: Play, color: 'ds-cyan' },
];

interface RecordPanelProps {
  onEditStep?: (step: FlowStep) => void;
  onShowOutput?: () => void;
  onSlideSelected?: (slideId: string | null) => void;
}

export function RecordPanel({ onEditStep, onShowOutput, onSlideSelected }: RecordPanelProps) {
  const activeFlow = useFlowStore(s => s.getActiveFlow());
  const addStep = useFlowStore(s => s.addStep);
  const removeStep = useFlowStore(s => s.removeStep);
  const updateStep = useFlowStore(s => s.updateStep);
  const defaults = useFlowStore(s => s.defaults);
  const selectedStepIndex = useFlowStore(s => s.selectedStepIndex);
  const isRecording = useAppStore(s => s.isRecording);
  const recordingType = useAppStore(s => s.recordingType);
  const startRecording = useAppStore(s => s.startRecording);
  const runProgress = useAppStore(s => s.runProgress);
  const isRunning = useAppStore(s => s.isRunning);
  const setRunProgress = useAppStore(s => s.setRunProgress);
  const globalLayout = useAppStore(s => s.settings.pptxLayout);
  const browserUrl = useAppStore(s => s.browserUrl);

  const [navUrl, setNavUrl] = useState('');
  const [scrollX, setScrollX] = useState('0');
  const [scrollY, setScrollY] = useState('0');
  const [waitSeconds, setWaitSeconds] = useState(String(defaults.stepWaitSeconds));
  const [elapsed, setElapsed] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'actions' | 'layout'>('actions');
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);

  // Derive slides from flat step array
  const derived = useMemo(() => {
    if (!activeFlow) return { slides: [], pendingActions: [], pendingIndices: [] };
    return deriveSlides(activeFlow.steps);
  }, [activeFlow?.steps]);

  const { slides, pendingActions } = derived;

  // Detect current phase for stepper highlighting
  const currentPhase: Phase = useMemo(() => {
    if (!activeFlow) return 'record';
    const totalSteps = activeFlow.steps.length;
    const snapCount = activeFlow.steps.filter(s => s.type === 'SNAP').length;
    if (isRunning || runProgress?.status === 'complete') return 'run';
    if (snapCount > 0) return 'slides';
    return 'record';
  }, [activeFlow, isRunning, runProgress?.status]);

  // Notify parent of slide selection (for main area canvas)
  useEffect(() => {
    onSlideSelected?.(selectedSlideId);
  }, [selectedSlideId, onSlideSelected]);

  // Auto-select first slide
  useEffect(() => {
    if (slides.length > 0 && !selectedSlideId) {
      setSelectedSlideId(slides[0].id);
    }
    if (selectedSlideId && !slides.find(s => s.id === selectedSlideId)) {
      setSelectedSlideId(slides[0]?.id || null);
    }
  }, [slides, selectedSlideId]);

  // Listen for progress updates
  useEffect(() => {
    const handler = (progress: unknown) => {
      const p = progress as RunProgress;
      setRunProgress(p);
      if (p.status === 'complete') {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
      }
    };
    flowIpc.onProgress(handler);
    return () => flowIpc.offProgress(handler as (...args: unknown[]) => void);
  }, [setRunProgress]);

  // Elapsed timer
  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1000), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  const progressPercent = runProgress
    ? Math.round((runProgress.currentStep / runProgress.totalSteps) * 100)
    : 0;
  const isComplete = runProgress?.status === 'complete';
  const hasError = runProgress?.status === 'error';
  const snapCount = runProgress?.results.filter(r => r.screenshotPath).length ?? 0;

  const runResultsMap = useMemo(() => {
    if (!runProgress?.results) return undefined;
    const map = new Map<string, RunStepStatus>();
    for (const r of runProgress.results) {
      map.set(r.stepId, r.status);
    }
    return map;
  }, [runProgress?.results]);

  const currentRunningStepId = useMemo(() => {
    if (!runProgress || runProgress.status !== 'running' || !activeFlow) return undefined;
    return activeFlow.steps[runProgress.currentStep]?.id;
  }, [runProgress, activeFlow]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleRecordMacro = () => {
    if (!activeFlow) return;
    startRecording('macro');
    recorder.startMacro();
  };

  const handleAddWait = () => {
    if (!activeFlow) return;
    const seconds = Math.max(1, Math.min(60, parseInt(waitSeconds) || defaults.stepWaitSeconds));
    const step: FlowStep = { type: 'WAIT', id: generateId('step'), label: `Wait ${seconds}s`, seconds };
    addStep(step);
  };

  const handleAddNav = () => {
    if (!activeFlow || !navUrl.trim()) return;
    let url = navUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    const step: FlowStep = { type: 'NAVIGATE', id: generateId('step'), label: `Navigate to ${new URL(url).hostname}`, url };
    addStep(step);
    setNavUrl('');
  };

  const handleAddScroll = () => {
    if (!activeFlow) return;
    const step: FlowStep = { type: 'SCROLL', id: generateId('step'), label: `Scroll to (${scrollX}, ${scrollY})`, x: parseInt(scrollX) || 0, y: parseInt(scrollY) || 0 };
    addStep(step);
  };

  const handleRecordSnap = () => {
    if (!activeFlow) return;
    startRecording('snap');
    recorder.startSnap();
  };

  const handleDeleteConfirm = () => {
    if (deleteStepId) {
      if (selectedSlideId === deleteStepId) setSelectedSlideId(null);
      removeStep(deleteStepId);
    }
    setDeleteStepId(null);
  };

  const selectedSlide = slides.find(s => s.id === selectedSlideId);
  const selectedActions = selectedSlide ? selectedSlide.actions : pendingActions;
  const noFlow = !activeFlow;
  const hasSlides = slides.length > 0;
  const hasUrl = browserUrl && browserUrl !== 'about:blank';

  // ─── Phase status helpers ──────────────────────────────────────────────

  function phaseStatus(phase: Phase): 'done' | 'current' | 'upcoming' {
    const order: Phase[] = ['record', 'slides', 'run'];
    const currentIdx = order.indexOf(currentPhase);
    const phaseIdx = order.indexOf(phase);
    if (phaseIdx < currentIdx) return 'done';
    if (phaseIdx === currentIdx) return 'current';
    return 'upcoming';
  }

  function phaseSummary(phase: Phase): string {
    switch (phase) {
      case 'record': {
        const total = activeFlow?.steps.length ?? 0;
        return total > 0 ? `${total} action${total !== 1 ? 's' : ''}` : 'No actions yet';
      }
      case 'slides': return hasSlides ? `${slides.length} slide${slides.length !== 1 ? 's' : ''}` : 'No captures yet';
      case 'run': return isComplete ? 'Complete!' : isRunning ? 'Running...' : 'Ready';
      default: return '';
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {isRecording && <RecordingOverlay type={recordingType} />}

      {/* Recording status banner */}
      {isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 bg-ds-red/10 border-b border-ds-red/30 shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-ds-red animate-pulse-recording" />
          <span className="text-xs font-medium text-ds-red">
            Recording {recordingType}... {recordingType === 'screenshot' || recordingType === 'snap' ? 'draw a region' : 'interact in the browser'}
          </span>
        </motion.div>
      )}

      {/* ═══ Vertical Stepper — all phases always visible ═══ */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Workflow header */}
        <div className="px-3 pt-3 pb-1.5 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-ds-accent" />
          <span className="text-xs font-bold uppercase tracking-widest text-ds-text-dim">Workflow</span>
          <div className="flex-1 h-px bg-ds-border/40" />
        </div>
        <div className="p-3 pt-1 space-y-0">

          {/* ──────────────────────────────────────────────────────
              PHASE 1: RECORD
             ────────────────────────────────────────────────────── */}
          <StepperSection
            phase={PHASES[0]}
            status={phaseStatus('record')}
            summary={phaseSummary('record')}
            isLast={false}
          >
            <div className="space-y-1.5 mt-2">
              {/* Hint when no URL */}
              {!hasUrl && activeFlow && (
                <div className="rounded-lg border border-ds-accent/20 bg-ds-accent/5 px-3 py-2">
                  <p className="text-xs font-medium text-ds-accent">Paste a URL in the bar above</p>
                  <p className="text-xs text-ds-text-muted mt-0.5">
                    Navigate to your dashboard first, then hit Record.
                    Press <strong>S</strong> during recording to capture a slide.
                  </p>
                </div>
              )}

              {/* Record button — primary (44px) */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                <button
                  onClick={handleRecordMacro}
                  disabled={noFlow || isRecording || !hasUrl}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 rounded-xl border transition-all disabled:cursor-not-allowed',
                    !hasUrl
                      ? 'bg-ds-surface border-ds-border opacity-50'
                      : 'bg-ds-accent/12 border-ds-accent/25 hover:border-ds-accent/50 hover:bg-ds-accent/20',
                  )}
                  style={{ height: '40px' }}
                >
                  <Clapperboard className="w-4 h-4 text-ds-accent" />
                  <span className="text-sm font-bold text-ds-text">Record</span>
                  <span className="text-xs text-ds-text-dim ml-auto truncate">
                    {!hasUrl ? 'Navigate first' : 'S to capture, Enter to finish'}
                  </span>
                </button>
              </motion.div>

              {/* Quick Capture */}
              <button
                onClick={handleRecordSnap}
                disabled={noFlow || isRecording}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ds-border bg-ds-surface hover:bg-ds-surface-hover hover:border-ds-border-bright transition-all disabled:opacity-40"
              >
                <Camera className="w-3.5 h-3.5 text-ds-emerald" />
                <span className="text-xs font-medium text-ds-text">Quick Capture</span>
                <span className="text-xs text-ds-text-dim ml-auto">Select a region</span>
              </button>

              {/* Add action cards — always visible */}
              <div className="space-y-1 pt-1">
                <span className="text-xs font-medium text-ds-text-dim uppercase tracking-wider px-0.5">
                  Add Action
                </span>

                {/* Wait */}
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-ds-surface/50 border border-ds-border/30">
                  <Timer className="w-3 h-3 text-ds-amber shrink-0" />
                  <span className="text-xs text-ds-text-muted">Wait</span>
                  <Input
                    type="number" min="1" max="60"
                    value={waitSeconds}
                    onChange={e => setWaitSeconds(e.target.value)}
                    className="w-12 h-5 text-center text-xs"
                    disabled={noFlow}
                  />
                  <span className="text-xs text-ds-text-dim">s</span>
                  <Button variant="outline" size="sm" onClick={handleAddWait} disabled={noFlow} className="ml-auto h-6 px-1.5 text-xs">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>

                {/* Navigate */}
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-ds-surface/50 border border-ds-border/30">
                  <Globe className="w-3 h-3 text-ds-purple shrink-0" />
                  <Input
                    value={navUrl}
                    onChange={e => setNavUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNav()}
                    placeholder="https://..."
                    className="flex-1 h-5 text-xs font-mono"
                    disabled={noFlow}
                  />
                  <Button variant="outline" size="sm" onClick={handleAddNav} disabled={noFlow || !navUrl.trim()} className="h-6 px-1.5 text-xs">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>

                {/* Scroll */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ds-surface/50 border border-ds-border/30">
                  <ArrowDownToLine className="w-3 h-3 text-ds-text-dim shrink-0" />
                  <span className="text-xs text-ds-text-dim">X</span>
                  <Input type="number" value={scrollX} onChange={e => setScrollX(e.target.value)} className="w-10 h-5 text-center text-xs" disabled={noFlow} />
                  <span className="text-xs text-ds-text-dim">Y</span>
                  <Input type="number" value={scrollY} onChange={e => setScrollY(e.target.value)} className="w-10 h-5 text-center text-xs" disabled={noFlow} />
                  <Button variant="outline" size="sm" onClick={handleAddScroll} disabled={noFlow} className="ml-auto h-6 px-1.5 text-xs">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </StepperSection>

          {/* ──────────────────────────────────────────────────────
              PHASE 2: SLIDES
             ────────────────────────────────────────────────────── */}
          <StepperSection
            phase={PHASES[1]}
            status={phaseStatus('slides')}
            summary={phaseSummary('slides')}
            isLast={false}
          >
            <div className="space-y-2 mt-2">
              {hasSlides ? (
                <>
                  <AnimatePresence mode="popLayout">
                    {slides.map((slide) => (
                      <SlideCard
                        key={slide.id}
                        slide={slide}
                        slideNumber={slide.slideIndex + 1}
                        isSelected={selectedSlideId === slide.id}
                        runStatus={runResultsMap?.get(slide.id)}
                        onSelect={() => setSelectedSlideId(slide.id)}
                        onDelete={(id) => setDeleteStepId(id)}
                        onDuplicate={() => {/* TODO */}}
                      />
                    ))}
                  </AnimatePresence>
                  <EmptySlideCard onClick={handleRecordSnap} />

                  {/* Pending actions warning */}
                  {pendingActions.length > 0 && (
                    <div className="pt-1">
                      <span className="text-xs text-ds-amber font-medium">
                        {pendingActions.length} pending — add a capture to create a slide
                      </span>
                    </div>
                  )}

                  {/* Tabbed detail panel for selected slide */}
                  {selectedSlide && (
                    <div className="border border-ds-border/40 rounded-lg overflow-hidden mt-2">
                      {/* Tab bar */}
                      <div className="flex items-center gap-0 border-b border-ds-border/40 bg-ds-surface/60 px-1">
                        <button
                          onClick={() => setBottomTab('actions')}
                          className={cn(
                            'px-3 py-1.5 text-xs font-semibold transition-colors border-b-2 -mb-px',
                            bottomTab === 'actions'
                              ? 'border-ds-accent text-ds-accent'
                              : 'border-transparent text-ds-text-dim hover:text-ds-text',
                          )}
                        >
                          Actions
                        </button>
                        <button
                          onClick={() => setBottomTab('layout')}
                          className={cn(
                            'px-3 py-1.5 text-xs font-semibold transition-colors border-b-2 -mb-px',
                            bottomTab === 'layout'
                              ? 'border-ds-accent text-ds-accent'
                              : 'border-transparent text-ds-text-dim hover:text-ds-text',
                          )}
                        >
                          Layout
                        </button>
                      </div>

                      {/* Tab content */}
                      <div className="p-2 max-h-[300px] overflow-y-auto">
                        {bottomTab === 'actions' ? (
                          <ActionPanel
                            actions={selectedActions}
                            slideTitle={selectedSlide.title}
                            stepWaitSeconds={defaults.stepWaitSeconds}
                            runResults={runResultsMap}
                            currentRunningStepId={currentRunningStepId}
                            onEditAction={onEditStep || (() => {})}
                            onDeleteAction={(id) => setDeleteStepId(id)}
                            onUpdateAction={updateStep}
                            onHighlightElement={(sel) => browser.highlightElement(sel)}
                            onClearHighlight={() => browser.clearHighlight()}
                          />
                        ) : (
                          <SlideLayoutPanel
                            slide={selectedSlide}
                            globalLayout={globalLayout}
                            onUpdateStep={updateStep}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-ds-emerald/20 bg-ds-emerald/5 px-3 py-2 mt-1">
                  {(activeFlow?.steps.length ?? 0) > 0 ? (
                    <>
                      <p className="text-xs font-medium text-ds-emerald">Add some captures</p>
                      <p className="text-xs text-ds-text-muted mt-0.5">
                        You recorded {activeFlow?.steps.length} action{(activeFlow?.steps.length ?? 0) !== 1 ? 's' : ''} but no screenshots yet.
                        Screenshots become your slides.
                      </p>
                      <p className="text-xs text-ds-text-dim mt-1">
                        Hit <strong>Record</strong> and press <strong>S</strong> to capture, or use <strong>Quick Capture</strong> above.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-ds-emerald">Slides appear here</p>
                      <p className="text-xs text-ds-text-muted mt-0.5">
                        Each screenshot you take becomes a slide.
                        Select a slide to edit its layout or view its actions.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </StepperSection>

          {/* ──────────────────────────────────────────────────────
              PHASE 3: RUN
             ────────────────────────────────────────────────────── */}
          <StepperSection
            phase={PHASES[2]}
            status={phaseStatus('run')}
            summary={phaseSummary('run')}
            isLast={true}
          >
            <div className="space-y-2 mt-2">
              {/* Hint when ready to run */}
              {!runProgress && hasSlides && !isRunning && (
                <div className="rounded-lg border border-ds-cyan/20 bg-ds-cyan/5 px-3 py-2">
                  <p className="text-xs font-medium text-ds-cyan">Ready to run!</p>
                  <p className="text-xs text-ds-text-muted mt-0.5">
                    Hit Run Report to auto-replay your workflow and build a PPTX.
                    Each slide will be captured automatically.
                  </p>
                </div>
              )}

              {/* Progress section */}
              <AnimatePresence>
                {runProgress && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Card className={cn(
                      'p-2.5 space-y-1.5',
                      isComplete && 'border-ds-emerald/30 bg-ds-emerald/5',
                      hasError && 'border-ds-red/30 bg-ds-red/5',
                    )}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-ds-text">
                          {isComplete ? 'Complete!' : hasError ? 'Error' : `Action ${runProgress.currentStep + 1} of ${runProgress.totalSteps}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-ds-text-muted">{formatDuration(elapsed)}</span>
                          <span className="text-xs font-bold text-ds-accent">{progressPercent}%</span>
                        </div>
                      </div>
                      <Progress.Root className="h-1.5 w-full overflow-hidden rounded-full bg-ds-bg">
                        <Progress.Indicator
                          className={cn(
                            'h-full rounded-full transition-all duration-500 ease-out',
                            isComplete ? 'bg-ds-emerald' : hasError ? 'bg-ds-red' : 'bg-gradient-to-r from-ds-accent to-ds-cyan',
                          )}
                          style={{ width: `${isComplete ? 100 : progressPercent}%` }}
                        />
                      </Progress.Root>

                      {/* Results */}
                      <div className="space-y-0.5 max-h-20 overflow-y-auto">
                        {runProgress.results.map((result, i) => (
                          <div key={result.stepId} className="flex items-center gap-2 px-1">
                            <StatusIcon status={result.status} />
                            <span className="text-xs text-ds-text-muted truncate flex-1">
                              {activeFlow?.steps[i]?.label || `Action ${i + 1}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {isComplete && (
                        <div className="flex items-center gap-2 pt-1">
                          <Sparkles className="w-3.5 h-3.5 text-ds-emerald" />
                          <span className="text-xs font-semibold text-ds-emerald">
                            {snapCount} capture{snapCount !== 1 ? 's' : ''} in {formatDuration(elapsed)}
                          </span>
                          <div className="flex-1" />
                          {runProgress?.pptxPath && (
                            <Button variant="success" size="sm" onClick={() => appIpc.openPath(runProgress.pptxPath!)}>
                              <Presentation className="w-3 h-3 mr-1" /> Open
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => appIpc.openPath('')}>
                            <FolderOpen className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Secondary actions */}
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  disabled={noFlow || !activeFlow?.steps.length || isRunning || isRecording}
                  onClick={() => {/* TODO: validate */}}
                >
                  <FileCheck className="w-3 h-3 mr-1" />
                  Validate
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-8 text-xs text-ds-cyan border-ds-cyan/30 hover:bg-ds-cyan/10"
                  disabled={noFlow || !activeFlow?.steps.length || isRunning}
                  onClick={() => {/* TODO: export */}}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Export
                </Button>
                {onShowOutput && (
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onShowOutput}>
                    <Images className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Primary action — Run / Stop (44px) */}
              {!isRunning ? (
                <div className="flex gap-1.5">
                  <motion.div className="flex-1" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="success"
                      className="w-full font-bold shadow-lg shadow-ds-emerald/20"
                      style={{ height: '44px', borderRadius: '10px' }}
                      onClick={() => activeFlow && flowIpc.run(activeFlow.id)}
                      disabled={noFlow || !activeFlow?.steps.length || isRecording}
                    >
                      <Play className="w-4 h-4 mr-1.5" />
                      Run Report
                    </Button>
                  </motion.div>
                  {selectedStepIndex !== null && (
                    <Button
                      variant="outline"
                      style={{ height: '44px', borderRadius: '10px' }}
                      onClick={() => activeFlow && flowIpc.runStep(activeFlow.id, selectedStepIndex)}
                      disabled={noFlow}
                      title="Test selected action"
                    >
                      <FlaskConical className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  variant="destructive"
                  className="w-full font-bold"
                  style={{ height: '44px', borderRadius: '10px' }}
                  onClick={() => flowIpc.stop()}
                >
                  <Square className="w-4 h-4 mr-1" />
                  Stop
                </Button>
              )}
            </div>
          </StepperSection>

        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog.Root open={!!deleteStepId} onOpenChange={open => { if (!open) setDeleteStepId(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[320px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
            <AlertDialog.Title className="text-sm font-bold text-ds-text">
              Delete?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-xs text-ds-text-dim mt-2 mb-4">
              Remove &ldquo;{activeFlow?.steps.find(s => s.id === deleteStepId)?.label}&rdquo;? This cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  size="sm"
                  className="bg-ds-red hover:bg-ds-red/80 text-white"
                  onClick={handleDeleteConfirm}
                >
                  Delete
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Celebration flash */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 bg-ds-emerald/5 rounded-lg"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Stepper Section Component ──────────────────────────────────────────────

interface StepperSectionProps {
  phase: typeof PHASES[number];
  status: 'done' | 'current' | 'upcoming';
  summary: string;
  isLast: boolean;
  children: React.ReactNode;
}

function StepperSection({ phase, status, summary, isLast, children }: StepperSectionProps) {
  const Icon = phase.icon;
  const isDone = status === 'done';
  const isCurrent = status === 'current';

  return (
    <div className="flex gap-3">
      {/* Vertical rail */}
      <div className="flex flex-col items-center shrink-0">
        {/* Step indicator */}
        <div className={cn(
          'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors',
          isDone && 'bg-ds-emerald/20',
          isCurrent && 'bg-ds-accent/20 ring-2 ring-ds-accent/30',
          !isDone && !isCurrent && 'bg-ds-border',
        )}>
          {isDone ? (
            <Check className="w-3.5 h-3.5 text-ds-emerald" />
          ) : isCurrent ? (
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
            >
              <Icon className="w-3.5 h-3.5 text-ds-accent" />
            </motion.div>
          ) : (
            <Icon className="w-3.5 h-3.5 text-ds-text-dim" />
          )}
        </div>

        {/* Connecting line */}
        {!isLast && (
          <div className={cn(
            'w-0.5 flex-1 min-h-[16px] mt-1 rounded-full transition-colors',
            isDone ? 'bg-ds-emerald/30' : 'bg-ds-border/50',
          )} />
        )}
      </div>

      {/* Content */}
      <div className={cn(
        'flex-1 min-w-0 pb-4',
        !isCurrent && !isDone && 'opacity-60',
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-semibold',
            isDone && 'text-ds-emerald',
            isCurrent && 'text-ds-text',
            !isDone && !isCurrent && 'text-ds-text-dim',
          )}>
            {phase.label}
          </span>
          <span className={cn(
            'text-xs',
            isDone ? 'text-ds-emerald/70' : 'text-ds-text-dim',
          )}>
            {summary}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
