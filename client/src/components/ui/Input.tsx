import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 text-ds-text-dim pointer-events-none">
            {icon}
          </div>
        )}
        <input
          className={cn(
            'flex h-9 w-full rounded-lg border border-ds-border bg-ds-bg px-3 py-2 text-sm text-ds-text',
            'placeholder:text-ds-text-dim',
            'focus:outline-none focus:ring-2 focus:ring-ds-accent/50 focus:border-ds-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-shadow duration-200',
            icon && 'pl-9',
            className,
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
