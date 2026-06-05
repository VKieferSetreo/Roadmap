// Button-Komponente (shadcn-Style — kann mit `npx shadcn@latest add button` aktualisiert werden).

import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/cn"

type Variant = "default" | "outline" | "ghost" | "destructive" | "primary" | "secondary"
type Size = "xs" | "sm" | "md" | "default" | "lg" | "icon" | "icon-sm"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  default: "bg-primary-600 text-white hover:bg-primary-700",
  primary: "bg-primary-600 text-white hover:bg-primary-700",
  secondary: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
  outline:
    "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900",
  ghost: "text-neutral-700 hover:bg-neutral-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
}

const sizeClasses: Record<Size, string> = {
  xs: "h-7 px-2 text-xs",
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  default: "h-9 px-4 text-sm",
  lg: "h-10 px-6 text-sm",
  icon: "h-9 w-9",
  "icon-sm": "h-7 w-7",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = "Button"
