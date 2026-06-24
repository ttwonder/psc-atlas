import { describe, expect, it } from 'vitest'
import { withTimeout } from './officialRefresh'

describe('official refresh shared helpers', () => {
  it('uses global timers so it can run in Node/serverless without window', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'timeout')).resolves.toBe('ok')
  })
})
