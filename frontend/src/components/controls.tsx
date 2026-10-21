import { useId } from 'react'
import type { Settings, SettingsPatch } from '../api/protocol'
import { formatInterval } from '../lib/format'
import { INTERVALS, isInterval } from '../lib/status'

interface IntervalSelectProps {
  label: string
  value: Settings['intervalMs']
  onUpdate: (patch: SettingsPatch) => void
}

export function IntervalSelect({ label, value, onUpdate }: IntervalSelectProps) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (isInterval(next)) onUpdate({ intervalMs: next })
        }}
      >
        {INTERVALS.map((ms) => (
          <option key={ms} value={ms}>
            {formatInterval(ms)}
          </option>
        ))}
      </select>
    </div>
  )
}
