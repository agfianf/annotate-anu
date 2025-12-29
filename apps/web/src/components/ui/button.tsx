import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { RippleEffect } from "./animate/RippleEffect";
import { MagneticButton } from "./animate/MagneticButton";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "glass text-gray-900 hover:glass-strong",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Enable ripple effect on click
   * @default false
   */
  ripple?: boolean;
  /**
   * Enable magnetic effect on hover
   * @default false
   */
  magnetic?: boolean;
  /**
   * Color for ripple effect
   * @default 'rgba(16, 185, 129, 0.5)' for default variant
   */
  rippleColor?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ripple = false, magnetic = false, rippleColor, ...props }, ref) => {
    const prefersReducedMotion = useReducedMotion();
    const baseClassName = cn(buttonVariants({ variant, size, className }));

    // Determine ripple color based on variant
    const defaultRippleColor =
      variant === 'destructive'
        ? 'rgba(239, 68, 68, 0.5)'
        : variant === 'secondary'
        ? 'rgba(154, 186, 18, 0.5)'
        : 'rgba(16, 185, 129, 0.5)'; // emerald

    const finalRippleColor = rippleColor || defaultRippleColor;

    // If both ripple and magnetic are enabled
    if (ripple && magnetic && !prefersReducedMotion) {
      const { children, ...restProps } = props;
      return (
        <MagneticButton className={baseClassName} strength={0.25} {...restProps}>
          <RippleEffect color={finalRippleColor} className="w-full h-full" {...restProps}>
            {children}
          </RippleEffect>
        </MagneticButton>
      );
    }

    // If only ripple is enabled
    if (ripple && !prefersReducedMotion) {
      const { children, ...restProps } = props;
      return (
        <RippleEffect color={finalRippleColor} className={baseClassName} {...restProps}>
          {children}
        </RippleEffect>
      );
    }

    // If only magnetic is enabled
    if (magnetic && !prefersReducedMotion) {
      const { children, ...restProps } = props;
      return (
        <MagneticButton className={baseClassName} {...restProps}>
          {children}
        </MagneticButton>
      );
    }

    // Standard button with subtle hover/tap animations
    if (!prefersReducedMotion) {
      const {
        children,
        onAnimationStart,
        onAnimationEnd,
        onAnimationIteration,
        onDragStart,
        onDragEnd,
        onDrag,
        ...motionProps
      } = props;
      return (
        <motion.button
          className={baseClassName}
          ref={ref}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          {...motionProps}
        >
          {children}
        </motion.button>
      );
    }

    // Fallback for reduced motion
    return <button className={baseClassName} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants }
