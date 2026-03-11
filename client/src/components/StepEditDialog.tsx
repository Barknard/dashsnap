import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import {
  MousePointer, Clock, Camera, Globe, ArrowDown, X, Copy, AlertTriangle,
  Hand, ListFilter, Type, ArrowDownUp, Search, Filter,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge, stepTypeBadgeVariant } from './ui/Badge';
import { useFlowStore } from '@/stores/flowStore';
import type { FlowStep } from '@shared/types';
import { cn } from '@/lib/utils';

const stepIcons: Record<string, typeof MousePointer> = {
  CLICK: MousePointer,
  WAIT: Clock,
  SNAP: Camera,
  NAVIGATE: Globe,
  SCROLL: ArrowDown,
  HOVER: Hand,
  SELECT: ListFilter,
  TYPE: Type,
  SCROLL_ELEMENT: ArrowDownUp,
  SEARCH_SELECT: Search,
  FILTER: Filter,
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
  const [optionValue, setOptionValue] = useState('');
  const [typeText, setTypeText] = useState('');
  const [clearFirst, setClearFirst] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [clickOffAfter, setClickOffAfter] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [waitForResults, setWaitForResults] = useState(1);
  const [applySelector, setApplySelector] = useState('');

  useEffect(() => {
    if (!step) return;
    setLabel(step.label);
    if (step.type === 'WAIT') setSeconds(step.seconds);
    if (step.type === 'NAVIGATE') setUrl(step.url);
    if (step.type === 'SCROLL') { setScrollX(step.x); setScrollY(step.y); }
    if (step.type === 'SELECT') { setOptionValue(step.optionValue); setClickOffAfter(step.clickOffAfter !== false); }
    if (step.type === 'TYPE') { setTypeText(step.text); setClearFirst(step.clearFirst ?? false); setClickOffAfter(step.clickOffAfter !== false); }
    if (step.type === 'SCROLL_ELEMENT') { setScrollTop(step.scrollTop); setScrollLeft(step.scrollLeft ?? 0); }
    if (step.type === 'SEARCH_SELECT') { setSearchText(step.searchText); setWaitForResults(step.waitForResults ?? 1); setClearFirst(step.clearFirst ?? false); setClickOffAfter(step.clickOffAfter !== false); }
    if (step.type === 'FILTER') { setApplySelector(step.applySelector ?? ''); setClickOffAfter(step.clickOffAfter !== false); }
  }, [step]);

  if (!step) return null;

  const Icon = stepIcons[step.type];

  const handleSave = () => {
    const updates: Partial<FlowStep> = { label };
    if (step.type === 'WAIT') (updates as Record<string, unknown>).seconds = seconds;
    if (step.type === 'NAVIGATE') (updates as Record<string, unknown>).url = url;
    if (step.type === 'SCROLL') { (updates as Record<string, unknown>).x = scrollX; (updates as Record<string, unknown>).y = scrollY; }
    if (step.type === 'SELECT') { (updates as Record<string, unknown>).optionValue = optionValue; (updates as Record<string, unknown>).clickOffAfter = clickOffAfter; }
    if (step.type === 'TYPE') { (updates as Record<string, unknown>).text = typeText; (updates as Record<string, unknown>).clearFirst = clearFirst; (updates as Record<string, unknown>).clickOffAfter = clickOffAfter; }
    if (step.type === 'SCROLL_ELEMENT') { (updates as Record<string, unknown>).scrollTop = scrollTop; (updates as Record<string, unknown>).scrollLeft = scrollLeft; }
    if (step.type === 'SEARCH_SELECT') { (updates as Record<string, unknown>).searchText = searchText; (updates as Record<string, unknown>).waitForResults = waitForResults; (updates as Record<string, unknown>).clearFirst = clearFirst; (updates as Record<string, unknown>).clickOffAfter = clickOffAfter; }
    if (step.type === 'FILTER') { (updates as Record<string, unknown>).applySelector = applySelector; (updates as Record<string, unknown>).clickOffAfter = clickOffAfter; }
    updateStep(step.id, updates);
    onClose();
  };

  const handleCopySelector = () => {
    if ('selector' in step && step.selector) {
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

            {/* HOVER specific */}
            {step.type === 'HOVER' && (
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
                <p className="text-xs text-ds-text-dim">Strategy: {step.selectorStrategy}</p>
              </div>
            )}

            {/* SELECT specific */}
            {step.type === 'SELECT' && (
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
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Option Value</label>
                  <Input
                    value={optionValue}
                    onChange={e => setOptionValue(e.target.value)}
                    placeholder="Option value to select..."
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-ds-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clickOffAfter}
                    onChange={e => setClickOffAfter(e.target.checked)}
                    className="rounded border-ds-border"
                  />
                  Click off after (apply filter)
                </label>
              </>
            )}

            {/* TYPE specific */}
            {step.type === 'TYPE' && (
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
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Text to Type</label>
                  <Input
                    value={typeText}
                    onChange={e => setTypeText(e.target.value)}
                    placeholder="Enter text..."
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-ds-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearFirst}
                    onChange={e => setClearFirst(e.target.checked)}
                    className="rounded border-ds-border"
                  />
                  Clear field first
                </label>
                <label className="flex items-center gap-2 text-xs text-ds-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clickOffAfter}
                    onChange={e => setClickOffAfter(e.target.checked)}
                    className="rounded border-ds-border"
                  />
                  Click off after (apply filter)
                </label>
              </>
            )}

            {/* SCROLL_ELEMENT specific */}
            {step.type === 'SCROLL_ELEMENT' && (
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
                </div>
                <div className="flex gap-4">
                  <div className="space-y-1.5 flex-1">
                    <label className="text-xs font-medium text-ds-text-muted">Scroll Top</label>
                    <Input
                      type="number"
                      value={scrollTop}
                      onChange={e => setScrollTop(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <label className="text-xs font-medium text-ds-text-muted">Scroll Left</label>
                    <Input
                      type="number"
                      value={scrollLeft}
                      onChange={e => setScrollLeft(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* SEARCH_SELECT specific */}
            {step.type === 'SEARCH_SELECT' && (
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
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Search Text</label>
                  <Input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder='e.g. Engineering or {{orgName}}'
                  />
                  <p className="text-[10px] text-ds-text-dim">
                    Use {'{{variableName}}'} for CSV batch runs
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Wait for Results (seconds)</label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={waitForResults}
                    onChange={e => setWaitForResults(parseFloat(e.target.value) || 1)}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-ds-text-muted cursor-pointer">
                  <input type="checkbox" checked={clearFirst} onChange={e => setClearFirst(e.target.checked)} className="rounded border-ds-border" />
                  Clear field first
                </label>
                <label className="flex items-center gap-2 text-xs text-ds-text-muted cursor-pointer">
                  <input type="checkbox" checked={clickOffAfter} onChange={e => setClickOffAfter(e.target.checked)} className="rounded border-ds-border" />
                  Click off after (apply filter)
                </label>
              </>
            )}

            {/* FILTER specific */}
            {step.type === 'FILTER' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Filter Trigger</label>
                  <div className="flex gap-2">
                    <div className="flex-1 h-9 px-3 flex items-center rounded-lg border border-ds-border bg-ds-bg text-sm text-ds-text-dim font-mono truncate">
                      {step.selector || '(position-based)'}
                    </div>
                    <Button variant="outline" size="icon" onClick={handleCopySelector}>
                      <Copy className={cn('w-3.5 h-3.5', copied && 'text-ds-emerald')} />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">
                    Recorded Options ({step.optionSelectors?.length || 0})
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(step.optionSelectors || []).map((opt, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-ds-bg border border-ds-border/50">
                        <span className="text-[10px] font-bold text-ds-amber w-4">{i + 1}</span>
                        <span className="text-xs text-ds-text truncate flex-1">{opt.label || opt.selector || '(position)'}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-ds-text-dim">
                    Re-record the filter step to change options.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ds-text-muted">Apply Button</label>
                  <div className="h-9 px-3 flex items-center rounded-lg border border-ds-border bg-ds-bg text-sm text-ds-text-dim font-mono truncate">
                    {step.applySelector || '(re-clicks trigger)'}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-ds-text-muted cursor-pointer">
                  <input type="checkbox" checked={clickOffAfter} onChange={e => setClickOffAfter(e.target.checked)} className="rounded border-ds-border" />
                  Click off after (apply filter)
                </label>
              </>
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
