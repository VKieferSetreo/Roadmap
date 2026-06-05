import { type HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border font-medium tabular-nums whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary-50 border-primary-200 text-primary-700",
        outline: "bg-white border-neutral-300 text-neutral-700",
        muted: "bg-neutral-100 border-neutral-200 text-neutral-600",
        accent: "bg-accent-100 border-accent-400 text-accent-700",
        success: "bg-status-done-bg border-status-done-border text-status-done-text",
        warning: "bg-status-waiting-bg border-status-waiting-border text-status-waiting-text",
        danger: "bg-frist-today-bg border-frist-today-border text-frist-today-text",
      },
      size: {
        xs: "text-[10px] px-1.5 py-0.5",
        sm: "text-xs px-2 py-0.5",
        default: "text-xs px-2 py-0.5",
      },
      shape: {
        pill: "rounded-full",
        square: "rounded",
      },
    },
    defaultVariants: { variant: "default", size: "default", shape: "pill" },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, shape, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, shape }), className)} {...props} />
}
