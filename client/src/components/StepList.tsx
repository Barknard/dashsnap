import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Switch from '@radix-ui/react-switch';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  MousePointer, Clock, Camera, Globe, ArrowDown,
  GripVertical, Pencil, X, ChevronUp, ChevronDown, ChevronRight,
  Layout, Maximize2, SlidersHorizontal, Trash2,
  Hand, ListFilter, Type, ArrowDownUp, Search, Filter, Clapperboard,
  Timer, SkipForward,
} from 'lucide-react';
import { type FlowStep, type PptxLayout, type RunStepStatus, type SnapStep } from '@shared/types';
import { SlideLayoutPreview } from './SlideLayoutPreview';
import { Badge, stepTypeBadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Tooltip } from './ui/Tooltip';
import { EmptyState } from './EmptyState';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';
import { browser } from '@/lib/ipc';
import { cn, truncate } from '@/lib/utils';

/** Live countdown timer shown on the currently-running step */
function StepCountdown({ stepWaitSeconds }: { stepWaitSeconds: number }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, stepWaitSeconds - elapsed);
  const pct = Math.min(100, (elapsed / stepWaitSeconds) * 100);

  return (
    <div className="flex items-center gap-1.5 ml-auto shrink-0">
      <div className="relative w-16 h-1.5 rounded-full bg-ds-bg overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-ds-accent to-ds-cyan"
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-ds-accent tabular-nums w-6 text-right">
        {remaining > 0 ? `${remaining}s` : <Timer className="w-2.5 h-2.5 inline animate-spin" />}
      </span>
    </div>
  );
}

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
  MACRO: Clapperboard,
};

function stepDetail(step: FlowStep): string {
  switch (step.type) {
    case 'CLICK': {
      const strat = step.selectorStrategy === 'xy-position' ? ' (position-based)' : '';
      return truncate(step.selector, 40) + strat;
    }
    case 'WAIT': return `${step.seconds} seconds`;
    case 'SNAP': return `${step.region.width}×${step.region.height}px region`;
    case 'NAVIGATE': return truncate(step.url, 40);
    case 'SCROLL': return `Position (${step.x}, ${step.y})`;
    case 'HOVER': return truncate(step.selector, 40);
    case 'SELECT': return `${truncate(step.selector, 25)} → ${step.optionValue}`;
    case 'TYPE': return `"${truncate(step.text, 30)}"`;
    case 'SCROLL_ELEMENT': return `scrollTop: ${step.scrollTop}`;
    case 'SEARCH_SELECT': return `"${truncate(step.searchText, 30)}"`;
    case 'FILTER': return `${step.optionSelectors?.length || 0} option(s)${step.applySelector ? ' + apply' : ' → re-click trigger'}`;
    case 'MACRO': {
      const types = step.actions.map(a => a.action);
      const clicks = types.filter(t => t === 'click').length;
      const typed = types.filter(t => t === 'type').length;
      const scrolls = types.filter(t => t === 'scroll').length;
      const snaps = types.filter(t => t === 'snap').length;
      const parts = [];
      if (clicks) parts.push(`${clicks} click${clicks > 1 ? 's' : ''}`);
      if (typed) parts.push(`${typed} input${typed > 1 ? 's' : ''}`);
      if (scrolls) parts.push(`${scrolls} scroll${scrolls > 1 ? 's' : ''}`);
      if (snaps) parts.push(`${snaps} snap${snaps > 1 ? 's' : ''}`);
      return `${step.actions.length} actions (${parts.join(', ') || 'empty'})`;
    }
    default: return '';
  }
}

function statusBorderColor(status?: RunStepStatus): string {
  switch (status) {
    case 'running': return 'border-l-ds-accent';
    case 'success': return 'border-l-ds-emerald';
    case 'warning': return 'border-l-ds-amber';
    case 'error': return 'border-l-ds-red';
    case 'skipped': return 'border-l-ds-text-dim';
    default: return 'border-l-transparent';
  }
}

interface StepListProps {
  onEditStep: (step: FlowStep) => void;
}

