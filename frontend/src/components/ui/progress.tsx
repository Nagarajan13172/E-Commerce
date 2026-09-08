import * as React from "react"
import { cn } from '@/lib/utils'
import { Progress as ProgressPrimitive } from "radix-ui"

/*
 * Diverges from the generated shadcn component in one important way: `value` is
 * forwarded to the Radix root, not merely used for the visual transform.
 *
 * As generated, `value` was destructured out and consumed only by the
 * indicator's `translateX`, so Radix never saw it — every bar reported
 * `data-state="indeterminate"` with no `aria-valuenow`. Sighted users watched
 * it fill while assistive technology was told the progress was unknown.
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
