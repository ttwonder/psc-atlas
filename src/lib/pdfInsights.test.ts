import { describe, expect, it } from 'vitest'
import { buildPdfInsights } from './pdfInsights'

describe('pdf insights', () => {
  it('extracts likely deficiency sentences and keyword trends from PSC PDF text', () => {
    const text = `
      The fire door failed to close properly during the operational test.
      Emergency generator could not start automatically during blackout test.
      Certificates were checked and found in order.
      The lifeboat engine failed to start and crew were not familiar with launching procedures.
    `

    const insights = buildPdfInsights(text)

    expect(insights.deficiencyCandidates).toEqual([
      'The fire door failed to close properly during the operational test.',
      'Emergency generator could not start automatically during blackout test.',
      'The lifeboat engine failed to start and crew were not familiar with launching procedures.',
    ])
    expect(insights.keywordTrends.map((item) => item.keyword)).toContain('fire door')
    expect(insights.keywordTrends.map((item) => item.keyword)).toContain('emergency generator')
    expect(insights.keywordTrends.map((item) => item.keyword)).toContain('lifeboat')
  })
})
