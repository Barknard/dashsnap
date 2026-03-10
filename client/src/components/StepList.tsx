import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer, Clock, Camera, Globe, ArrowDown,
  GripVertical, Pencil, X, ChevronUp, ChevronDown,
} from 'lucide-react';
import { type FlowStep, type RunStepStatus } from '@shared/types';
import { Badge, stepTypeBadgeVariant } from './ui/Badge';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { EmptyState } from './EmptyState';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';
import { cn, truncate } from '@/lib/utils';

const stepIcons: Record<string, typeof MousePointer> = {
  CLICK: MousePointer,
  WAIT: Clock,
  SNAP: Camera,
  NAVIGATE: Globe,
  SCROLL: ArrowDown,
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
  const moveStepUp = useFlowStore(s => s.moveStepUp);
  const moveStepDown = useFlowStore(s => s.moveStepDown);
  const runProgress = useAppStore(s => s.runProgress);
  const setActiveTab = useAppStore(s => s.setActiveTab);

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

          return (
            <motion.div
              key={step.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12, scale: 0.95 }}
              transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
              onClick={() => selectStep(isSelected ? null : index)}
              className={cn(
                'group flex items-center gap-2 p-2.5 rounded-lg border-l-[3px] border border-ds-border/50 bg-ds-surface/50',
                'hover:bg-ds-surface-hover cursor-pointer transition-all duration-150',
                isSelected && 'bg-ds-accent/5 border-ds-accent/30 border-l-ds-accent',
                !isSelected && statusBorderColor(runResult?.status),
                isCurrentlyRunning && 'ring-1 ring-ds-accent/40 bg-ds-accent/5',
              )}
            >
              {/* Step number */}
              <span className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-ds-text-dim bg-ds-bg shrink-0">
                {index + 1}
              </span>

              {/* Icon */}
              <Icon className={cn('w-3.5 h-3.5 shrink-0', isCurrentlyRunning ? 'text-ds-accent animate-pulse' : 'text-ds-text-muted')} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Badge variant={stepTypeBadgeVariant(step.type)} className="text-sm px-1.5 py-0">
                    {step.type}
                  </Badge>
                  <span className="text-xs font-medium text-ds-text truncate">
                    {step.label}
                  </span>
                </div>
                <p className="text-xs text-ds-text-dim truncate mt-0.5">
                  {stepDetail(step)}
                </p>
              </div>

              {/* Drag handle + actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
                    onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                    className="hover:text-ds-red"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Tooltip>
                <GripVertical className="w-3 h-3 text-ds-text-dim/50 cursor-grab" />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
