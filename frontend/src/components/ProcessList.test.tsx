import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProcessList } from './ProcessList'

const GIB = 1024 ** 3

describe('ProcessList', () => {
  it('lists processes with sizes and relative bars', () => {
    render(
      <ProcessList
        label="Top processes by RAM"
        color="var(--ram)"
        processes={[
          { name: 'chrome', bytes: 4 * GIB, count: 23 },
          { name: 'Code', bytes: GIB, count: 1 },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Top processes by RAM' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('chrome')
    expect(items[0]).toHaveTextContent('4.0 GB')
    expect(items[0]).toHaveAttribute('title', 'chrome · 23 processes')
    expect(within(items[1]!).getByTestId('bar')).toHaveStyle({ width: '25%' })
  })

  it('renders process names as text, not markup', () => {
    render(<ProcessList label="Top" color="red" processes={[{ name: '<img src=x onerror=alert(1)>', bytes: 1, count: 1 }]} />)
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows an empty state', () => {
    render(<ProcessList label="Top" color="red" processes={[]} />)
    expect(screen.getByText('No processes reported')).toBeInTheDocument()
  })
})
