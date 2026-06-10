// Card-System: ring-basierte Kante + Elevation-Tokens (shadow-card / -hover).
// `interactive` aktiviert Hover-Lift für klickbare Karten.

import type { HTMLAttributes } from "react"
import { cn } from "@/lib/cn"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Hover-Lift + Schatten-Verstärkung für klickbare Karten. */
  interactive?: boolean
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-neutral-200/80 bg-white shadow-card",
        interactive &&
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1 border-b border-neutral-100 p-4", className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-semibold text-neutral-900", className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-neutral-500", className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center border-t border-neutral-100 p-4", className)}
      {...props}
    />
  )
}
