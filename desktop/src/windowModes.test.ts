import { describe, expect, it } from 'vitest'
import { boundsFor } from './windowModes'

describe('boundsFor', () => {
  it('gives the full dashboard a large resizable window', () => {
    expect(boundsFor('full')).toEqual({ width: 1400, height: 960, minWidth: 760, minHeight: 600 })
  })

  it('gives the compact view a narrow window', () => {
    expect(boundsFor('compact')).toEqual({ width: 448, height: 840, minWidth: 400, minHeight: 480 })
  })
})
