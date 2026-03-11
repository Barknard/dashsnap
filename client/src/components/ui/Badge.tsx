import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border transition-colors select-none',
  {
    variants: {
      variant: {
        default: 'bg-ds-surface border-ds-border text-ds-text-muted',
        accent: 'bg-ds-accent/15 border-ds-accent/30 text-ds-accent',
        emerald: 'bg-ds-emerald/15 border-ds-emerald/30 text-ds-emerald',
        amber: 'bg-ds-amber/15 border-ds-amber/30 text-ds-amber',
        red: 'bg-ds-red/15 border-ds-red/30 text-ds-red',
        purple: 'bg-ds-purple/15 border-ds-purple/30 text-ds-purple',
        dim: 'bg-ds-text-dim/10 border-ds-text-dim/20 text-ds-text-dim',
        cyan: 'bg-ds-cyan/15 border-ds-cyan/30 text-ds-cyan',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function stepTypeBadgeVariant(type: string): BadgeProps['variant'] {
  switch (type) {
    case 'CLICK': return 'accent';
    case 'WAIT': return 'amber';
    case 'SNAP': return 'emerald';
    case 'NAVIGATE': return 'purple';
    case 'SCROLL': return 'dim';
    case 'HOVER': return 'purple';
    case 'SELECT': return 'amber';
    case 'TYPE': return 'cyan';
    case 'SCROLL_ELEMENT': return 'dim';
    case 'SEARCH_SELECT': return 'cyan';
    case 'FILTER': return 'amber';
    default: return 'default';
  }
}

export { Badge, badgeVariants };
