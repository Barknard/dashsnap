import { type LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-10 px-6 text-center',
      className,
    )}>
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-ds-accent/10 border border-ds-accent/20 mb-4">
        <Icon className="w-7 h-7 text-ds-accent/60" />
      </div>
      <h3 className="text-sm font-semibold text-ds-text mb-1">{title}</h3>
      <p className="text-xs text-ds-text-dim max-w-[240px] leading-relaxed">{description}</p>
      {action && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
