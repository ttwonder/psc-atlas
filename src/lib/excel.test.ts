import { describe, expect, it } from 'vitest'
import type { InspectionCase, SourceBookmark } from '../types'
import { buildSpreadsheetXml, exportWorkbookSheetsForTest } from './excel'

const sampleCase: InspectionCase = {
  id: 'case-1',
  vessel: 'TEST VESSEL',
  imo: '1234567',
  flag: 'Panama',
  flagEmoji: '⚓',
  shipType: 'Bulk carrier',
  built: null,
  gt: null,
  company: 'Owner',
  classSociety: 'Class',
  date: '2026-05-01',
  releaseDate: null,
  port: 'Test Port',
  mou: 'Other',
  region: 'Global',
  deficiencyCount: 1,
  detentionGroundCount: 1,
  status: 'detained',
  evidenceLevel: 'narrative',
  shortSummary: 'summary',
  narrative: ['narrative'],
  source: { authority: 'Authority', title: 'Report', url: 'https://example.com', publishedAt: '2026-05-02', sourceType: 'PDF' },
  evidenceNote: 'note',
  deficiencies: [
    { code: '07105', category: '消防安全', original: 'Fire door failed to close.', detentionGround: true, notes: 'test note', priority: 'high', novel: true },
  ],
}

const sampleSource: SourceBookmark = {
  id: 's1',
  title: 'PDF source',
  url: 'https://example.com/report.pdf',
  sourceType: 'PDF',
  addedAt: '2026-01-01T00:00:00.000Z',
  manual: true,
  notes: 'note',
}

describe('excel export sheets', () => {
  it('exports original deficiency wording and operator metadata without translation columns', () => {
    const sheets = exportWorkbookSheetsForTest([sampleCase], [sampleSource], [])
    const xml = buildSpreadsheetXml(sheets)

    expect(xml).toContain('官方原文')
    expect(xml).toContain('操作備註')
    expect(xml).toContain('關注度')
    expect(xml).toContain('是否新穎')
    expect(xml).toContain('Fire door failed to close.')
    expect(xml).not.toContain('中文整理')
    expect(xml).not.toContain('不應匯出')
  })
})
