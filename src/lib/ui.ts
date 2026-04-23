import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        disabled: 'border border-border bg-secondary/60 text-muted-foreground cursor-not-allowed'
      },
      size: {
        sm: 'h-7 px-2 text-[11px]',
        md: 'h-8 px-3 text-xs',
        lg: 'h-9 px-4 text-sm'
      },
      fill: {
        false: '',
        true: 'w-full'
      }
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
      fill: false
    }
  }
);