export function StepList({ onEditStep }: StepListProps) {
  const flow = useFlowStore(s => s.getActiveFlow());
  const selectedStepIndex = useFlowStore(s => s.selectedStepIndex);
  const selectStep = useFlowStore(s => s.selectStep);
  const removeStep = useFlowStore(s => s.removeStep);
  const removeGroup = useFlowStore(s => s.removeGroup);
  const moveStepUp = useFlowStore(s => s.moveStepUp);
  const moveStepDown = useFlowStore(s => s.moveStepDown);
  const updateStep = useFlowStore(s => s.updateStep);
  const reorderStep = useFlowStore(s => s.reorderStep);
  const runProgress = useAppStore(s => s.runProgress);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const globalLayout = useAppStore(s => s.settings.pptxLayout);
  const stepWaitSeconds = useFlowStore(s => s.defaults.stepWaitSeconds);
  const [expandedSnapId, setExpandedSnapId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderStep(fromIndex, toIndex);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, [reorderStep]);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  // Hover highlight
  const handleStepMouseEnter = useCallback((step: FlowStep) => {
    if ('selector' in step && (step as { selector: string }).selector) {
      browser.highlightElement((step as { selector: string }).selector);
    }
  }, []);

  const handleStepMouseLeave = useCallback(() => {
    browser.clearHighlight();
  }, []);

  if (!flow) {
    return (
      <EmptyState
        icon={MousePointer}
        title="No flow selected"
        description="Create or select a flow to start building your automation."
      />
    );
  }

  if (flow.steps.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="No steps yet"
        description="Switch to the Record tab to start capturing clicks and screenshots."
        action={{
          label: 'Start Recording',
          onClick: () => setActiveTab('record'),
        }}
      />
    );
  }

  return (
    <div className="space-y-1.5 p-1">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-sm font-medium text-ds-text-dim uppercase tracking-wider">
          {flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}
        </span>
        {selectedStepIndex !== null && flow.steps[selectedStepIndex] && (
          <div className="flex items-center gap-0.5">
            <Tooltip content="Move up">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => moveStepUp(flow.steps[selectedStepIndex].id)}
                disabled={selectedStepIndex === 0}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content="Move down">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => moveStepDown(flow.steps[selectedStepIndex].id)}
                disabled={selectedStepIndex === flow.steps.length - 1}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {flow.steps.map((step, index) => {
          const Icon = stepIcons[step.type] || MousePointer;
          const isSelected = selectedStepIndex === index;
          const runResult = runProgress?.results.find(r => r.stepId === step.id);
          const isCurrentlyRunning = runProgress?.status === 'running' && runProgress.currentStep === index;

          // Group detection
          const group = step.group;
          const prevGroup = index > 0 ? flow.steps[index - 1].group : undefined;
          const nextGroup = index < flow.steps.length - 1 ? flow.steps[index + 1].group : undefined;
          const isGroupStart = !!group && group !== prevGroup;
          const isInGroup = !!group;
          const isGroupEnd = !!group && group !== nextGroup;
          const isCollapsed = !!group && collapsedGroups.has(group);
          const groupStepCount = isGroupStart && group ? flow.steps.filter(s => s.group === group).length : 0;

          // Skip rendering non-first steps in collapsed groups
          if (isInGroup && !isGroupStart && isCollapsed) return null;

          const isSnap = step.type === 'SNAP';
          const isExpanded = isSnap && expandedSnapId === step.id;
          const snapStep = isSnap ? step as SnapStep : null;

          const updateSnapLayout = (updates: Record<string, number | boolean | string>) => {
            if (!snapStep) return;
            const cur = snapStep.slideLayout;
            const defaults = {
              imageX: globalLayout?.imageX ?? 0.3,
              imageY: globalLayout?.imageY ?? 0.8,
              imageW: globalLayout?.imageW ?? 12.7,
              imageH: globalLayout?.imageH ?? 6.2,
              showHeader: globalLayout?.showHeader ?? true,
              showFooter: globalLayout?.showFooter ?? true,
              fitMode: globalLayout?.fitMode ?? 'contain' as const,
            };
            updateStep(step.id, {
              slideLayout: { ...defaults, ...cur, ...updates },
            } as Partial<FlowStep>);
          };

          const clearSnapLayout = () => {
            updateStep(step.id, { slideLayout: undefined } as Partial<FlowStep>);
          };

          const sl = snapStep?.slideLayout;
          const hasCustomLayout = !!sl;

          return (
            <div key={step.id}>
              {/* Group header */}
              {isGroupStart && group && (
                <div className="flex items-center gap-1.5 px-2 py-1 mb-1 group/grp">
                  <button
                    onClick={() => toggleGroupCollapse(group)}
                    className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3 text-ds-accent" />
                      : <ChevronDown className="w-3 h-3 text-ds-accent" />
                    }
                    <Clapperboard className="w-3 h-3 text-ds-accent" />
                    <span className="text-xs font-bold text-ds-accent uppercase tracking-wider">
                      Recording Session
                      {isCollapsed && <span className="text-ds-text-dim font-normal ml-1">({groupStepCount} steps)</span>}
                    </span>
                  </button>
                  <div className="flex-1 h-px bg-ds-accent/20" />
                  <Tooltip content="Delete all steps in this session">
                    <button
                      onClick={() => setDeleteGroupId(group)}
                      className="opacity-0 group-hover/grp:opacity-100 transition-opacity p-0.5 rounded hover:bg-ds-red/10 hover:text-ds-red text-ds-text-dim"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Tooltip>
                </div>
              )}
              <motion.div
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12, scale: 0.95 }}
                transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, index)}
                onDrop={(e) => handleDrop(e as unknown as React.DragEvent, index)}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => handleStepMouseEnter(step)}
                onMouseLeave={handleStepMouseLeave}
                className={cn(
                  'rounded-lg border-l-[3px] border border-ds-border/50 bg-ds-surface/50 overflow-hidden',
                  'transition-all duration-150',
                  isSelected && 'bg-ds-accent/5 border-ds-accent/30 border-l-ds-accent',
                  !isSelected && !isInGroup && statusBorderColor(runResult?.status),
                  !isSelected && isInGroup && 'border-l-ds-accent/30',
                  isCurrentlyRunning && 'ring-2 ring-ds-accent ring-offset-1 ring-offset-ds-bg bg-ds-accent/10 border-l-ds-accent shadow-[0_0_12px_rgba(124,92,252,0.3)]',
                  dragOverIndex === index && dragIndexRef.current !== index && 'border-t-2 border-t-ds-accent',
                  isInGroup && !isGroupEnd && 'mb-0 rounded-b-none',
                  isInGroup && !isGroupStart && 'rounded-t-none border-t-0',
                )}
              >
              {/* Main row */}
              <div
                onClick={() => selectStep(isSelected ? null : index)}
                className="group flex items-center gap-2 p-2.5 hover:bg-ds-surface-hover cursor-pointer"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-ds-text-dim bg-ds-bg shrink-0">
                  {index + 1}
                </span>
                <Icon className={cn('w-3.5 h-3.5 shrink-0', isCurrentlyRunning ? 'text-ds-accent animate-pulse' : 'text-ds-text-muted')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={stepTypeBadgeVariant(step.type)} className="text-sm px-1.5 py-0">
                      {step.type}
                    </Badge>
                    <span className="text-xs font-medium text-ds-text truncate">
                      {step.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-ds-text-dim truncate">
                      {isSnap
                        ? hasCustomLayout
                          ? `${stepDetail(step)} · Custom layout`
                          : stepDetail(step)
                        : stepDetail(step)}
                    </p>
                    {step.type !== 'WAIT' && step.type !== 'NAVIGATE' && (
                      <span
                        className="inline-flex items-center gap-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Clock className={cn('w-2.5 h-2.5', step.waitOverride != null ? 'text-ds-amber' : 'text-ds-text-dim')} />
                        <input
                          type="number"
                          min={1.5}
                          max={120}
                          step={0.5}
                          value={step.waitOverride ?? stepWaitSeconds}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) {
                              const clamped = Math.max(1.5, v);
                              updateStep(step.id, { waitOverride: clamped } as Partial<FlowStep>);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-8 h-4 px-0.5 text-xs font-mono text-center bg-ds-bg border border-ds-border rounded focus:outline-none focus:border-ds-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none text-ds-text-muted"
                          title="Wait time for this step (seconds)"
                        />
                        <span className="text-xs text-ds-text-dim">s</span>
                      </span>
                    )}
                  </div>
                </div>
                {isCurrentlyRunning && (
                  <StepCountdown stepWaitSeconds={step.type === 'WAIT' ? (step as { seconds: number }).seconds : Math.max(1.5327, step.waitOverride ?? stepWaitSeconds)} />
                )}
                <div className={cn("flex items-center gap-0.5 transition-opacity shrink-0", isCurrentlyRunning ? 'opacity-0' : 'opacity-0 group-hover:opacity-100')}>
                  {isSnap && (
                    <Tooltip content="Slide layout">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => { e.stopPropagation(); setExpandedSnapId(isExpanded ? null : step.id); }}
                        className={hasCustomLayout ? 'text-ds-accent' : ''}
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip content="Edit">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); onEditStep(step); }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Remove">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); setDeleteStepId(step.id); }}
                      className="hover:text-ds-red"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Tooltip>
                  <GripVertical className="w-3 h-3 text-ds-text-dim/50 cursor-grab active:cursor-grabbing" />
                </div>
              </div>

              {/* Expandable slide layout panel for SNAP steps */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 border-t border-ds-border/30 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-ds-text flex items-center gap-1">
                          <Layout className="w-3 h-3 text-ds-accent" />
                          Slide Layout
                        </span>
                        {hasCustomLayout && (
                          <button
                            onClick={clearSnapLayout}
                            className="text-xs text-ds-text-dim hover:text-ds-red transition-colors"
                          >
                            Reset to global
                          </button>
                        )}
                      </div>

                      {/* Visual slide preview with drag-to-place */}
                      <SlideLayoutPreview
                        layout={{
                          imageX: sl?.imageX ?? globalLayout?.imageX ?? 0.3,
                          imageY: sl?.imageY ?? globalLayout?.imageY ?? 0.8,
                          imageW: sl?.imageW ?? globalLayout?.imageW ?? 12.7,
                          imageH: sl?.imageH ?? globalLayout?.imageH ?? 6.2,
                          showHeader: sl?.showHeader ?? globalLayout?.showHeader ?? true,
                          showFooter: sl?.showFooter ?? globalLayout?.showFooter ?? true,
                          fitMode: sl?.fitMode ?? globalLayout?.fitMode ?? 'contain',
                          cropTop: sl?.cropTop ?? globalLayout?.cropTop ?? 0,
                          cropRight: sl?.cropRight ?? globalLayout?.cropRight ?? 0,
                          cropBottom: sl?.cropBottom ?? globalLayout?.cropBottom ?? 0,
                          cropLeft: sl?.cropLeft ?? globalLayout?.cropLeft ?? 0,
                        }}
                        onChange={updateSnapLayout}
                        onPreset={(preset) => {
                          const defaults = {
                            imageX: globalLayout?.imageX ?? 0.3,
                            imageY: globalLayout?.imageY ?? 0.8,
                            imageW: globalLayout?.imageW ?? 12.7,
                            imageH: globalLayout?.imageH ?? 6.2,
                            showHeader: globalLayout?.showHeader ?? true,
                            showFooter: globalLayout?.showFooter ?? true,
                            fitMode: globalLayout?.fitMode ?? 'contain' as const,
                            cropTop: 0,
                            cropRight: 0,
                            cropBottom: 0,
                            cropLeft: 0,
                          };
                          updateStep(step.id, {
                            slideLayout: { ...defaults, ...preset },
                          } as Partial<FlowStep>);
                        }}
                      />

                      {/* Fit mode */}
                      <div className="space-y-1">
                        <span className="text-xs text-ds-text-dim uppercase tracking-wide flex items-center gap-1">
                          <Maximize2 className="w-2 h-2" /> Fit Mode
                        </span>
                        <div className="flex gap-1">
                          {(['contain', 'fill', 'stretch'] as const).map(mode => (
                            <button
                              key={mode}
                              onClick={() => updateSnapLayout({ fitMode: mode })}
                              className={`flex-1 px-1.5 py-1 text-xs rounded border transition-colors capitalize ${
                                (sl?.fitMode ?? globalLayout?.fitMode ?? 'contain') === mode
                                  ? 'bg-ds-accent/20 border-ds-accent text-ds-accent'
                                  : 'bg-ds-bg border-ds-border text-ds-text-muted hover:text-ds-text'
                              }`}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Header / Footer toggles */}
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch.Root
                            checked={sl?.showHeader ?? globalLayout?.showHeader ?? true}
                            onCheckedChange={v => updateSnapLayout({ showHeader: v })}
                            className="w-7 h-4 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
                          >
                            <Switch.Thumb className="block w-3 h-3 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3 translate-x-0.5" />
                          </Switch.Root>
                          <span className="text-xs text-ds-text">Header</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch.Root
                            checked={sl?.showFooter ?? globalLayout?.showFooter ?? true}
                            onCheckedChange={v => updateSnapLayout({ showFooter: v })}
                            className="w-7 h-4 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
                          >
                            <Switch.Thumb className="block w-3 h-3 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-3 translate-x-0.5" />
                          </Switch.Root>
                          <span className="text-xs text-ds-text">Footer</span>
                        </label>
                      </div>

                      {/* Crop */}
                      <div className="space-y-1.5 pt-1 border-t border-ds-border/30">
                        <span className="text-xs text-ds-text-dim uppercase tracking-wide">Crop (%)</span>
                        <div className="grid grid-cols-4 gap-1">
                          {([
                            ['cropTop', 'Top'],
                            ['cropRight', 'Right'],
                            ['cropBottom', 'Bottom'],
                            ['cropLeft', 'Left'],
                          ] as const).map(([field, label]) => (
                            <div key={field} className="space-y-0.5">
                              <span className="text-xs text-ds-text-dim uppercase">{label}</span>
                              <Input
                                type="number"
                                min="0"
                                max="50"
                                step="1"
                                value={sl?.[field] ?? globalLayout?.[field] ?? 0}
                                onChange={e => updateSnapLayout({ [field]: Math.min(50, Math.max(0, parseInt(e.target.value) || 0)) })}
                                className="font-mono text-xs h-6 px-1 text-center"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            </div>
          );
        })}
      </AnimatePresence>

      {/* Delete step confirmation dialog (Fix #5) */}
      <AlertDialog.Root open={!!deleteStepId} onOpenChange={open => { if (!open) setDeleteStepId(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[320px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
            <AlertDialog.Title className="text-sm font-bold text-ds-text">
              Delete Step?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-xs text-ds-text-dim mt-2 mb-4">
              Remove "{flow?.steps.find(s => s.id === deleteStepId)?.label}"? This cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  size="sm"
                  className="bg-ds-red hover:bg-ds-red/80 text-white"
                  onClick={() => {
                    if (deleteStepId) {
                      if (expandedSnapId === deleteStepId) setExpandedSnapId(null);
                      removeStep(deleteStepId);
                    }
                    setDeleteStepId(null);
                  }}
                >
                  Delete
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Delete group confirmation dialog */}
      <AlertDialog.Root open={!!deleteGroupId} onOpenChange={open => { if (!open) setDeleteGroupId(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[320px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
            <AlertDialog.Title className="text-sm font-bold text-ds-text">
              Delete Recording Session?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-xs text-ds-text-dim mt-2 mb-4">
              This will remove all {deleteGroupId ? flow?.steps.filter(s => s.group === deleteGroupId).length : 0} steps
              in this recording session. This cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  size="sm"
                  className="bg-ds-red hover:bg-ds-red/80 text-white"
                  onClick={() => {
                    if (deleteGroupId) {
                      removeGroup(deleteGroupId);
                      setCollapsedGroups(prev => {
                        const next = new Set(prev);
                        next.delete(deleteGroupId);
                        return next;
                      });
                    }
                    setDeleteGroupId(null);
                  }}
                >
                  Delete All
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
