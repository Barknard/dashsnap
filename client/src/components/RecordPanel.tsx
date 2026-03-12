import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Progress from '@radix-ui/react-progress';
import {
  Timer, Globe, ArrowDownToLine,
  Plus, Clapperboard, Play, Square,
  CheckCircle2, AlertTriangle, XCircle, Clock, SkipForward,
  FlaskConical, Sparkles, Presentation, FolderOpen, Images,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { RecordingOverlay } from './RecordingOverlay';
import { StepList } from './StepList';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';
import { recorder, flow as flowIpc, app as appIpc } from '@/lib/ipc';
import { generateId, formatDuration, cn } from '@/lib/utils';
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

interface RecordPanelProps {
  onEditStep?: (step: FlowStep) => void;
  onShowOutput?: () => void;
}

export function RecordPanel({ onEditStep, onShowOutput }: RecordPanelProps) {
  const activeFlow = useFlowStore(s => s.getActiveFlow());
  const addStep = useFlowStore(s => s.addStep);
  const defaults = useFlowStore(s => s.defaults);
  const selectedStepIndex = useFlowStore(s => s.selectedStepIndex);
  const isRecording = useAppStore(s => s.isRecording);
  const recordingType = useAppStore(s => s.recordingType);
  const startRecording = useAppStore(s => s.startRecording);
  const runProgress = useAppStore(s => s.runProgress);
  const isRunning = useAppStore(s => s.isRunning);
  const setRunProgress = useAppStore(s => s.setRunProgress);

  const [navUrl, setNavUrl] = useState('');
  const [scrollX, setScrollX] = useState('0');
  const [scrollY, setScrollY] = useState('0');
  const [waitSeconds, setWaitSeconds] = useState(String(defaults.stepWaitSeconds));
  const [elapsed, setElapsed] = useState(0);
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
  const snapCount = runProgress?.results.filter(r => r.screenshotPath).length ?? 0;

  const handleRecordMacro = () => {
    if (!activeFlow) return;
    startRecording('macro');
    recorder.startMacro();
  };

  const handleAddWait = () => {
    if (!activeFlow) return;
    const seconds = Math.max(1, Math.min(60, parseInt(waitSeconds) || defaults.stepWaitSeconds));
    const step: FlowStep = {
      type: 'WAIT',
      id: generateId('step'),
      label: `Wait ${seconds}s`,
      seconds,
    };
    addStep(step);
  };

  const handleAddNav = () => {
    if (!activeFlow || !navUrl.trim()) return;
    let url = navUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const step: FlowStep = {
      type: 'NAVIGATE',
      id: generateId('step'),
      label: `Navigate to ${new URL(url).hostname}`,
      url,
    };
    addStep(step);
    setNavUrl('');
  };

  const handleAddScroll = () => {
    if (!activeFlow) return;
    const step: FlowStep = {
      type: 'SCROLL',
      id: generateId('step'),
      label: `Scroll to (${scrollX}, ${scrollY})`,
      x: parseInt(scrollX) || 0,
      y: parseInt(scrollY) || 0,
    };
    addStep(step);
  };

  const noFlow = !activeFlow;

  return (
    <div className="flex flex-col h-full">
      {isRecording && <RecordingOverlay type={recordingType} />}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

      {/* Recording status */}
      {isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-red/10 border border-ds-red/30"
        >
          <span className="w-2 h-2 rounded-full bg-ds-red animate-pulse-recording" />
          <span className="text-xs font-medium text-ds-red">
            Recording {recordingType}... {recordingType === 'screenshot' ? 'draw a region' : 'select an element'} in the browser
          </span>
        </motion.div>
      )}

      {/* Main recording action */}
      <div>
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
          <button
            onClick={handleRecordMacro}
            disabled={noFlow || isRecording}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-br from-ds-accent/20 to-ds-accent/5 border border-ds-accent/25 hover:border-ds-accent/50 hover:from-ds-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-ds-accent/20 group-hover:bg-ds-accent/30 transition-colors">
              <Clapperboard className="w-5 h-5 text-ds-accent" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-ds-text">Record</p>
              <p className="text-[10px] text-ds-text-dim">Click, scroll, type, snap — all in one session</p>
            </div>
          </button>
        </motion.div>
      </div>

      {/* Add Wait */}
      <Card className="p-3">
        <h4 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Timer className="w-3 h-3 text-ds-amber" />
          Add Wait
        </h4>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            max="60"
            value={waitSeconds}
            onChange={e => setWaitSeconds(e.target.value)}
            className="w-20 text-center"
            disabled={noFlow}
          />
          <span className="text-xs text-ds-text-dim">seconds</span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddWait}
            disabled={noFlow}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>
      </Card>

      {/* Add Navigation */}
      <Card className="p-3">
        <h4 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Globe className="w-3 h-3 text-ds-purple" />
          Add Navigation
        </h4>
        <div className="flex items-center gap-2">
          <Input
            value={navUrl}
            onChange={e => setNavUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddNav()}
            placeholder="https://..."
            className="flex-1 font-mono text-xs"
            disabled={noFlow}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddNav}
            disabled={noFlow || !navUrl.trim()}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>
      </Card>

      {/* Add Scroll */}
      <Card className="p-3">
        <h4 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ArrowDownToLine className="w-3 h-3 text-ds-text-dim" />
          Add Scroll
        </h4>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-ds-text-dim">X</span>
            <Input
              type="number"
              value={scrollX}
              onChange={e => setScrollX(e.target.value)}
              className="w-16 text-center"
              disabled={noFlow}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-ds-text-dim">Y</span>
            <Input
              type="number"
              value={scrollY}
              onChange={e => setScrollY(e.target.value)}
              className="w-16 text-center"
              disabled={noFlow}
            />
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddScroll}
            disabled={noFlow}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>
      </Card>

      {/* Flow steps */}
      {activeFlow && activeFlow.steps.length > 0 && (
        <div className="border-t border-ds-border pt-2">
          <h3 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-1 px-1">
            Flow Steps ({activeFlow.steps.length})
          </h3>
          <StepList onEditStep={onEditStep || (() => {})} />
        </div>
      )}

      {noFlow && (
        <div className="text-center py-2">
          <p className="text-sm text-ds-amber">
            Create a flow first in the Flows tab to start recording.
          </p>
        </div>
      )}

      </div>{/* End scrollable content area */}

      {/* Fixed run footer — always visible at bottom */}
      <div className="shrink-0 border-t border-ds-border p-3 space-y-2">
        {/* Progress section */}
        <AnimatePresence>
          {runProgress && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className={cn(
                'p-3 space-y-2',
                isComplete && 'border-ds-emerald/30 bg-ds-emerald/5',
                hasError && 'border-ds-red/30 bg-ds-red/5',
              )}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ds-text">
                      {isComplete ? 'Complete!' : hasError ? 'Error' : `Step ${runProgress.currentStep + 1} of ${runProgress.totalSteps}`}
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
                </div>

                {/* Results */}
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {runProgress.results.map((result, i) => (
                    <div key={result.stepId} className="flex items-center gap-2 px-1">
                      <StatusIcon status={result.status} />
                      <span className="text-xs text-ds-text-muted truncate flex-1">
                        {activeFlow?.steps[i]?.label || `Step ${i + 1}`}
                      </span>
                    </div>
                  ))}
                </div>

                {isComplete && (
                  <div className="flex items-center gap-2 pt-1">
                    <Sparkles className="w-3.5 h-3.5 text-ds-emerald" />
                    <span className="text-xs font-semibold text-ds-emerald">
                      {snapCount} snap{snapCount !== 1 ? 's' : ''} in {formatDuration(elapsed)}
                    </span>
                    <div className="flex-1" />
                    {runProgress?.pptxPath && (
                      <Button variant="success" size="sm" onClick={() => appIpc.openPath(runProgress.pptxPath!)}>
                        <Presentation className="w-3 h-3 mr-1" /> Open PPTX
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

        {/* Output gallery link */}
        {onShowOutput && (
          <Button variant="ghost" size="sm" className="w-full text-ds-text-dim" onClick={onShowOutput}>
            <Images className="w-3.5 h-3.5 mr-1.5" />
            View Output Gallery
          </Button>
        )}

        {/* Run / Stop buttons */}
        {!isRunning ? (
          <div className="flex gap-2">
            <motion.div className="flex-1" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="success"
                size="lg"
                className="w-full font-bold shadow-lg shadow-ds-emerald/20"
                onClick={() => activeFlow && flowIpc.run(activeFlow.id)}
                disabled={noFlow || !activeFlow?.steps.length || isRecording}
              >
                <Play className="w-4 h-4 mr-1" />
                Run Flow
              </Button>
            </motion.div>
            {selectedStepIndex !== null && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => activeFlow && flowIpc.runStep(activeFlow.id, selectedStepIndex)}
                disabled={noFlow}
                title="Test selected step"
              >
                <FlaskConical className="w-4 h-4" />
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="destructive"
            size="lg"
            className="w-full font-bold"
            onClick={() => flowIpc.stop()}
          >
            <Square className="w-4 h-4 mr-1" />
            Stop
          </Button>
        )}
      </div>

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
