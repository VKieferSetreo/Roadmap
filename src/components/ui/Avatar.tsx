import { cn } from "@/lib/cn"

export interface AvatarProfile {
  id: string
  display_name: string
  initials: string
  /** Tailwind bg-Class (z.B. "bg-primary-600"). */
  color: string
}

export function Avatar({
  profile,
  size = "default",
  className,
}: {
  profile: AvatarProfile
  size?: "xs" | "sm" | "default" | "lg"
  className?: string
}) {
  const sizes = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-6 w-6 text-[10px]",
    default: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white flex-shrink-0",
        profile.color,
        sizes[size],
        className,
      )}
      title={profile.display_name}
      aria-label={profile.display_name}
    >
      {profile.initials}
    </span>
  )
}

export function AvatarStack({
  profiles,
  max = 3,
  size = "sm",
}: {
  profiles: AvatarProfile[]
  max?: number
  size?: "xs" | "sm" | "default"
}) {
  const visible = profiles.slice(0, max)
  const remaining = profiles.length - visible.length
  return (
    <div className="flex -space-x-1.5">
      {visible.map((p) => (
        <Avatar
          key={p.id}
          profile={p}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
      {remaining > 0 ? (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-neutral-200 text-neutral-600 ring-2 ring-white font-medium",
            size === "default" ? "h-8 w-8 text-xs" : size === "sm" ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]",
          )}
        >
          +{remaining}
        </span>
      ) : null}
    </div>
  )
}
