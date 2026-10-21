import { useEffect, useId, useRef, useState } from 'react'

interface ThresholdSliderProps {
  value: number
  onCommit: (pct: number) => void
  debounceMs?: number
}

/** Alert threshold slider that sends one update after the user stops dragging. */
export function ThresholdSlider({ value, onCommit, debounceMs = 300 }: ThresholdSliderProps) {
  const id = useId()
  const [draft, setDraft] = useState<number | null>(null)
  const [seenValue, setSeenValue] = useState(value)
  // Parents pass a new callback on every render (every snapshot), which must not restart the
  // debounce timer, so the latest callback is read through a ref.
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])
  if (value !== seenValue) {
    // The server confirmed (or another window changed) the value: stop showing the draft.
    setSeenValue(value)
    setDraft(null)
  }

  useEffect(() => {
    if (draft === null || draft === value) return
    const timer = setTimeout(() => onCommitRef.current(draft), debounceMs)
    return () => clearTimeout(timer)
  }, [draft, value, debounceMs])

  const shown = draft ?? value
  return (
    <div className="threshold">
      <label htmlFor={id}>Alert threshold</label>
      <input id={id} type="range" min={50} max={99} step={1} value={shown} onChange={(e) => setDraft(Number(e.target.value))} />
      <span className="threshold__value">{shown}%</span>
    </div>
  )
}
