import { describe, expect, it } from 'vitest'
import { buildPdfSourceBrief, getPdfSources } from './pdfSources'
import type { SourceBookmark } from '../types'

const sources: SourceBookmark[] = [
  {
    id: 'pdf-1',
    title: 'USCG detention report PDF',
    url: 'https://example.com/report.pdf',
    sourceType: 'PDF',
    authority: 'USCG',
    addedAt: '2026-06-01T00:00:00.000Z',
    manual: true,
    notes: 'Fire safety and lifeboat defects',
    status: 'downloaded',
    storageUrl: 'https://drive.example/report.pdf',
    tags: ['fire', 'lifeboat'],
  },
  {
    id: 'html-1',
    title: 'HTML source',
    url: 'https://example.com/news',
    sourceType: 'web',
    addedAt: '2026-06-01T00:00:00.000Z',
    manual: true,
  },
]

describe('pdf source utilities', () => {
  it('filters collected PDF sources and builds compact source briefs', () => {
    const pdfs = getPdfSources(sources)
    const brief = buildPdfSourceBrief(pdfs[0])

    expect(pdfs).toHaveLength(1)
    expect(brief.title).toBe('USCG detention report PDF')
    expect(brief.storageUrl).toBe('https://drive.example/report.pdf')
    expect(brief.bullets).toEqual([
      '機關/來源：USCG',
      '狀態：downloaded',
      '標籤：fire、lifeboat',
      '備註：Fire safety and lifeboat defects',
    ])
  })
})
