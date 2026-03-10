import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  MousePointer2, Camera, Timer, Globe, ArrowDownToLine,
  Plus, Scissors,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { RecordingOverlay } from './RecordingOverlay';
import { StepList } from './StepList';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';
import { recorder } from '@/lib/ipc';
import { generateId } from '@/lib/utils';
import type { FlowStep } from '@shared/types';

interface RecordPanelProps {
  onEditStep?: (step: FlowStep) => void;
}

export function RecordPanel({ onEditStep }: RecordPanelProps) {
  const activeFlow = useFlowStore(s => s.getActiveFlow());
  const addStep = useFlowStore(s => s.addStep);
  const defaults = useFlowStore(s => s.defaults);
  const isRecording = useAppStore(s => s.isRecording);
  const recordingType = useAppStore(s => s.recordingType);
  const startRecording = useAppStore(s => s.startRecording);

  const [navUrl, setNavUrl] = useState('');
  const [scrollX, setScrollX] = useState('0');
  const [scrollY, setScrollY] = useState('0');
  const [waitSeconds, setWaitSeconds] = useState(String(defaults.clickWaitSeconds));

  const handleRecordClick = () => {
    if (!activeFlow) return;
    startRecording('click');
    recorder.startClick();
  };

  const handleRecordSnap = () => {
    if (!activeFlow) return;
    startRecording('snap');
    recorder.startSnap();
  };

  const handleRecordScreenshot = () => {
    if (!activeFlow) return;
    startRecording('screenshot');
    recorder.startScreenshot();
  };

  const handleAddWait = () => {
    if (!activeFlow) return;
    const seconds = Math.max(1, Math.min(60, parseInt(waitSeconds) || defaults.clickWaitSeconds));
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
    <div className="flex flex-col gap-3 p-3 h-full">
      {isRecording && <RecordingOverlay type={recordingType} />}

      {/* Recording status */}
      {isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-red/10 border border-ds-red/30"
        >
          <span className="w-2 h-2 rounded-full bg-ds-red animate-pulse-recording" />
          <span className="text-xs font-medium text-ds-red">
            Recording {recordingType === 'click' ? 'click' : recordingType === 'screenshot' ? 'screenshot' : 'snap'}... {recordingType === 'screenshot' ? 'draw a region' : 'select an element'} in the browser
          </span>
        </motion.div>
      )}

      {/* Main recording actions */}
      <div>
        <h3 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-2 px-1">
          Record Actions
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <button
              onClick={handleRecordClick}
              disabled={noFlow || isRecording}
              className="w-full h-[120px] flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-br from-ds-accent/20 to-ds-accent/5 border border-ds-accent/25 hover:border-ds-accent/50 hover:from-ds-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-ds-accent/20 group-hover:bg-ds-accent/30 transition-colors">
                <MousePointer2 className="w-4 h-4 text-ds-accent" />
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-ds-text">Record Click</p>
                <p className="text-[10px] text-ds-text-dim mt-0.5">Click element</p>
              </div>
            </button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <button
              onClick={handleRecordSnap}
              disabled={noFlow || isRecording}
              className="w-full h-[120px] flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-br from-ds-emerald/20 to-ds-emerald/5 border border-ds-emerald/25 hover:border-ds-emerald/50 hover:from-ds-emerald/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-ds-emerald/20 group-hover:bg-ds-emerald/30 transition-colors">
                <Camera className="w-4 h-4 text-ds-emerald" />
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-ds-text">Snap Element</p>
                <p className="text-[10px] text-ds-text-dim mt-0.5">Pick element</p>
              </div>
            </button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <button
              onClick={handleRecordScreenshot}
              disabled={noFlow || isRecording}
              className="w-full h-[120px] flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-br from-ds-cyan/20 to-ds-cyan/5 border border-ds-cyan/25 hover:border-ds-cyan/50 hover:from-ds-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-ds-cyan/20 group-hover:bg-ds-cyan/30 transition-colors">
                <Scissors className="w-4 h-4 text-ds-cyan" />
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-ds-text">Screenshot</p>
                <p className="text-[10px] text-ds-text-dim mt-0.5">Draw region</p>
              </div>
            </button>
          </motion.div>
        </div>
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
    </div>
  );
}
