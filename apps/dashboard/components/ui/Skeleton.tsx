import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string
  height?: number | string
}

/**
 * Tiny animated placeholder block. Pure Tailwind — no deps.
 * Defaults to a full-width block; override via className/width/height.
 *
 * Always `aria-hidden` so screen readers skip the placeholders.
 */
export function Skeleton({
  className,
  width,
  height,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-zinc-200',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...rest}
    />
  )
}
