import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] text-sm font-medium tracking-[-0.005em] transition-colors duration-200 ease-[var(--ease-premium)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-graphite",
        accent: "bg-accent text-white hover:bg-accent-strong",
        secondary: "bg-white text-ink border border-line hover:border-silver hover:bg-paper",
        outline: "border border-ink/80 text-ink hover:bg-ink hover:text-white",
        ghost: "text-charcoal hover:bg-mist",
        link: "text-ink underline-offset-4 hover:underline decoration-silver px-0",
        danger: "bg-danger text-white hover:bg-danger/90",
        inverse: "bg-white text-ink hover:bg-paper",
        "outline-inverse": "border border-white/40 text-white hover:bg-white hover:text-ink",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
