import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/cn"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm transition-colors duration-200 placeholder:text-neutral-400 hover:bg-neutral-50 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm transition-colors duration-200 placeholder:text-neutral-400 hover:bg-neutral-50 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:hover:bg-white",
      className,
    )}
    {...props}
  />
))
Textarea.displayName = "Textarea"

export function Label({
  children,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  )
}
