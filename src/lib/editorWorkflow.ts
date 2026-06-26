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
    return {
      ...item,
      deficiencies,
      deficiencyCount: deficiencies.length,
      detentionGroundCount: deficiencies.filter((entry) => entry.detentionGround === true).length,
    }
  })
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
  return '操作／設備缺陷'
}
