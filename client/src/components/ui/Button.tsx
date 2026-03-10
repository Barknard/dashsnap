import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ds-bg disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'bg-ds-accent text-white shadow-md shadow-ds-accent/20 hover:bg-ds-accent-hover hover:shadow-lg hover:shadow-ds-accent/30 active:scale-[0.98]',
        gradient:
          'bg-gradient-to-r from-ds-accent to-ds-cyan text-white shadow-md shadow-ds-accent/20 hover:shadow-lg hover:shadow-ds-accent/30 active:scale-[0.98]',
        success:
          'bg-ds-emerald text-white shadow-md shadow-ds-emerald/20 hover:bg-ds-emerald/90 active:scale-[0.98]',
        destructive:
          'bg-ds-red/15 text-ds-red border border-ds-red/30 hover:bg-ds-red/25 active:scale-[0.98]',
        outline:
          'border border-ds-border bg-transparent text-ds-text hover:bg-ds-surface-hover hover:border-ds-border-bright',
        ghost:
          'text-ds-text-muted hover:bg-ds-surface-hover hover:text-ds-text',
        link:
          'text-ds-accent underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-md',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        xl: 'h-14 px-8 text-lg rounded-xl',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
