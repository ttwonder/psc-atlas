import { describe, expect, it } from 'vitest'
import { __findingKeywordTest } from './FindingTable'

describe('finding keyword chips', () => {
  it('uses the same synonym rule for the visible Chinese label and English source text', () => {
    expect(__findingKeywordTest.textMatchesKeyword('The fire damper for the steering gear room could not be closed.', '防火風閘')).toBe(true)
  })

  it('matches simplified/traditional Chinese variants for chip filters', () => {
    expect(__findingKeywordTest.textMatchesKeyword('机舱2号通风装置的防火风闸卡死', '防火風閘')).toBe(true)
    expect(__findingKeywordTest.textMatchesKeyword('機艙防火風閘間隙過大', '防火風閘')).toBe(true)
  })

  it('does not match unrelated keywords', () => {
    expect(__findingKeywordTest.textMatchesKeyword('The lifeboat engine failed to start.', '防火風閘')).toBe(false)
  })
})
