import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const variants = {
  primary: "bg-ink-900 text-white hover:bg-ink-800 shadow-[0_8px_20px_-10px_rgb(6_10_11/0.6)]",
  gold: "lux-brand text-white",
  secondary: "bg-ivory-200 text-ink-900 hover:bg-ivory-300",
  outline: "border border-ivory-300 bg-ivory-50 text-ink-900 hover:bg-ivory-200",
  ghost: "text-ink-800 hover:bg-ivory-200",
  danger: "bg-danger text-white hover:bg-danger/90",
  "danger-soft": "bg-danger-soft text-danger hover:bg-danger/15",
  success: "bg-success text-white hover:bg-success/90",
} as const;

const sizes = {
  xs: "h-7 px-2 text-xs rounded-md gap-1",
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2",
  xl: "h-16 px-6 text-lg rounded-xl gap-3",
  icon: "h-10 w-10 rounded-lg",
  "icon-sm": "h-8 w-8 rounded-md",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97] active:duration-75 disabled:pointer-events-none disabled:opacity-50 cursor-pointer touch-manipulation",
          variants[variant],
          sizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? children : (
          <>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
