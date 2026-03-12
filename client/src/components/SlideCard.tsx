import { motion } from 'framer-motion';
import {
  Camera, Plus, Clock, CheckCircle2, AlertTriangle, XCircle,
  Copy, Trash2, Layout,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import type { DerivedSlide } from '@/lib/slides';
import type { PptxLayout } from '@shared/types';

type SlideStatus = 'empty' | 'captured' | 'verified' | 'stale' | 'failed';

function getSlideStatus(_slide: DerivedSlide): SlideStatus {
  return 'captured';
}

const PRESET_NAMES: Array<{ test: (l: PptxLayout) => boolean; label: string }> = [
  { test: l => l.imageX === 0 && l.imageY === 0 && !l.showHeader, label: 'Full Bleed' },
  { test: l => Math.abs(l.imageX - 5.33) < 0.1 && l.showHeader === true, label: 'Split Panel' },
  { test: l => Math.abs(l.imageW - 6.2) < 0.1 && l.showHeader === true, label: 'Two-Panel' },
  { test: l => Math.abs(l.imageW - 4.1) < 0.1 && l.showHeader === true, label: 'Triple' },
  { test: l => Math.abs(l.imageX - 1.5) < 0.1, label: 'Appendix' },
  { test: l => l.showHeader === true && l.showFooter === true, label: 'Standard' },
];

function getPresetLabel(layout?: PptxLayout): string | null {
  if (!layout) return null;
  for (const p of PRESET_NAMES) {
    if (p.test(layout)) return p.label;
  }
  return 'Custom';
}

function statusStyles(status: SlideStatus) {
  switch (status) {
    case 'empty':
      return { border: 'border-2 border-dashed border-ds-border', icon: Plus, iconColor: 'text-ds-text-dim' };
    case 'captured':
      return { border: 'border border-ds-border', icon: Camera, iconColor: 'text-ds-accent' };
    case 'verified':
      return { border: 'border border-ds-emerald/30', icon: CheckCircle2, iconColor: 'text-ds-emerald' };
    case 'stale':
      return { border: 'border border-ds-amber/30', icon: Clock, iconColor: 'text-ds-amber' };
    case 'failed':
      return { border: 'border-2 border-ds-red/30', icon: XCircle, iconColor: 'text-ds-red' };
  }
}

interface SlideCardProps {
  slide: DerivedSlide;
  isSelected: boolean;
  slideNumber: number;
  onSelect: () => void;
  onDelete: (stepId: string) => void;
  onDuplicate?: (stepId: string) => void;
  runStatus?: 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';
}

export function SlideCard({
  slide,
  isSelected,
  slideNumber,
  onSelect,
  onDelete,
  onDuplicate,
  runStatus,
}: SlideCardProps) {
  const status = getSlideStatus(slide);
  const styles = statusStyles(status);
  const StatusIcon = styles.icon;
  const presetLabel = getPresetLabel(slide.layout);

  const actionCount = slide.actions.length;
  const region = slide.captureStep.region;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
      onClick={onSelect}
      className={cn(
        'rounded-xl overflow-hidden transition-all cursor-pointer',
        styles.border,
        'bg-ds-surface',
        isSelected && 'ring-2 ring-ds-accent ring-offset-1 ring-offset-ds-bg border-ds-accent/30',
        !isSelected && 'hover:border-ds-border-bright hover:bg-ds-surface-hover',
        runStatus === 'running' && 'ring-2 ring-ds-accent ring-offset-1 ring-offset-ds-bg shadow-[0_0_12px_rgba(187,134,252,0.3)]',
        runStatus === 'success' && 'border-ds-emerald/40',
        runStatus === 'error' && 'border-ds-red/40',
      )}
    >
      <div className="group flex items-center gap-2.5 p-3">
        {/* Thumbnail or slide number */}
        {slide.captureStep.previewPath ? (
          <div className="relative w-12 h-8 rounded overflow-hidden shrink-0 bg-ds-bg border border-ds-border/50">
            <img
              src={`dsfile:///${slide.captureStep.previewPath.replace(/\\/g, '/')}`}
              alt={slide.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
            <span className="absolute bottom-0 right-0 text-[9px] font-bold text-white bg-black/60 px-1 rounded-tl">
              {slideNumber}
            </span>
          </div>
        ) : (
          <span className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold text-ds-text-muted bg-ds-bg shrink-0">
            {slideNumber}
          </span>
        )}

        {/* Status icon */}
        <StatusIcon className={cn('w-4 h-4 shrink-0', styles.iconColor)} />

        {/* Title + metadata */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ds-text truncate">
            {slide.title || 'Untitled Capture'}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-ds-text-muted">
              {actionCount} action{actionCount !== 1 ? 's' : ''} · {region.width}×{region.height}px
            </span>
            {presetLabel && (
              <span className="inline-flex items-center gap-0.5 text-xs text-ds-accent bg-ds-accent/10 px-1.5 py-0 rounded">
                <Layout className="w-2.5 h-2.5" />
                {presetLabel}
              </span>
            )}
          </div>
        </div>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip content="Duplicate">
            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onDuplicate?.(slide.id); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Delete">
            <Button variant="ghost" size="icon-sm" className="hover:text-ds-red" onClick={(e) => { e.stopPropagation(); onDelete(slide.id); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  );
}

/** Empty slide placeholder card */
export function EmptySlideCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-ds-border bg-ds-bg hover:border-ds-accent/40 hover:bg-ds-accent/5 transition-colors cursor-pointer"
    >
      <Plus className="w-4 h-4 text-ds-text-dim" />
      <span className="text-sm font-medium text-ds-text-dim">Add Capture</span>
    </button>
  );
}
