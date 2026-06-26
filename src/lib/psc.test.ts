import { describe, expect, it } from 'vitest'
import type { InspectionCase, SourceBookmark } from '../types'
import { mergeCases, mergeSources } from './storage'
import { parseMcaDetentionHtml } from './govUkMca'
import { calculateTrendSummary, filterCasesByRangeAndRegion } from './trends'
import { buildRegionalReport } from './report'
import { officialSourceMap, sourceCoverageSummary, autoFetchSummary } from '../data/sourceMap'
import { parseParisCurrentDetentionsHtml } from './officialRefresh'

const sampleCase = (id: string, date: string, region = 'UK / Paris MoU', category = '消防安全'): InspectionCase => ({
  id,
  vessel: id.toUpperCase(),
  imo: '1234567',
  flag: 'Panama',
  flagEmoji: '🇵🇦',
  shipType: 'Bulk Carrier',
  built: null,
  gt: 10000,
  company: 'Demo Company',
  classSociety: 'Demo Class',
  date,
  releaseDate: null,
  port: 'London',
  mou: 'Paris MoU',
  region,
  deficiencyCount: 2,
  detentionGroundCount: 1,
  status: 'detained',
  evidenceLevel: 'official-summary',
  shortSummary: '消防設備不可用並構成滯留依據。',
  narrative: ['官方摘要案例。'],
  source: { authority: 'UK Maritime and Coastguard Agency', title: 'Demo', url: `https://example.test/${id}`, publishedAt: date, sourceType: '官方月度滯留報告' },
  evidenceNote: 'test',
  fetchedAt: '2026-06-22T00:00:00.000Z',
  deficiencies: [
    { code: '07105', category, original: 'Fire detection system not as required.', detentionGround: true },
    { code: '10111', category: '救生設備', original: 'Lifeboat equipment not as required.', detentionGround: false },
  ],
})

describe('storage merge', () => {
  it('keeps old cases and updates duplicate cases by id', () => {
    const oldCase = sampleCase('case-a', '2024-05-01')
    const newCase = { ...sampleCase('case-a', '2024-05-01'), deficiencyCount: 9 }
    const another = sampleCase('case-b', '2024-06-01')
    const merged = mergeCases([oldCase], [newCase, another])
    expect(merged).toHaveLength(2)
    expect(merged.find((item) => item.id === 'case-a')?.deficiencyCount).toBe(9)
    expect(merged.find((item) => item.id === 'case-b')?.deficiencyCount).toBe(2)
  })

  it('merges duplicate cases by natural key and keeps richer dossier narrative', () => {
    const rich = { ...sampleCase('seed-rich', '2024-05-01'), vessel: 'SAME VESSEL', evidenceLevel: 'narrative' as const, shortSummary: '完整敘事摘要', narrative: ['完整事件經過', '解除滯留條件'] }
    const coarse = { ...sampleCase('live-coarse', '2024-05-01'), vessel: 'SAME VESSEL', evidenceLevel: 'official-summary' as const, shortSummary: '粗摘要', narrative: ['官方月報摘要'], releaseDate: '2024-05-09', status: 'released' as const }
    const merged = mergeCases([rich], [coarse])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('seed-rich')
    expect(merged[0].shortSummary).toBe('完整敘事摘要')
    expect(merged[0].releaseDate).toBe('2024-05-09')
    expect(merged[0].evidenceLevel).toBe('narrative')
  })

  it('deduplicates source bookmark urls without deleting manual notes', () => {
    const existing: SourceBookmark[] = [{ id: '1', title: 'Manual', url: 'https://a.test', sourceType: '手動備忘', addedAt: '2024-01-01', manual: true }]
    const incoming: SourceBookmark[] = [{ id: '2', title: 'Same', url: 'https://a.test', sourceType: '採集來源', addedAt: '2024-02-01', manual: false }]
    expect(mergeSources(existing, incoming)).toHaveLength(1)
    expect(mergeSources(existing, incoming)[0].manual).toBe(true)
  })
})

