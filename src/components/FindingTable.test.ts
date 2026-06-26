import { describe, expect, it } from 'vitest'
import { __findingDraftTest, __findingKeywordTest, paginateFindings } from './FindingTable'
import type { Deficiency } from '../types'

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

describe('finding quick edit draft', () => {
  it('preserves original fields when changing priority or novel from the card controls', () => {
    const finding: Deficiency = {
      code: '07105',
      category: '消防安全',
      original: 'Fire door failed to close.',
      observedCondition: 'during test',
      inspectorFinding: 'failed',
      detentionReason: 'grounds for detention',
      requiredRectification: 'repair before departure',
      releaseCondition: 'test again',
      sourcePage: 'p. 3',
      sourceQuote: 'quote',
      detentionGround: true,
      notes: 'note',
      priority: 'low',
      novel: false,
    }

    const draft = __findingDraftTest.findingToDraft(finding, { priority: 'high', novel: true })

    expect(draft.original).toBe('Fire door failed to close.')
    expect(draft.detentionGround).toBe(true)
    expect(draft.priority).toBe('high')
    expect(draft.novel).toBe(true)
  })
})

