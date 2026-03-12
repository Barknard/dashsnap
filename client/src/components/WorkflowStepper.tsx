import { motion } from 'framer-motion';
import {
  Globe, Clapperboard, Camera, Play, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkflowPhase = 'navigate' | 'record' | 'capture' | 'ready';

interface WorkflowStepperProps {
  phase: WorkflowPhase;
  actionCount: number;
  slideCount: number;
}

const STEPS = [
  {
    id: 'navigate' as const,
    icon: Globe,
    title: 'Open your dashboard',
    active: 'Paste a URL in the bar above',
    done: 'Dashboard loaded',
    color: 'ds-accent',
  },
  {
    id: 'record' as const,
    icon: Clapperboard,
    title: 'Record your workflow',
    active: 'Hit Record — press S to capture, Enter to finish',
    done: (n: number) => `${n} action${n !== 1 ? 's' : ''} recorded`,
    color: 'ds-accent',
  },
  {
    id: 'capture' as const,
    icon: Camera,
    title: 'Capture screenshots',
    active: 'Press S during recording, or use Quick Capture',
    done: (n: number) => `${n} slide${n !== 1 ? 's' : ''} captured`,
    color: 'ds-emerald',
  },
  {
    id: 'ready' as const,
    icon: Play,
    title: 'Run Report',
    active: 'Hit Run Report below to build your PPTX',
    done: 'Report complete!',
    color: 'ds-emerald',
  },
];

function phaseIndex(phase: WorkflowPhase): number {
  return STEPS.findIndex(s => s.id === phase);
}

export function WorkflowStepper({ phase, actionCount, slideCount }: WorkflowStepperProps) {
  const currentIdx = phaseIndex(phase);

  return (
    <div className="rounded-xl border border-ds-border bg-ds-surface/60 p-3 space-y-1">
      <p className="text-xs font-semibold text-ds-text-dim uppercase tracking-wider mb-2">
        What to do next
      </p>

      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isFuture = idx > currentIdx;
        const Icon = step.icon;

        const desc = isDone
          ? (typeof step.done === 'function'
              ? step.done(idx === 1 ? actionCount : slideCount)
              : step.done)
          : isActive
            ? step.active
            : step.title;

        return (
          <motion.div
            key={step.id}
            initial={false}
            animate={{
              opacity: isFuture ? 0.4 : 1,
              scale: isActive ? 1 : 0.98,
            }}
            transition={{ duration: 0.2 }}
            className={cn(
              'flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors',
              isActive && 'bg-ds-accent/8 border border-ds-accent/20',
              isDone && 'bg-ds-emerald/5',
              isFuture && 'opacity-40',
            )}
          >
            {/* Step indicator */}
            <div className={cn(
              'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors',
              isDone && 'bg-ds-emerald/20',
              isActive && `bg-${step.color}/20`,
              isFuture && 'bg-ds-border',
            )}>
              {isDone ? (
                <Check className="w-3.5 h-3.5 text-ds-emerald" />
              ) : isActive ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Icon className={cn('w-3.5 h-3.5', `text-${step.color}`)} />
                </motion.div>
              ) : (
                <Icon className="w-3.5 h-3.5 text-ds-text-dim" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-semibold',
                isDone && 'text-ds-emerald',
                isActive && 'text-ds-text',
                isFuture && 'text-ds-text-dim',
              )}>
                {isDone ? step.title : isActive ? step.title : step.title}
              </p>
              <p className={cn(
                'text-xs mt-0.5',
                isActive ? 'text-ds-text-muted' : 'text-ds-text-dim',
              )}>
                {desc}
              </p>
            </div>

            {/* Active indicator */}
            {isActive && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className={cn('w-2 h-2 rounded-full shrink-0', `bg-${step.color}`)}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
