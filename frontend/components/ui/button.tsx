import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 " +
    "disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-cta-gradient text-white shadow-sm hover:brightness-105 active:brightness-95",
        solid: "bg-brand-blue text-white shadow-sm hover:bg-blue-700 active:opacity-90",
        outline:
          "border border-border bg-white text-brand-ink hover:bg-secondary",
        ghost: "text-brand-ink hover:bg-secondary",
        link: "text-brand-blue underline-offset-4 hover:underline p-0 h-auto font-medium",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-10 px-4 text-sm",
        lg: "h-14 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
