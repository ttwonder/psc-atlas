import { describe, expect, it } from 'vitest'
import type { InspectionCase, SourceBookmark } from '../types'
import { activeSources, appendManualFindingToCase, createManualInspectionCase, deletedSources, purgeExpiredDeletedSources, markSourceDeleted, updateSourceBookmark, updateFinding, getPriorityNovelFindings, stripDeficiencyTranslations, pdfCandidateToDeficiencyDraft } from './editorWorkflow'

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
    { code: '07105', category: '消防安全', original: 'Fire door failed to close.', detentionGround: true },
    { code: '10111', category: 'ISM／安全管理', original: 'SMS failed to ensure maintenance.', detentionGround: true },
  ],
}

describe('editor workflow helpers', () => {
  it('updates complete source fields without losing URL identity', () => {
    const updated = updateSourceBookmark(source, {
      title: 'New title',
      url: 'https://example.com/new-report.pdf',
      sourceType: 'PDF',
      authority: 'Paris MoU',
      notes: 'follow page 3',
      publishedAt: '2026-01-20',
      fetchedAt: '2026-02-01T00:00:00.000Z',
      evidenceLevel: 'full-dossier',
      autoFetch: 'partial',
      status: 'analysis-ready',
      tags: 'pdf,uscg,fire',
      storageUrl: 'webdav://psc/report.pdf',
    }, '2026-02-01T00:00:00.000Z')

    expect(updated.title).toBe('New title')
    expect(updated.url).toBe('https://example.com/new-report.pdf')
    expect(updated.authority).toBe('Paris MoU')
    expect(updated.notes).toBe('follow page 3')
    expect(updated.publishedAt).toBe('2026-01-20')
    expect(updated.fetchedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(updated.evidenceLevel).toBe('full-dossier')
    expect(updated.autoFetch).toBe('partial')
    expect(updated.status).toBe('analysis-ready')
    expect(updated.tags).toEqual(['pdf', 'uscg', 'fire'])
    expect(updated.storageUrl).toBe('webdav://psc/report.pdf')
    expect(updated.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  })

  it('soft deletes sources and purges only after 30 days', () => {
    const deleted = markSourceDeleted(source, 'user@example.com', 'duplicate', '2026-02-01T00:00:00.000Z')
    expect(activeSources([source, deleted])).toHaveLength(1)
    expect(deletedSources([source, deleted])).toHaveLength(1)
    expect(purgeExpiredDeletedSources([deleted], new Date('2026-03-01T00:00:00.000Z'))).toHaveLength(1)
    expect(purgeExpiredDeletedSources([deleted], new Date('2026-03-05T00:00:00.000Z'))).toHaveLength(0)
  })

  it('updates editable finding fields while tracking operator metadata', () => {
    const updatedCases = updateFinding([caseItem], 'case-1', 0, {
      code: '07106',
      original: 'Corrected original wording from Form B.',
      category: '消防安全',
      observedCondition: 'fire door test failed',
      inspectorFinding: 'PSCO observed the fire door could not close',
      detentionReason: 'Repeated fire boundary failure',
      requiredRectification: 'Repair and test all fire doors',
      releaseCondition: 'Verified operational test',
      sourcePage: 'p. 3',
      sourceQuote: 'Form B quote',
      detentionGround: true,
      notes: 'Company should test fire doors before PSC.',
      priority: 'high',
      novel: true,
    }, '2026-02-01T00:00:00.000Z')
    const finding = updatedCases[0].deficiencies[0]
    expect(finding.code).toBe('07106')
    expect(finding.original).toBe('Corrected original wording from Form B.')
    expect(finding.inspectorFinding).toContain('PSCO observed')
    expect(finding.sourcePage).toBe('p. 3')
    expect(finding.detentionGround).toBe(true)
    expect(finding.notes).toBe('Company should test fire doors before PSC.')
    expect(finding.priority).toBe('high')
    expect(finding.novel).toBe(true)
  })



  it('creates a manual case with multiple detention items from pasted lines', () => {
    const created = createManualInspectionCase({
      vessel: 'MANUAL VESSEL',
      imo: '7654321',
      flag: 'Panama',
      flagEmoji: '🇵🇦',
      shipType: 'Bulk carrier',
      date: '2026-06-01',
      port: 'Kaohsiung',
      region: 'Taiwan / PSC',
      authority: 'Manual PSC entry',
      sourceUrl: 'https://example.com/manual',
      sourceTitle: 'Manual case source',
      summary: 'Manual detention case',
      detentionItemsText: '07105 | 消防安全 | Fire door failed to close.\n10111 | ISM／安全管理 | SMS did not ensure maintenance.',
    }, '2026-06-02T00:00:00.000Z')

    expect(created.id).toBe('manual-manual-vessel-7654321-2026-06-01')
    expect(created.deficiencies).toHaveLength(2)
    expect(created.deficiencyCount).toBe(2)
    expect(created.detentionGroundCount).toBe(2)
    expect(created.deficiencies[0]).toMatchObject({ code: '07105', category: '消防安全', original: 'Fire door failed to close.', detentionGround: true })
    expect(created.source.authority).toBe('Manual PSC entry')
  })

  it('appends a manual detention item to an existing case without replacing old items', () => {
    const updated = appendManualFindingToCase([caseItem], 'case-1', {
      code: '14104',
      category: '防污染',
      original: 'Oil filtering equipment alarm failed during test.',
      notes: 'Manual follow-up item',
      priority: 'medium',
      novel: true,
    }, '2026-06-02T00:00:00.000Z')

    expect(updated[0].deficiencies).toHaveLength(3)
    expect(updated[0].deficiencies[2]).toMatchObject({ code: '14104', category: '防污染', detentionGround: true, priority: 'medium', novel: true })
    expect(updated[0].deficiencies[0].original).toBe('Fire door failed to close.')
    expect(updated[0].detentionGroundCount).toBe(3)
  })

  it('strips legacy translation values from loaded cases', () => {
    const legacy = [{ ...caseItem, deficiencies: [{ ...caseItem.deficiencies[0], translation: 'legacy text' } as typeof caseItem.deficiencies[number] & { translation: string }] }]
    const sanitized = stripDeficiencyTranslations(legacy)
    expect('translation' in sanitized[0].deficiencies[0]).toBe(false)
  })

  it('turns PDF candidate text into an importable deficiency draft', () => {
    const draft = pdfCandidateToDeficiencyDraft('The emergency fire pump failed to start during test.', 'https://example.com/report.pdf', 4)
    expect(draft.original).toContain('emergency fire pump')
    expect(draft.category).toBe('消防安全')
    expect(draft.sourcePage).toBe('p. 4')
    expect(draft.sourceQuote).toContain('https://example.com/report.pdf')
  })

  it('returns medium/high or novel findings for focus board', () => {
    const updatedCases = updateFinding([caseItem], 'case-1', 1, { priority: 'medium', novel: false }, '2026-02-01T00:00:00.000Z')
    const rows = getPriorityNovelFindings(updatedCases)
    expect(rows.map((row) => row.finding.original)).toEqual(['SMS failed to ensure maintenance.'])
  })
})
