import { describe, expect, it } from 'vitest'
import { isRefreshAuthorized } from './serverRefreshAuth'

describe('server refresh authorization', () => {
  it('accepts x-psc-refresh-token matching the configured refresh token', () => {
    const headers = new Headers({ 'x-psc-refresh-token': 'refresh-ok' })
    expect(isRefreshAuthorized(headers, 'refresh-ok')).toBe(true)
  })

  it('rejects missing or wrong token', () => {
    expect(isRefreshAuthorized(new Headers(), 'refresh-ok')).toBe(false)
    expect(isRefreshAuthorized(new Headers({ 'x-psc-refresh-token': 'wrong' }), 'refresh-ok')).toBe(false)
  })
})
