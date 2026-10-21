import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FakeNotifications } from '../test/fakeNotifications'
import { SETTINGS } from '../test/fixtures'
import { AlertsControl } from './AlertsControl'

describe('AlertsControl', () => {
  it('toggles alerts on the server', () => {
    const onUpdate = vi.fn()
    render(<AlertsControl settings={SETTINGS} onUpdate={onUpdate} notifications={new FakeNotifications()} />)
    const toggle = screen.getByRole('button', { name: 'Alerts' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(onUpdate).toHaveBeenCalledWith({ alertsEnabled: false })
  })

  it('asks for permission only when the user clicks', async () => {
    const api = new FakeNotifications('default', 'granted')
    render(<AlertsControl settings={SETTINGS} onUpdate={vi.fn()} notifications={api} />)
    expect(api.requests).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Enable Windows notifications' }))
    expect(await screen.findByText('Notifications on')).toBeInTheDocument()
    expect(api.requests).toBe(1)
  })

  it('explains when notifications are blocked', () => {
    render(<AlertsControl settings={SETTINGS} onUpdate={vi.fn()} notifications={new FakeNotifications('denied')} />)
    expect(screen.getByText('Notifications blocked in browser settings')).toBeInTheDocument()
  })

  it('hides the permission prompt while alerts are off', () => {
    render(
      <AlertsControl
        settings={{ ...SETTINGS, alertsEnabled: false }}
        onUpdate={vi.fn()}
        notifications={new FakeNotifications('default')}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Enable Windows notifications' })).toBeNull()
  })

  it('shows nothing extra when the browser cannot notify', () => {
    render(<AlertsControl settings={SETTINGS} onUpdate={vi.fn()} notifications={new FakeNotifications('unsupported')} />)
    expect(screen.queryByText(/notifications/i)).toBeNull()
  })
})
