import type { Deficiency, FindingPriority, InspectionCase, SourceBookmark } from '../types'

const DELETED_SOURCE_RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export interface SourceBookmarkDraft {
  title: string
  url: string
  sourceType: string
  authority?: string
  notes?: string
}

export interface FindingDraft {
  category?: string
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
      return {
        ...finding,
        category: draft.category?.trim() || finding.category,
        notes: draft.notes?.trim() || undefined,
        priority: draft.priority,
        novel: Boolean(draft.novel),
        updatedAt: now,
      }
    })
    return {
      ...item,
      deficiencies,
      deficiencyCount: deficiencies.length,
      detentionGroundCount: deficiencies.filter((entry) => entry.detentionGround === true).length,
    }
  })
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
