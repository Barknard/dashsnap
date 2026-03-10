import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { MousePointer2, Scissors, X } from 'lucide-react';
import { Button } from './ui/Button';
import { useAppStore } from '@/stores/appStore';
import { recorder } from '@/lib/ipc';

interface RecordingOverlayProps {
  type: 'click' | 'snap' | null;
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

  const Icon = type === 'click' ? MousePointer2 : Scissors;
  const color = type === 'click' ? 'ds-accent' : 'ds-emerald';
  const message = type === 'click'
    ? 'Click any element in the browser'
    : 'Draw a rectangle over the area to capture';

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

      {/* Escape hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <span className="text-xs text-ds-text-dim bg-ds-surface/80 px-2.5 py-1 rounded-md border border-ds-border/50 backdrop-blur-sm">
          Press <kbd className="px-1 py-0.5 rounded bg-ds-bg border border-ds-border text-ds-text-muted font-mono text-sm">Esc</kbd> to cancel
        </span>
      </div>
    </motion.div>
  );
}