describe('UK MCA parser', () => {
  it('extracts vessel, detention grounds and release status from GOV.UK html body', () => {
    const html = `<p>During May, there were four new detentions.</p><h2>SHIPS DETAINED IN MAY 2024</h2>
    <p>Vessel Name: TEST SHIP</p><p>GT: 33044</p><p>IMO: 9491197</p><p>Flag: Turkey (white list)</p>
    <p>Company: Demo Manager</p><p>Classification society: Bureau Veritas</p>
    <p>Date and place of detention: 05 May 2024 at London</p>
    <p>Summary: thirty-three deficiencies with two grounds for detention</p>
    <table><tbody><tr><td>Defective item</td><td>Nature of defect</td><td>Ground for Detention</td></tr>
    <tr><td>07106– Fire detection and alarm system</td><td>Not as required</td><td>Yes</td></tr>
    <tr><td>15150-ISM</td><td>Not as required</td><td>Yes</td></tr></tbody></table>
    <p>This vessel was released 11 May 2024</p>`
    const cases = parseMcaDetentionHtml(html, {
      url: 'https://www.gov.uk/government/news/demo',
      title: 'Foreign flagged ships detained in the UK during May 2024 under Paris MOU',
      publishedAt: '2024-07-11',
      fetchedAt: '2026-06-22T00:00:00.000Z',
    })
    expect(cases).toHaveLength(1)
    expect(cases[0].vessel).toBe('TEST SHIP')
    expect(cases[0].imo).toBe('9491197')
    expect(cases[0].releaseDate).toBe('2024-05-11')
    expect(cases[0].deficiencies.map((item) => item.category)).toEqual(['消防安全', 'ISM／安全管理'])
  })
})

describe('trend and report', () => {
  it('filters by rolling range and region', () => {
    const cases = [sampleCase('recent', '2026-05-01'), sampleCase('old', '2025-01-01'), sampleCase('asia', '2026-04-01', 'Tokyo MoU / Asia-Pacific')]
    expect(filterCasesByRangeAndRegion(cases, '3m', 'UK / Paris MoU', new Date('2026-06-22')).map((item) => item.id)).toEqual(['recent'])
  })

  it('summarizes top categories and regional report checklists', () => {
    const cases = [sampleCase('fire', '2026-05-01'), sampleCase('ism', '2026-05-10', 'UK / Paris MoU', 'ISM／安全管理')]
    const trend = calculateTrendSummary(cases, '1y', 'UK / Paris MoU', new Date('2026-06-22'))
    expect(trend.topCategories[0].count).toBe(1)
    const report = buildRegionalReport(cases, 'UK / Paris MoU', '1y', new Date('2026-06-22'))
    expect(report).toContain('船舶督導自查清單')
    expect(report).toContain('典型扣船案例')
  })
})

describe('official refresh parsers', () => {
  it('turns Paris MoU current detention rows into index-only boundary cases', () => {
    const html = `<table><tr><th>Vessel</th><th>IMO</th><th>Country</th><th>Port</th><th>Date</th></tr><tr><td>SEA DEMO</td><td>9123456</td><td>Croatia</td><td>Zadar</td><td>2026-06-19</td></tr></table>`
    const cases = parseParisCurrentDetentionsHtml(html, '2026-06-23T00:00:00.000Z')
    expect(cases).toHaveLength(1)
    expect(cases[0].evidenceLevel).toBe('index-only')
    expect(cases[0].deficiencies[0].original).toContain('具體缺陷未公開')
  })
})

describe('official PSC source map', () => {
  it('distinguishes detailed case-study sources from recent index sources', () => {
    expect(officialSourceMap.map((item) => item.region)).toEqual(expect.arrayContaining(['Paris MoU', 'UK / Paris MoU', 'Tokyo MoU / Asia-Pacific', 'USCG / United States']))
    expect(officialSourceMap.find((item) => item.id === 'paris-caught-in-the-net')?.bestUse).toContain('深度案例')
    expect(officialSourceMap.find((item) => item.id === 'tokyo-apcis')?.evidenceLevel).toBe('index-only')
    expect(officialSourceMap.find((item) => item.id === 'uk-mca-monthly-detentions')?.autoFetch).toBe('enabled')
    expect(sourceCoverageSummary(officialSourceMap)).toContain('full-dossier')
    expect(sourceCoverageSummary(officialSourceMap)).toContain('official-summary')
    expect(autoFetchSummary(officialSourceMap)).toContain('enabled')
  })
})
