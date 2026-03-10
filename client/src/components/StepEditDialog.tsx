import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import {
  MousePointer, Clock, Camera, Globe, ArrowDown, X, Copy, AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge, stepTypeBadgeVariant } from './ui/Badge';
import { useFlowStore } from '@/stores/flowStore';
import type { FlowStep } from '@shared/types';
import { cn } from '@/lib/utils';

const stepIcons = {
  CLICK: MousePointer,
  WAIT: Clock,
  SNAP: Camera,
  NAVIGATE: Globe,
  SCROLL: ArrowDown,
};

interface StepEditDialogProps {
  step: FlowStep | null;
  onClose: () => void;
}

export function StepEditDialog({ step, onClose }: StepEditDialogProps) {
  const updateStep = useFlowStore(s => s.updateStep);
  const [label, setLabel] = useState('');
  const [seconds, setSeconds] = useState(3);
  const [url, setUrl] = useState('');
  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!step) return;
    setLabel(step.label);
    if (step.type === 'WAIT') setSeconds(step.seconds);
    if (step.type === 'NAVIGATE') setUrl(step.url);
    if (step.type === 'SCROLL') { setScrollX(step.x); setScrollY(step.y); }
  }, [step]);

  if (!step) return null;

  const Icon = stepIcons[step.type];

  const handleSave = () => {
    const updates: Partial<FlowStep> = { label };
    if (step.type === 'WAIT') (updates as Record<string, unknown>).seconds = seconds;
    if (step.type === 'NAVIGATE') (updates as Record<string, unknown>).url = url;
    if (step.type === 'SCROLL') { (updates as Record<string, unknown>).x = scrollX; (updates as Record<string, unknown>).y = scrollY; }
    updateStep(step.id, updates);
    onClose();
  };

  const handleCopySelector = () => {
    if (step.type === 'CLICK') {
      navigator.clipboard.writeText(step.selector);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog.Root open={!!step} onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
        <Dialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[350px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-ds-text-muted" />
              <Dialog.Title className="text-sm font-bold text-ds-text">
                Edit Step
              </Dialog.Title>
              <Badge variant={stepTypeBadgeVariant(step.type)} className="text-xs">
                {step.type}
              </Badge>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm">
                <X className="w-4 h-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            {/* Label (all types) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ds-text-muted">Label</label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Step name..."
                autoFocus
              />
            </div>

            {/* CLICK specific */}
            {step.type === 'CLICK' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Selector</label>
                  <div className="flex gap-2">
                    <div className="flex-1 h-9 px-3 flex items-center rounded-lg border border-ds-border bg-ds-bg text-sm text-ds-text-dim font-mono truncate">
                      {step.selector}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleCopySelector}>
                      <Copy className={cn('w-3.5 h-3.5', copied && 'text-ds-emerald')} />
                    </Button>
                  </div>
                  <p className="text-xs text-ds-text-dim">
                    Strategy: {step.selectorStrategy}
                  </p>
                </div>
                {step.selectorStrategy === 'xy-position' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-amber/10 border border-ds-amber/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-ds-amber shrink-0" />
                    <p className="text-xs text-ds-amber">
                      Position-based selector — may break if the page layout changes.
                    </p>
                  </div>
                )}
                {step.fallbackXY && (
                  <p className="text-xs text-ds-text-dim">
                    Fallback position: ({step.fallbackXY[0]}, {step.fallbackXY[1]})
                  </p>
                )}
              </>
            )}

            {/* WAIT specific */}
            {step.type === 'WAIT' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-ds-text-muted">Duration</label>
                  <span className="text-xs font-mono font-bold text-ds-amber">{seconds}s</span>
                </div>
                <Slider.Root
                  value={[seconds]}
                  onValueChange={([v]) => setSeconds(v)}
                  min={1}
                  max={60}
                  step={1}
                  className="relative flex items-center h-5 w-full"
                >
                  <Slider.Track className="relative h-1.5 w-full rounded-full bg-ds-bg">
                    <Slider.Range className="absolute h-full rounded-full bg-ds-amber" />
                  </Slider.Track>
                  <Slider.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-ds-amber shadow-md cursor-grab" />
                </Slider.Root>
              </div>
            )}

            {/* SNAP specific */}
            {step.type === 'SNAP' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ds-text-muted">Region</label>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(['x', 'y', 'width', 'height'] as const).map(key => (
                    <div key={key} className="space-y-1">
                      <span className="text-xs text-ds-text-dim uppercase">{key}</span>
                      <div className="h-8 flex items-center justify-center rounded-md border border-ds-border bg-ds-bg text-xs font-mono text-ds-text-muted">
                        {step.region[key]}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-ds-text-dim">
                  Re-record to change the region. {step.region.width}x{step.region.height}px area.
                </p>
              </div>
            )}

            {/* NAVIGATE specific */}
            {step.type === 'NAVIGATE' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ds-text-muted">URL</label>
                <Input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="font-mono text-xs"
                />
              </div>
            )}

            {/* SCROLL specific */}
            {step.type === 'SCROLL' && (
              <div className="flex gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-ds-text-muted">X Position</label>
                  <Input
                    type="number"
                    value={scrollX}
                    onChange={e => setScrollX(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-ds-text-muted">Y Position</label>
                  <Input
                    type="number"
                    value={scrollY}
                    onChange={e => setScrollY(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-ds-border">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
