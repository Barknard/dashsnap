import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Progress from '@radix-ui/react-progress';
import * as Slider from '@radix-ui/react-slider';
import {
  Play, Square, FlaskConical, FileText, FolderOpen,
  CheckCircle2, AlertTriangle, XCircle, Clock, Sparkles,
  Presentation,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Tooltip } from './ui/Tooltip';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';
import { flow as flowIpc, settings as settingsIpc, app as appIpc } from '@/lib/ipc';
import { formatDuration, cn } from '@/lib/utils';
import type { RunProgress, RunStepStatus } from '@shared/types';

function StatusIcon({ status }: { status: RunStepStatus }) {
  switch (status) {
    case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-ds-emerald" />;
    case 'warning': return <AlertTriangle className="w-3.5 h-3.5 text-ds-amber" />;
    case 'error': return <XCircle className="w-3.5 h-3.5 text-ds-red" />;
    case 'running': return <Clock className="w-3.5 h-3.5 text-ds-accent animate-pulse" />;
    case 'skipped': return <Clock className="w-3.5 h-3.5 text-ds-text-dim" />;
    default: return <div className="w-3.5 h-3.5 rounded-full border border-ds-border" />;
  }
}

export function RunPanel() {
  const activeFlow = useFlowStore(s => s.getActiveFlow());
  const defaults = useFlowStore(s => s.defaults);
  const setClickWait = useFlowStore(s => s.setClickWait);
  const setSnapWait = useFlowStore(s => s.setSnapWait);
  const selectedStepIndex = useFlowStore(s => s.selectedStepIndex);
  const updateFlowTemplate = useFlowStore(s => s.updateFlowTemplate);

  const runProgress = useAppStore(s => s.runProgress);
  const isRunning = useAppStore(s => s.isRunning);
  const setRunProgress = useAppStore(s => s.setRunProgress);

  const [elapsed, setElapsed] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const noFlow = !activeFlow;
  const noSteps = !activeFlow?.steps.length;
  const snapCount = runProgress?.results.filter(r => r.screenshotPath).length ?? 0;

  const handleRun = () => {
    if (!activeFlow) return;
    setOutputPath(null);
    flowIpc.run(activeFlow.id);
  };

  const handleTestStep = () => {
    if (!activeFlow || selectedStepIndex === null) return;
    flowIpc.runStep(activeFlow.id, selectedStepIndex);
  };

  const handleStop = () => {
    flowIpc.stop();
  };

  const handleBrowseTemplate = async () => {
    if (!activeFlow) return;
    const path = await settingsIpc.browseTemplate();
    if (path) updateFlowTemplate(activeFlow.id, path);
  };

  const handleOpenOutput = () => {
    if (outputPath) appIpc.openPath(outputPath);
  };

  const handleOpenFolder = () => {
    appIpc.openPath('');
  };

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      {/* Template */}
      <Card className="p-3">
        <h4 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Presentation className="w-3 h-3 text-ds-purple" />
          PowerPoint Template
        </h4>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-8 px-3 flex items-center rounded-lg border border-ds-border bg-ds-bg text-xs text-ds-text-muted truncate font-mono">
            {activeFlow?.template || 'No template (blank 16:9 slides)'}
          </div>
          <Tooltip content="Choose a .pptx template">
            <Button variant="outline" size="sm" onClick={handleBrowseTemplate} disabled={noFlow}>
              <FileText className="w-3 h-3 mr-1" />
              Browse
            </Button>
          </Tooltip>
        </div>
      </Card>

      {/* Timing defaults */}
      <Card className="p-3 space-y-3">
        <h4 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-ds-amber" />
          Timing Defaults
        </h4>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-ds-text-muted">Wait after click</span>
            <span className="text-xs font-mono font-bold text-ds-accent">{defaults.clickWaitSeconds}s</span>
          </div>
          <Slider.Root
            value={[defaults.clickWaitSeconds]}
            onValueChange={([v]) => setClickWait(v)}
            min={1}
            max={15}
            step={1}
            className="relative flex items-center h-5 w-full"
          >
            <Slider.Track className="relative h-1.5 w-full rounded-full bg-ds-bg">
              <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-ds-accent to-ds-cyan" />
            </Slider.Track>
            <Slider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-ds-accent shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ds-accent/50 cursor-grab active:cursor-grabbing transition-shadow" />
          </Slider.Root>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-ds-text-muted">Wait after snap</span>
            <span className="text-xs font-mono font-bold text-ds-emerald">{defaults.snapWaitSeconds}s</span>
          </div>
          <Slider.Root
            value={[defaults.snapWaitSeconds]}
            onValueChange={([v]) => setSnapWait(v)}
            min={1}
            max={15}
            step={1}
            className="relative flex items-center h-5 w-full"
          >
            <Slider.Track className="relative h-1.5 w-full rounded-full bg-ds-bg">
              <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-ds-emerald to-ds-cyan" />
            </Slider.Track>
            <Slider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-ds-emerald shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ds-emerald/50 cursor-grab active:cursor-grabbing transition-shadow" />
          </Slider.Root>
        </div>
      </Card>

      {/* Run buttons */}
      <div className="space-y-2">
        {!isRunning ? (
          <>
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="success"
                size="xl"
                className="w-full text-base font-bold shadow-lg shadow-ds-emerald/20"
                onClick={handleRun}
                disabled={noFlow || noSteps}
              >
                <Play className="w-5 h-5 mr-1" />
                Run Flow
              </Button>
            </motion.div>
            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={handleTestStep}
              disabled={noFlow || selectedStepIndex === null}
            >
              <FlaskConical className="w-4 h-4 mr-1" />
              Test Selected Step
              {selectedStepIndex === null && (
                <span className="text-xs text-ds-text-dim ml-1">(select a step first)</span>
              )}
            </Button>
          </>
        ) : (
          <Button
            variant="destructive"
            size="xl"
            className="w-full text-base font-bold"
            onClick={handleStop}
          >
            <Square className="w-5 h-5 mr-1" />
            Stop
          </Button>
        )}
      </div>

      {/* Progress section */}
      <AnimatePresence>
        {runProgress && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className={cn(
              'p-3 space-y-3',
              isComplete && 'border-ds-emerald/30 bg-ds-emerald/5',
              hasError && 'border-ds-red/30 bg-ds-red/5',
            )}>
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-ds-text">
                    {isComplete ? 'Complete!' : hasError ? 'Error' : `Step ${runProgress.currentStep + 1} of ${runProgress.totalSteps}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-ds-text-muted">{formatDuration(elapsed)}</span>
                    <span className="text-xs font-bold text-ds-accent">{progressPercent}%</span>
                  </div>
                </div>
                <Progress.Root className="h-2 w-full overflow-hidden rounded-full bg-ds-bg">
                  <Progress.Indicator
                    className={cn(
                      'h-full rounded-full transition-all duration-500 ease-out',
                      isComplete ? 'bg-ds-emerald' : hasError ? 'bg-ds-red' : 'bg-gradient-to-r from-ds-accent to-ds-cyan',
                    )}
                    style={{ width: `${isComplete ? 100 : progressPercent}%` }}
                  />
                </Progress.Root>
              </div>

              {/* Current step */}
              {isRunning && runProgress.currentStep < runProgress.totalSteps && activeFlow && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-ds-bg/50">
                  <Clock className="w-3 h-3 text-ds-accent animate-pulse" />
                  <span className="text-sm text-ds-text truncate">
                    {activeFlow.steps[runProgress.currentStep]?.label}
                  </span>
                </div>
              )}

              {/* Results */}
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {runProgress.results.map((result, i) => (
                  <div key={result.stepId} className="flex items-center gap-2 px-1">
                    <StatusIcon status={result.status} />
                    <span className="text-sm text-ds-text-muted truncate flex-1">
                      {activeFlow?.steps[i]?.label || `Step ${i + 1}`}
                    </span>
                    {result.duration && (
                      <span className="text-xs text-ds-text-dim font-mono">
                        {formatDuration(result.duration)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Completion actions */}
              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2 pt-1"
                >
                  <div className="flex items-center gap-2 text-ds-emerald">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-xs font-semibold">
                      {snapCount} screenshot{snapCount !== 1 ? 's' : ''} captured in {formatDuration(elapsed)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="success" size="sm" className="flex-1" onClick={handleOpenOutput}>
                      <Presentation className="w-3.5 h-3.5 mr-1" />
                      Open PowerPoint
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

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
