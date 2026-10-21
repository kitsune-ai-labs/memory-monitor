import type { ProcessMemory } from '../api/protocol'
import { formatBytes } from '../lib/format'

interface ProcessListProps {
  label: string
  color: string
  processes: ProcessMemory[]
}

const share = (bytes: number, max: number) => `${Math.round((bytes / max) * 1000) / 10}%`

export function ProcessList({ label, color, processes }: ProcessListProps) {
  if (processes.length === 0) return <p className="muted">No processes reported</p>
  const max = Math.max(...processes.map((p) => p.bytes), 1)
  return (
    <ul className="procs" aria-label={label}>
      {processes.map((p) => (
        <li key={p.name} className="procs__row" title={`${p.name} · ${p.count} ${p.count === 1 ? 'process' : 'processes'}`}>
          <span className="procs__name">{p.name}</span>
          <span className="procs__track" aria-hidden="true">
            <span data-testid="bar" className="procs__bar" style={{ width: share(p.bytes, max), background: color }} />
          </span>
          <span className="procs__size">{formatBytes(p.bytes)}</span>
        </li>
      ))}
    </ul>
  )
}
