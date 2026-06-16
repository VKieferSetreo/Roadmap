// Button-Komponente (shadcn-Style — kann mit `npx shadcn@latest add button` aktualisiert werden).

import { forwardRef, type ButtonHTMLAttributes } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/cn"

type Variant = "default" | "outline" | "ghost" | "destructive" | "primary" | "secondary"
type Size = "xs" | "sm" | "md" | "default" | "lg" | "icon" | "icon-sm"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Zeigt einen Spinner und deaktiviert den Button während einer asynchronen Aktion. */
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  default: "bg-primary-600 text-white shadow-card hover:bg-primary-700 hover:shadow-card-hover",
  primary: "bg-primary-600 text-white shadow-card hover:bg-primary-700 hover:shadow-card-hover",
  secondary: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
  outline:
    "border border-neutral-200 bg-white text-neutral-700 shadow-card hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300",
  ghost: "text-neutral-700 hover:bg-neutral-100",
  destructive: "bg-severity-kritisch text-white shadow-card hover:bg-severity-kritisch-strong",
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
  ({ className, variant = "default", size = "md", loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  ),
)
Button.displayName = "Button"
