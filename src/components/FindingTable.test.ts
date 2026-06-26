import { describe, expect, it } from 'vitest'
import { __findingKeywordTest, paginateFindings } from './FindingTable'

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


describe('finding pagination', () => {
  it('shows only 20 finding rows on each page', () => {
    const rows = Array.from({ length: 45 }, (_, index) => index + 1)
    expect(paginateFindings(rows, 1).items).toHaveLength(20)
    expect(paginateFindings(rows, 2).items[0]).toBe(21)
    expect(paginateFindings(rows, 3).items).toEqual([41, 42, 43, 44, 45])
    expect(paginateFindings(rows, 99).page).toBe(3)
  })
})
