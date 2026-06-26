import type { Deficiency, EvidenceLevel, FindingPriority, InspectionCase, SourceAutoFetch, SourceBookmark } from '../types'

const DELETED_SOURCE_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface SourceBookmarkDraft {
  title: string
  url: string
  sourceType: string
  authority?: string
  notes?: string
  publishedAt?: string
  fetchedAt?: string
  evidenceLevel?: EvidenceLevel
  autoFetch?: SourceAutoFetch
  status?: SourceBookmark['status']
  tags?: string | string[]
  storageUrl?: string
  pdfArchivedAt?: string
}

export interface FindingDraft {
  code?: string
  category?: string
  original?: string
  observedCondition?: string
  inspectorFinding?: string
  detentionReason?: string
  requiredRectification?: string
  releaseCondition?: string
  sourcePage?: string
  sourceQuote?: string
  detentionGround?: boolean | null
  notes?: string
  priority?: FindingPriority
  novel?: boolean
}

export interface PriorityFindingRow {
  caseItem: InspectionCase
  finding: Deficiency
  index: number
}

export interface ManualCaseDraft {
  vessel: string
  imo?: string
  flag?: string
  flagEmoji?: string
  shipType?: string
  date: string
  port?: string
  region?: string
  authority?: string
  sourceUrl?: string
  sourceTitle?: string
  summary?: string
  detentionItemsText: string
}

export function updateSourceBookmark(source: SourceBookmark, draft: SourceBookmarkDraft, now = new Date().toISOString()): SourceBookmark {
  return {
    ...source,
    title: draft.title.trim() || source.title,
    url: draft.url.trim() || source.url,
    sourceType: draft.sourceType.trim() || source.sourceType,
    authority: draft.authority?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
    publishedAt: trimOrUndefined(draft.publishedAt) ?? source.publishedAt,
    fetchedAt: trimOrUndefined(draft.fetchedAt) ?? source.fetchedAt,
    evidenceLevel: draft.evidenceLevel ?? source.evidenceLevel,
    autoFetch: draft.autoFetch ?? source.autoFetch,
    status: draft.status ?? source.status,
    tags: normalizeTags(draft.tags) ?? source.tags,
    storageUrl: trimOrUndefined(draft.storageUrl) ?? source.storageUrl,
    pdfArchivedAt: trimOrUndefined(draft.pdfArchivedAt) ?? source.pdfArchivedAt,
    updatedAt: now,
  }
}

export function markSourceDeleted(source: SourceBookmark, deletedBy?: string | null, reason = '', now = new Date().toISOString()): SourceBookmark {
  return {
    ...source,
    deletedAt: now,
    deletedBy: deletedBy ?? undefined,
    deleteReason: reason.trim() || undefined,
    updatedAt: now,
  }
}

export function restoreSource(source: SourceBookmark, now = new Date().toISOString()): SourceBookmark {
  const { deletedAt: _deletedAt, deletedBy: _deletedBy, deleteReason: _deleteReason, ...rest } = source
  return { ...rest, updatedAt: now }
}

export function activeSources(sources: SourceBookmark[]) {
  return sources.filter((item) => !item.deletedAt)
}

