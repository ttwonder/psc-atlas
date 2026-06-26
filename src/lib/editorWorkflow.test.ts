import { describe, expect, it } from 'vitest'
import type { InspectionCase, SourceBookmark } from '../types'
import { activeSources, deletedSources, purgeExpiredDeletedSources, markSourceDeleted, updateSourceBookmark, updateFinding, getPriorityNovelFindings } from './editorWorkflow'

const source: SourceBookmark = {
  id: 's1',
  title: 'Old title',
  url: 'https://example.com/report.pdf',
  sourceType: '手動備忘',
  addedAt: '2026-01-10T00:00:00.000Z',
  manual: true,
  notes: 'old note',
}

const caseItem: InspectionCase = {
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
  deficiencyCount: 2,
  detentionGroundCount: 2,
  status: 'detained',
  evidenceLevel: 'narrative',
  shortSummary: 'summary',
  narrative: ['narrative'],
  source: { authority: 'Authority', title: 'Report', url: 'https://example.com', publishedAt: '2026-05-02', sourceType: 'PDF' },
  evidenceNote: 'note',
  deficiencies: [
    { code: '07105', category: '消防安全', original: 'Fire door failed to close.', translation: '防火門不能關閉', detentionGround: true },
    { code: '10111', category: 'ISM／安全管理', original: 'SMS failed to ensure maintenance.', translation: 'SMS 未確保維護', detentionGround: true },
  ],
}

describe('editor workflow helpers', () => {
  it('updates source fields without losing URL identity', () => {
    const updated = updateSourceBookmark(source, {
      title: 'New title',
      url: 'https://example.com/new-report.pdf',
      sourceType: 'PDF',
      authority: 'Paris MoU',
      notes: 'follow page 3',
    }, '2026-02-01T00:00:00.000Z')

    expect(updated.title).toBe('New title')
    expect(updated.url).toBe('https://example.com/new-report.pdf')
    expect(updated.authority).toBe('Paris MoU')
    expect(updated.notes).toBe('follow page 3')
    expect(updated.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('soft deletes sources and purges only after 30 days', () => {
    const deleted = markSourceDeleted(source, 'user@example.com', 'duplicate', '2026-02-01T00:00:00.000Z')
    expect(activeSources([source, deleted])).toHaveLength(1)
    expect(deletedSources([source, deleted])).toHaveLength(1)
    expect(purgeExpiredDeletedSources([deleted], new Date('2026-03-01T00:00:00.000Z'))).toHaveLength(1)
    expect(purgeExpiredDeletedSources([deleted], new Date('2026-03-05T00:00:00.000Z'))).toHaveLength(0)
  })

  it('updates finding metadata while preserving original wording', () => {
    const updatedCases = updateFinding([caseItem], 'case-1', 0, {
      category: '消防安全',
      notes: 'Company should test fire doors before PSC.',
      priority: 'high',
      novel: true,
    }, '2026-02-01T00:00:00.000Z')
    const finding = updatedCases[0].deficiencies[0]
    expect(finding.original).toBe('Fire door failed to close.')
    expect(finding.translation).toBe('防火門不能關閉')
    expect(finding.notes).toBe('Company should test fire doors before PSC.')
    expect(finding.priority).toBe('high')
    expect(finding.novel).toBe(true)
  })

  it('returns medium/high or novel findings for focus board', () => {
    const updatedCases = updateFinding([caseItem], 'case-1', 1, { priority: 'medium', novel: false }, '2026-02-01T00:00:00.000Z')
    const rows = getPriorityNovelFindings(updatedCases)
    expect(rows.map((row) => row.finding.original)).toEqual(['SMS failed to ensure maintenance.'])
  })
})
