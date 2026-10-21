import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['good', 'Normal'],
    ['warning', 'Near threshold'],
    ['critical', 'Over threshold'],
    ['unknown', 'No data'],
  ] as const)('shows %s as "%s" text, never colour alone', (level, label) => {
    render(<StatusBadge level={level} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
