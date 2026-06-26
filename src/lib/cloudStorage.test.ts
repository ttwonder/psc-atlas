import { describe, expect, it } from 'vitest'
import type { InspectionCase, SourceBookmark } from '../types'
import { canAddSources, canEditDataset, canEditSources, describeCloudError, fromCloudCaseRow, fromCloudSourceRow, toCloudCaseRow, toCloudSourceRow, type EditorProfile } from './cloudStorage'

const sampleCase: InspectionCase = {
  id: 'case-1',
  vessel: 'TEST VESSEL',
  imo: '1234567',
  flag: 'Panama',
  flagEmoji: '🇵🇦',
  shipType: 'Bulk carrier',
  built: 2010,
  gt: 12345,
  company: 'Test Co',
  classSociety: 'Class',
  date: '2025-01-02',
  releaseDate: null,
  port: 'Test Port',
  mou: 'Tokyo MoU',
  region: 'China / Tokyo MoU',
  deficiencyCount: 1,
  detentionGroundCount: 1,
  status: 'detained',
  evidenceLevel: 'narrative',
  shortSummary: 'One concrete detention defect',
  narrative: ['Narrative'],
  deficiencies: [{
    code: '07115',
    category: '消防安全',
    original: 'The fire damper could not be closed.',
    detentionGround: true,
  }],
  source: {
    authority: 'Test Authority',
    title: 'Test source',
    url: 'https://example.com/source',
    publishedAt: '2025-01-03',
    sourceType: 'narrative',
  },
  evidenceNote: 'Boundary note',
}

const sampleSource: SourceBookmark = {
  id: 'source-1',
  title: 'Manual source',
  url: 'https://example.com/manual',
  sourceType: '手動備忘',
  addedAt: '2026-01-01T00:00:00.000Z',
  manual: true,
  notes: 'Check later',
}

describe('cloud storage row mapping', () => {
  it('keeps the full inspection case payload while extracting query columns', () => {
    const row = toCloudCaseRow(sampleCase)

    expect(row.id).toBe('case-1')
    expect(row.vessel).toBe('TEST VESSEL')
    expect(row.imo).toBe('1234567')
    expect(row.region).toBe('China / Tokyo MoU')
    expect(row.inspection_date).toBe('2025-01-02')
    expect(row.deficiency_count).toBe(1)
    expect(row.payload).toEqual(sampleCase)
    expect(fromCloudCaseRow(row)).toEqual(sampleCase)
  })

  it('keeps the full source bookmark payload while extracting URL/title columns', () => {
    const row = toCloudSourceRow(sampleSource)

    expect(row.id).toBe('source-1')
    expect(row.url).toBe('https://example.com/manual')
    expect(row.title).toBe('Manual source')
    expect(row.manual).toBe(true)
    expect(row.added_at).toBe('2026-01-01T00:00:00.000Z')
    expect(row.payload).toEqual(sampleSource)
    expect(fromCloudSourceRow(row)).toEqual(sampleSource)
  })

  it('normalizes year-month source dates before sending rows to Supabase', () => {
    const row = toCloudSourceRow({ ...sampleSource, addedAt: '2025-11' })

    expect(row.added_at).toBe('2025-11-01T00:00:00.000Z')
    expect(row.payload.addedAt).toBe('2025-11')
  })

  it('turns Supabase error objects into readable messages', () => {
    expect(describeCloudError({ message: 'duplicate key value violates unique constraint', code: '23505', details: 'url already exists' })).toContain('duplicate key value')
    expect(describeCloudError({ error_description: 'Invalid path specified in request URL' })).toBe('Invalid path specified in request URL')
  })

  it('allows source operators to edit sources while reserving finding edits for dataset editors', () => {
    const sourceEditor: EditorProfile = { email: 'source@example.com', role: 'source_editor', active: true, can_add_sources: true, can_sync_dataset: false, can_refresh: false }
    const operator: EditorProfile = { email: 'editor@example.com', role: 'editor', active: true, can_add_sources: true, can_sync_dataset: true, can_refresh: false }

    expect(canAddSources(sourceEditor)).toBe(true)
    expect(canEditSources(sourceEditor)).toBe(true)
    expect(canEditDataset(sourceEditor)).toBe(false)
    expect(canEditSources(operator)).toBe(true)
    expect(canEditDataset(operator)).toBe(true)
    expect(canAddSources(null)).toBe(false)
  })

})
