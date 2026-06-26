import { describe, expect, it } from 'vitest'
import { buildPdfSourceBrief, displayPdfTitle, discoverPdfSourcesFromPages, extractPdfLinksFromHtml, getPdfSources } from './pdfSources'
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

  it('extracts absolute and relative PDF links from a source webpage', () => {
    const links = extractPdfLinksFromHtml(`
      <a href="/rules/psc-alert.pdf">PSC Alert PDF</a>
      <a href="https://assets.example.com/forms/Form-A.PDF?download=1">Form A</a>
      <a href="../reports/annual%20detention.pdf#page=2">Annual report</a>
      <a href="/news/html-page">HTML page</a>
    `, 'https://www.eagle.org/news/psc/index.html')

    expect(links.map((item) => item.url)).toEqual([
      'https://www.eagle.org/rules/psc-alert.pdf',
      'https://assets.example.com/forms/Form-A.PDF?download=1',
      'https://www.eagle.org/news/reports/annual%20detention.pdf#page=2',
    ])
    expect(links[0].title).toBe('PSC Alert PDF')
  })

  it('discovers PDF source bookmarks from manually added webpages', async () => {
    const discovered = await discoverPdfSourcesFromPages([
      { id: 'abs-page', title: 'ABS PSC resources', url: 'https://www.eagle.org/psc', sourceType: '手動備忘', authority: 'ABS', addedAt: '2026-06-01T00:00:00.000Z', manual: true },
    ], {
      fetcher: async () => ({ ok: true, text: async () => '<a href="/content/dam/eagle/publications/psc-guide.pdf">PSC Guide</a>' }),
      fetchedAt: '2026-06-26T00:00:00.000Z',
      maxPages: 5,
    })

    expect(discovered.sources).toHaveLength(1)
    expect(discovered.sources[0]).toMatchObject({
      title: 'PSC Guide',
      url: 'https://www.eagle.org/content/dam/eagle/publications/psc-guide.pdf',
      sourceType: '在線 PDF / 自動抓取',
      authority: 'ABS',
      status: 'new',
    })
    expect(discovered.messages[0]).toContain('ABS PSC resources 找到 1 個 PDF')
  })


  it('falls back to a readable filename when collected PDF title is generic', () => {
    const item: SourceBookmark = {
      id: 'generic-pdf',
      title: 'PDF',
      url: 'https://www.eagle.org/content/dam/eagle/publications/abs-port-state-control-guide-2026.pdf?download=1',
      sourceType: '在線 PDF / 自動抓取',
      authority: 'ABS',
      addedAt: '2026-06-01T00:00:00.000Z',
      manual: false,
    }

    expect(displayPdfTitle(item)).toBe('abs port state control guide 2026')
    expect(buildPdfSourceBrief(item).title).toBe('abs port state control guide 2026')
  })

})
