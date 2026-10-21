import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectionHelp } from './ConnectionHelp'

describe('ConnectionHelp', () => {
  it('tells everyone to check the backend is running', () => {
    render(<ConnectionHelp dev={false} />)
    const help = screen.getByRole('region', { name: "Can't reach the monitor service" })
    expect(help).toHaveTextContent('uv run memmon')
    expect(help).not.toHaveTextContent('--dev')
  })

  it('adds the dev-server causes when running under Vite', () => {
    render(<ConnectionHelp dev />)
    const help = screen.getByRole('region', { name: "Can't reach the monitor service" })
    expect(help).toHaveTextContent('uv run memmon --dev')
    expect(help).toHaveTextContent('desktop app')
    expect(help).toHaveTextContent('MEMMON_PORT=8766')
  })
})
