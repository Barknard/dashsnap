import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer, Clock, Globe, ArrowDown, Hand, ListFilter,
  Type, ArrowDownUp, Search, Filter, Clapperboard,
  Pencil, X, GripVertical, Timer, Camera,
} from 'lucide-react';
import { cn, truncate } from '@/lib/utils';
import { Badge, stepTypeBadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import type { FlowStep, RunStepStatus } from '@shared/types';

// V2 terminology map for display
const ACTION_TYPE_LABELS: Record<string, string> = {
  CLICK: 'CLICK',
  WAIT: 'WAIT',
  SNAP: 'CAPTURE',
  NAVIGATE: 'NAVIGATE',
  SCROLL: 'SCROLL',
  HOVER: 'HOVER',
  SELECT: 'SELECT',
  TYPE: 'TYPE',
  SCROLL_ELEMENT: 'SCROLL',
  SEARCH_SELECT: 'SEARCH',
  FILTER: 'FILTER',
  MACRO: 'MACRO',
};

const actionIcons: Record<string, typeof MousePointer> = {
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

function actionDetail(step: FlowStep): string {
  switch (step.type) {
    case 'CLICK': {
      const strat = step.selectorStrategy === 'xy-position' ? ' (position)' : '';
      return truncate(step.selector, 35) + strat;
    }
    case 'WAIT': return `${step.seconds}s`;
    case 'SNAP': return `${step.region.width}×${step.region.height}px`;
    case 'NAVIGATE': return truncate(step.url, 35);
    case 'SCROLL': return `(${step.x}, ${step.y})`;
    case 'HOVER': return truncate(step.selector, 35);
    case 'SELECT': return `${truncate(step.selector, 20)} → ${step.optionValue}`;
    case 'TYPE': return `"${truncate(step.text, 28)}"`;
    case 'SCROLL_ELEMENT': return `scrollTop: ${step.scrollTop}`;
    case 'SEARCH_SELECT': return `"${truncate(step.searchText, 28)}"`;
    case 'FILTER': return `${step.optionSelectors?.length || 0} option(s)`;
    case 'MACRO': return `${step.actions.length} actions`;
    default: return '';
  }
}

function statusBorderClass(status?: RunStepStatus): string {
  switch (status) {
    case 'running': return 'border-l-ds-accent';
    case 'success': return 'border-l-ds-emerald';
    case 'warning': return 'border-l-ds-amber';
    case 'error': return 'border-l-ds-red';
    case 'skipped': return 'border-l-ds-text-dim';
    default: return 'border-l-transparent';
  }
}

interface ActionPanelProps {
  actions: FlowStep[];
  slideTitle?: string;
  stepWaitSeconds: number;
  runResults?: Map<string, RunStepStatus>;
  currentRunningStepId?: string;
  onEditAction: (step: FlowStep) => void;
  onDeleteAction: (stepId: string) => void;
  onUpdateAction: (stepId: string, updates: Partial<FlowStep>) => void;
  onHighlightElement?: (selector: string) => void;
  onClearHighlight?: () => void;
}

export function ActionPanel({
  actions,
  slideTitle,
  stepWaitSeconds,
  runResults,
  currentRunningStepId,
  onEditAction,
  onDeleteAction,
  onUpdateAction,
  onHighlightElement,
  onClearHighlight,
}: ActionPanelProps) {
  const handleMouseEnter = useCallback((step: FlowStep) => {
    if ('selector' in step && (step as { selector: string }).selector) {
      onHighlightElement?.((step as { selector: string }).selector);
    }
  }, [onHighlightElement]);

  const handleMouseLeave = useCallback(() => {
    onClearHighlight?.();
  }, [onClearHighlight]);

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Camera className="w-6 h-6 text-ds-text-dim mb-2" />
        <p className="text-sm text-ds-text-muted">No actions for this slide</p>
        <p className="text-xs text-ds-text-dim mt-1">
          Record clicks, waits, and navigation before this capture
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Section header */}
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-medium text-ds-text-dim uppercase tracking-wider">
          Actions{slideTitle ? ` for ${truncate(slideTitle, 20)}` : ''}
        </span>
        <span className="text-xs text-ds-text-dim">
          {actions.length} action{actions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <AnimatePresence mode="popLayout">
        {actions.map((action, idx) => {
          const Icon = actionIcons[action.type] || MousePointer;
          const runStatus = runResults?.get(action.id);
          const isRunning = action.id === currentRunningStepId;

          return (
            <motion.div
              key={action.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onMouseEnter={() => handleMouseEnter(action)}
              onMouseLeave={handleMouseLeave}
              className={cn(
                'group flex items-center gap-2 px-2.5 py-2 rounded-lg border-l-[3px] border border-ds-border/40 bg-ds-surface/50',
                'hover:bg-ds-surface-hover transition-all cursor-pointer',
                statusBorderClass(runStatus),
                isRunning && 'ring-1 ring-ds-accent bg-ds-accent/5 border-l-ds-accent',
              )}
            >
              {/* Action number */}
              <span className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-ds-text-dim bg-ds-bg shrink-0">
                {idx + 1}
              </span>

              {/* Icon */}
              <Icon className={cn('w-3.5 h-3.5 shrink-0', isRunning ? 'text-ds-accent animate-pulse' : 'text-ds-text-muted')} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge variant={stepTypeBadgeVariant(action.type)} className="text-xs px-1.5 py-0">
                    {ACTION_TYPE_LABELS[action.type] || action.type}
                  </Badge>
                  <span className="text-xs font-medium text-ds-text truncate">
                    {action.label}
                  </span>
                </div>
                <p className="text-xs text-ds-text-dim truncate mt-0.5">
                  {actionDetail(action)}
                </p>
              </div>

              {/* Wait override — always visible for applicable types */}
              {action.type !== 'WAIT' && action.type !== 'NAVIGATE' && (
                <span
                  className="inline-flex items-center gap-0.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Clock className={cn('w-3 h-3', action.waitOverride != null ? 'text-ds-amber' : 'text-ds-text-dim')} />
                  <input
                    type="number"
                    min={1.5}
                    max={120}
                    step={0.5}
                    value={action.waitOverride ?? stepWaitSeconds}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        onUpdateAction(action.id, { waitOverride: Math.max(1.5, v) } as Partial<FlowStep>);
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="w-9 h-5 px-0.5 text-xs font-mono text-center bg-ds-bg border border-ds-border rounded focus:outline-none focus:border-ds-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none text-ds-text-muted"
                    title="Wait time (seconds)"
                  />
                  <span className="text-xs text-ds-text-dim">s</span>
                </span>
              )}

              {/* Hover actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Tooltip content="Edit">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onEditAction(action); }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </Tooltip>
                <Tooltip content="Remove">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => { e.stopPropagation(); onDeleteAction(action.id); }}
                    className="hover:text-ds-red"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Tooltip>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