export function deletedSources(sources: SourceBookmark[]) {
  return sources
    .filter((item) => item.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

export function purgeExpiredDeletedSources(sources: SourceBookmark[], now = new Date()) {
  const threshold = now.getTime() - DELETED_SOURCE_RETENTION_DAYS * DAY_MS
  return sources.filter((item) => {
    if (!item.deletedAt) return true
    const deletedTime = Date.parse(item.deletedAt)
    return Number.isFinite(deletedTime) && deletedTime >= threshold
  })
}

export function updateFinding(cases: InspectionCase[], caseId: string, findingIndex: number, draft: FindingDraft, now = new Date().toISOString()) {
  return cases.map((item) => {
    if (item.id !== caseId) return item
    const deficiencies = item.deficiencies.map((finding, index) => {
      if (index !== findingIndex) return finding
      return stripTranslation({
        ...finding,
        code: draft.code?.trim() || finding.code,
        original: draft.original?.trim() || finding.original,
        category: draft.category?.trim() || finding.category,
        observedCondition: trimOrUndefined(draft.observedCondition),
        inspectorFinding: trimOrUndefined(draft.inspectorFinding),
        detentionReason: trimOrUndefined(draft.detentionReason),
        requiredRectification: trimOrUndefined(draft.requiredRectification),
        releaseCondition: trimOrUndefined(draft.releaseCondition),
        sourcePage: trimOrUndefined(draft.sourcePage),
        sourceQuote: trimOrUndefined(draft.sourceQuote),
        detentionGround: draft.detentionGround ?? finding.detentionGround,
        notes: draft.notes?.trim() || undefined,
        priority: draft.priority,
        novel: Boolean(draft.novel),
        updatedAt: now,
      })
    })
    return withFindingCounts({ ...item, deficiencies })
  })
}

export function createManualInspectionCase(draft: ManualCaseDraft, now = new Date().toISOString()): InspectionCase {
  const vessel = draft.vessel.trim() || '手動案例'
  const date = draft.date.trim() || now.slice(0, 10)
  const deficiencies = parseManualDetentionItems(draft.detentionItemsText, now)
  return withFindingCounts({
    id: `manual-${slugText(vessel)}-${slugText(draft.imo || 'no-imo')}-${date}`,
    vessel,
    imo: draft.imo?.trim() || '待補',
    flag: draft.flag?.trim() || '待補',
    flagEmoji: draft.flagEmoji?.trim() || '⚓',
    shipType: draft.shipType?.trim() || 'Manual entry',
    built: null,
    gt: null,
    company: '待補',
    classSociety: '待補',
    date,
    releaseDate: null,
    port: draft.port?.trim() || '待補',
    mou: 'Other',
    region: draft.region?.trim() || '手動輸入',
    deficiencyCount: deficiencies.length,
    detentionGroundCount: deficiencies.length,
    status: 'detained',
    evidenceLevel: 'narrative',
    shortSummary: draft.summary?.trim() || `${vessel} 手動輸入滯留案例`,
    narrative: [draft.summary?.trim() || '手動輸入案例；請後續補充官方來源與細節。'],
    deficiencies,
    source: {
      authority: draft.authority?.trim() || '手動輸入',
      title: draft.sourceTitle?.trim() || '手動輸入來源',
      url: draft.sourceUrl?.trim() || '#manual-entry',
      publishedAt: date,
      sourceType: 'manual',
    },
    evidenceNote: '手動輸入案例：需後續用官方 Form A/B、PDF 或港口國公告核對。',
    fetchedAt: now,
  })
}

export function appendManualFindingToCase(cases: InspectionCase[], caseId: string, draft: FindingDraft, now = new Date().toISOString()) {
  return cases.map((item) => {
    if (item.id !== caseId) return item
    const deficiencies = [...item.deficiencies, buildManualFinding(draft, now)]
    return withFindingCounts({
      ...item,
      deficiencies,
      status: 'detained',
      evidenceLevel: item.evidenceLevel === 'index-only' ? 'narrative' : item.evidenceLevel,
      updatedAt: now,
    } as InspectionCase & { updatedAt?: string })
  })
}

function withFindingCounts<T extends InspectionCase>(item: T): T {
  return {
    ...item,
    deficiencyCount: item.deficiencies.length,
    detentionGroundCount: item.deficiencies.filter((entry) => entry.detentionGround === true).length,
  }
}

function parseManualDetentionItems(text: string, now: string): Deficiency[] {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const parsed = rows.map((line) => {
    const parts = line.split('|').map((part) => part.trim())
    if (parts.length >= 3) return buildManualFinding({ code: parts[0], category: parts[1], original: parts.slice(2).join(' | ') }, now)
    return buildManualFinding({ original: line }, now)
  })
  return parsed.length ? parsed : [buildManualFinding({ original: '待補手動滯留內容' }, now)]
}

function buildManualFinding(draft: FindingDraft, now: string): Deficiency {
  const original = draft.original?.trim() || '待補手動滯留內容'
  return stripTranslation({
    code: draft.code?.trim() || 'MANUAL',
    category: draft.category?.trim() || inferCategory(original),
    original,
    observedCondition: trimOrUndefined(draft.observedCondition),
    inspectorFinding: trimOrUndefined(draft.inspectorFinding),
    detentionReason: trimOrUndefined(draft.detentionReason),
    requiredRectification: trimOrUndefined(draft.requiredRectification),
    releaseCondition: trimOrUndefined(draft.releaseCondition),
    sourcePage: trimOrUndefined(draft.sourcePage),
    sourceQuote: trimOrUndefined(draft.sourceQuote),
    detentionGround: draft.detentionGround ?? true,
    notes: trimOrUndefined(draft.notes),
    priority: draft.priority ?? inferPriority(original),
    novel: Boolean(draft.novel),
    updatedAt: now,
  })
}

function slugText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'manual'
}

export function stripDeficiencyTranslations(cases: InspectionCase[]): InspectionCase[] {
  return cases.map((item) => ({
    ...item,
    deficiencies: item.deficiencies.map((finding) => stripTranslation(finding)),
  }))
}

export function pdfCandidateToDeficiencyDraft(original: string, sourceUrl: string, page?: number): FindingDraft {
  const text = original.trim()
  return {
    code: 'PDF-TBD',
    category: inferCategory(text),
    original: text,
    sourcePage: page ? `p. ${page}` : undefined,
    sourceQuote: `${sourceUrl} | ${text}`,
    detentionGround: null,
    priority: inferPriority(text),
    novel: false,
  }
}

export function getPriorityNovelFindings(cases: InspectionCase[], minPriority: FindingPriority = 'medium'): PriorityFindingRow[] {
  const minRank = priorityRank(minPriority)
  return cases.flatMap((caseItem) => caseItem.deficiencies.map((finding, index) => ({ caseItem, finding, index })))
    .filter(({ finding }) => Boolean(finding.novel) || priorityRank(finding.priority) >= minRank)
    .sort((a, b) => priorityRank(b.finding.priority) - priorityRank(a.finding.priority)
      || Number(Boolean(b.finding.novel)) - Number(Boolean(a.finding.novel))
      || b.caseItem.date.localeCompare(a.caseItem.date))
}

export function priorityLabel(priority?: FindingPriority) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function priorityRank(priority?: FindingPriority) {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  if (priority === 'low') return 1
  return 0
}

function trimOrUndefined(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function normalizeTags(value?: string | string[]) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return undefined
}

function stripTranslation(finding: Deficiency): Deficiency {
  const legacy = finding as Deficiency & { translation?: unknown }
  const { translation: _translation, ...rest } = legacy
  return rest
}

function inferPriority(text: string): FindingPriority {
  const lower = text.toLocaleLowerCase()
  if (/not working|inoperative|failed|unable|could not|expired|missing/.test(lower)) return 'medium'
  return 'low'
}

function inferCategory(text: string) {
  const lower = text.toLocaleLowerCase()
  if (/fire|co2|damper|detector|alarm|pump/.test(lower)) return '消防安全'
  if (/lifeboat|rescue boat|liferaft|lifejacket/.test(lower)) return '救生設備'
  if (/ism|sms|safety management/.test(lower)) return 'ISM／安全管理'
  if (/chart|ecdis|bnwas|vdr|navigation|voyage|passage/.test(lower)) return '航行安全'
  if (/oil|sewage|ballast|pollution|marpol/.test(lower)) return '防污染'
  if (/certificate|document/.test(lower)) return '證書／文件'
  if (/crew|wage|rest|mlc|accommodation/.test(lower)) return 'MLC／船員權益'
  if (/engine|generator|steering|machinery/.test(lower)) return '主輔機／機艙'
  return '操作／設備滯留'
}
