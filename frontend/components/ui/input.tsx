import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-14 w-full rounded-xl border bg-secondary/60 px-4 text-base text-brand-ink " +
            "placeholder:text-muted-foreground outline-none transition focus:bg-white " +
            "focus:ring-2 focus:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-brand-error focus:border-brand-error focus:ring-brand-error/20"
            : "border-border focus:border-brand-blue",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
