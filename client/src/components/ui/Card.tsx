import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  active?: boolean;
  gradient?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover, active, gradient, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-ds-border bg-ds-surface p-3',
          hover && 'hover:bg-ds-surface-hover hover:border-ds-border-bright cursor-pointer',
          active && 'border-ds-accent/50 bg-ds-accent/5 glow-accent',
          gradient && 'bg-gradient-to-br from-ds-surface to-ds-bg',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = 'Card';

export { Card };
