import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  MousePointer2, Camera, Timer, Globe, ArrowDownToLine,
  Plus, Scissors, Hand, ListFilter, Type, ArrowDownUp,
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

  const handleRecordHover = () => {
    if (!activeFlow) return;
    startRecording('hover');
    recorder.startHover();
  };

  const handleRecordSelect = () => {
    if (!activeFlow) return;
    startRecording('select');
    recorder.startSelect();
  };

  const handleRecordType = () => {
    if (!activeFlow) return;
    startRecording('type');
    recorder.startType();
  };

  const handleRecordScrollElement = () => {
    if (!activeFlow) return;
    startRecording('scroll-element');
    recorder.startScrollElement();
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
            Recording {recordingType}... {recordingType === 'screenshot' ? 'draw a region' : 'select an element'} in the browser
          </span>
        </motion.div>
      )}

      {/* Main recording actions */}
      <div>
        <h3 className="text-sm font-semibold text-ds-text-dim uppercase tracking-wider mb-2 px-1">
          Record Actions
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {([
            { onClick: handleRecordClick, icon: MousePointer2, label: 'Record Click', desc: 'Click element', color: 'ds-accent' },
            { onClick: handleRecordSnap, icon: Camera, label: 'Snap Element', desc: 'Pick element', color: 'ds-emerald' },
            { onClick: handleRecordScreenshot, icon: Scissors, label: 'Screenshot', desc: 'Draw region', color: 'ds-cyan' },
            { onClick: handleRecordHover, icon: Hand, label: 'Hover', desc: 'Hover element', color: 'ds-purple' },
            { onClick: handleRecordSelect, icon: ListFilter, label: 'Select Option', desc: 'Pick dropdown', color: 'ds-amber' },
            { onClick: handleRecordType, icon: Type, label: 'Type Text', desc: 'Input field', color: 'ds-cyan' },
            { onClick: handleRecordScrollElement, icon: ArrowDownUp, label: 'Scroll In', desc: 'Scroll element', color: 'ds-text-muted' },
          ] as const).map(({ onClick, icon: BtnIcon, label, desc, color }) => (
            <motion.div key={label} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <button
                onClick={onClick}
                disabled={noFlow || isRecording}
                className={`w-full h-[90px] flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-gradient-to-br from-${color}/20 to-${color}/5 border border-${color}/25 hover:border-${color}/50 hover:from-${color}/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed group`}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-xl bg-${color}/20 group-hover:bg-${color}/30 transition-colors`}>
                  <BtnIcon className={`w-3.5 h-3.5 text-${color}`} />
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-ds-text">{label}</p>
                  <p className="text-[9px] text-ds-text-dim">{desc}</p>
                </div>
              </button>
            </motion.div>
          ))}
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
