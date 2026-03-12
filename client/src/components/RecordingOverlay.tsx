import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { MousePointer2, Camera, Scissors, Hand, ListFilter, Type, ArrowDownUp, Search, Filter, Clapperboard, X } from 'lucide-react';
import { Button } from './ui/Button';
import { useAppStore } from '@/stores/appStore';
import { recorder } from '@/lib/ipc';

interface RecordingOverlayProps {
  type: 'click' | 'snap' | 'screenshot' | 'hover' | 'select' | 'type' | 'scroll-element' | 'search-select' | 'filter' | 'macro' | null;
}

export function RecordingOverlay({ type }: RecordingOverlayProps) {
  const stopRecording = useAppStore(s => s.stopRecording);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        recorder.stop();
        stopRecording();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stopRecording]);

  const iconMap: Record<string, typeof MousePointer2> = {
    click: MousePointer2, snap: Camera, screenshot: Scissors,
    hover: Hand, select: ListFilter, type: Type, 'scroll-element': ArrowDownUp,
    'search-select': Search, filter: Filter, macro: Clapperboard,
  };
  const colorMap: Record<string, string> = {
    click: 'ds-accent', snap: 'ds-emerald', screenshot: 'ds-cyan',
    hover: 'ds-purple', select: 'ds-amber', type: 'ds-cyan', 'scroll-element': 'ds-text-muted',
    'search-select': 'ds-cyan', filter: 'ds-amber', macro: 'ds-accent',
  };
  const messageMap: Record<string, string> = {
    click: 'Click any element in the browser',
    snap: 'Select an element to screenshot',
    screenshot: 'Draw a region to screenshot',
    hover: 'Select an element to hover',
    select: 'Select a dropdown element',
    type: 'Select an input element to type into',
    'scroll-element': 'Select a scrollable element',
    'search-select': 'Select the search input field',
    filter: 'Guided filter recording — follow steps in browser',
    macro: 'Recording — interact with the browser',
  };
  const Icon = iconMap[type || 'click'];
  const color = colorMap[type || 'click'];
  const message = messageMap[type || 'click'];
  const isMacro = type === 'macro';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] z-40 pointer-events-none"
    >
      {/* Pulsing border */}
      <div className={`absolute inset-0 border-2 border-${color}/40 animate-pulse rounded-lg pointer-events-none`} />

      {/* Info bar at top */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-auto max-w-[360px]"
      >
        <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-ds-surface/95 border border-${color}/40 shadow-2xl backdrop-blur-md`}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ds-red opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ds-red" />
          </span>
          <Icon className={`w-4 h-4 text-${color}`} />
          <span className="text-xs font-medium text-ds-text">{message}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-2 hover:text-ds-red"
            onClick={() => { recorder.stop(); stopRecording(); }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </motion.div>

      {/* Macro hotkey thin bar — compact reference (Fix #8) */}
      {isMacro && (
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="absolute top-14 left-3 right-3 pointer-events-none"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ds-surface/95 border border-ds-red/30 backdrop-blur-md">
            <div className="flex items-center gap-1.5 flex-wrap">
              <kbd className="px-1.5 py-0.5 rounded bg-ds-emerald/20 border border-ds-emerald/40 text-ds-emerald font-mono text-[10px] font-bold">S</kbd>
              <span className="text-[10px] text-ds-text-dim">snap</span>
              <kbd className="px-1.5 py-0.5 rounded bg-ds-cyan/20 border border-ds-cyan/40 text-ds-cyan font-mono text-[10px] font-bold ml-1">R</kbd>
              <span className="text-[10px] text-ds-text-dim">region</span>
              <kbd className="px-1.5 py-0.5 rounded bg-ds-accent/20 border border-ds-accent/40 text-ds-accent font-mono text-[10px] font-bold ml-1">Enter</kbd>
              <span className="text-[10px] text-ds-text-dim">finish</span>
              <kbd className="px-1.5 py-0.5 rounded bg-ds-red/20 border border-ds-red/40 text-ds-red font-mono text-[10px] font-bold ml-1">Esc</kbd>
              <span className="text-[10px] text-ds-text-dim">cancel</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Escape hint (non-macro only) */}
      {!isMacro && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <span className="text-xs text-ds-text-dim bg-ds-surface/80 px-2.5 py-1 rounded-md border border-ds-border/50 backdrop-blur-sm">
            Press <kbd className="px-1 py-0.5 rounded bg-ds-bg border border-ds-border text-ds-text-muted font-mono text-sm">Esc</kbd> to cancel
          </span>
        </div>
      )}
    </motion.div>
  );
}
