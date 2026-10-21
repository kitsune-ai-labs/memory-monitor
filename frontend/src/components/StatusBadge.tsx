import type { UsageLevel } from '../lib/levels'
import { CheckIcon, CriticalIcon, UnknownIcon, WarningIcon } from './icons'

const LABELS: Record<UsageLevel, string> = {
  good: 'Normal',
  warning: 'Near threshold',
  critical: 'Over threshold',
  unknown: 'No data',
}

const ICONS: Record<UsageLevel, () => React.JSX.Element> = {
  good: CheckIcon,
  warning: WarningIcon,
  critical: CriticalIcon,
  unknown: UnknownIcon,
}

/** Status shown as icon + text so it never relies on colour alone. */
export function StatusBadge({ level }: { level: UsageLevel }) {
  const Icon = ICONS[level]
  return (
    <span className={`badge badge--${level}`}>
      <Icon />
      {LABELS[level]}
    </span>
  )
}
