import type { InspectionCase, OfficialSourceGuide, SourceBookmark } from '../types'
import { purgeExpiredDeletedSources, stripDeficiencyTranslations } from './editorWorkflow'

const CASES_KEY = 'psc-atlas:cumulative-cases:v10-china-1321-detention-only-no-fpmc'
const SOURCES_KEY = 'psc-atlas:source-bookmarks:v10-china-1321-detention-only-no-fpmc'

export function mergeCases(existing: InspectionCase[], incoming: InspectionCase[]) {
  const byKey = new Map<string, InspectionCase>()
  for (const item of existing.map(normalizeCaseWording)) byKey.set(caseKey(item), item)
  for (const item of incoming.map(normalizeCaseWording)) {
    const key = caseKey(item)
    const current = byKey.get(key)
    if (!current) byKey.set(key, item)
    else byKey.set(key, mergeCaseRecord(current, item))
  }
  return Array.from(byKey.values()).sort((a, b) => b.date.localeCompare(a.date) || a.vessel.localeCompare(b.vessel))
}

export function sourceFromCase(item: InspectionCase): SourceBookmark {
  return {
    id: `case-source-${slugify(item.source.url)}`,
    title: item.source.title,
    url: item.source.url,
    sourceType: item.source.sourceType,
    authority: item.source.authority,
    addedAt: item.fetchedAt ?? item.source.publishedAt,
    manual: false,
    notes: `${item.vessel} / IMO ${item.imo}`,
  }
}

export function sourceFromGuide(item: OfficialSourceGuide): SourceBookmark {
  return {
    id: `guide-source-${slugify(item.url)}`,
    title: item.title,
    url: item.url,
    sourceType: `來源地圖 / ${item.evidenceLevel}`,
    authority: item.authority,
    addedAt: new Date().toISOString(),
    manual: false,
    notes: `${item.region}｜${item.updateCadence}｜自動抓取：${item.autoFetch}｜${item.refreshScope}`,
  }
}

export function mergeSources(existing: SourceBookmark[], incoming: SourceBookmark[]) {
  const byUrl = new Map<string, SourceBookmark>()
  for (const item of existing.map(normalizeSourceWording)) byUrl.set(normalizeUrl(item.url), item)
  for (const item of incoming.map(normalizeSourceWording)) {
    const key = normalizeUrl(item.url)
    const current = byUrl.get(key)
    if (!current) byUrl.set(key, item)
    else byUrl.set(key, current.deletedAt ? current : current.manual ? { ...item, ...current } : { ...current, ...item })
  }
  return purgeExpiredDeletedSources(Array.from(byUrl.values())).sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

export function loadStoredCases(fallback: InspectionCase[]) {
  const sortedFallback = mergeCases([], stripDeficiencyTranslations(fallback))
  if (typeof localStorage === 'undefined') return sortedFallback
  try {
    const raw = localStorage.getItem(CASES_KEY)
    if (!raw) return sortedFallback
    return mergeCases(sortedFallback, stripDeficiencyTranslations(JSON.parse(raw) as InspectionCase[]))
  } catch {
    return sortedFallback
  }
}

export function saveStoredCases(cases: InspectionCase[]) {
  localStorage.setItem(CASES_KEY, JSON.stringify(cases))
}

export function loadStoredSources(fallbackCases: InspectionCase[], sourceGuides: OfficialSourceGuide[] = []) {
  const fallback = mergeSources(fallbackCases.map(sourceFromCase), sourceGuides.map(sourceFromGuide))
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (!raw) return fallback
    return mergeSources(fallback, JSON.parse(raw) as SourceBookmark[])
  } catch {
    return fallback
  }
}

export function saveStoredSources(sources: SourceBookmark[]) {
  localStorage.setItem(SOURCES_KEY, JSON.stringify(sources))
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/$/, '')
}

function caseKey(item: InspectionCase) {
  if (item.id.startsWith('apcis-')) return item.id
  return `${item.imo || slugify(item.vessel)}|${item.date}|${slugify(item.vessel)}`
}

function mergeCaseRecord(current: InspectionCase, incoming: InspectionCase): InspectionCase {
  const currentIsRicher = richnessScore(current) >= richnessScore(incoming)
  const base = { ...current, ...incoming, id: current.id }
  return {
    ...base,
    shortSummary: currentIsRicher ? current.shortSummary : incoming.shortSummary,
    narrative: currentIsRicher ? current.narrative : incoming.narrative,
    deficiencies: mergeDeficiencies(current.deficiencies, incoming.deficiencies),
    evidenceLevel: currentIsRicher ? current.evidenceLevel : incoming.evidenceLevel,
    evidenceNote: currentIsRicher ? current.evidenceNote : incoming.evidenceNote,
    flagEmoji: current.flagEmoji !== '⚓' ? current.flagEmoji : incoming.flagEmoji,
  }
}

function mergeDeficiencies<T extends { code: string; original: string }>(existing: T[], incoming: T[]) {
  const byKey = new Map<string, T>()
  for (const item of existing) byKey.set(`${item.code}|${item.original}`, item)
  for (const item of incoming) byKey.set(`${item.code}|${item.original}`, item)
  return Array.from(byKey.values())
}

function normalizeChineseWording(value: string) {
  return value.replace(/缺陷/g, '滯留').replace(/缺失/g, '滯留')
}

function normalizeCaseWording(item: InspectionCase): InspectionCase {
  return {
    ...item,
    vessel: normalizeChineseWording(item.vessel),
    flag: normalizeChineseWording(item.flag),
    shipType: normalizeChineseWording(item.shipType),
    company: normalizeChineseWording(item.company),
    classSociety: normalizeChineseWording(item.classSociety),
    port: normalizeChineseWording(item.port),
    region: normalizeChineseWording(item.region),
    shortSummary: normalizeChineseWording(item.shortSummary),
    narrative: item.narrative.map(normalizeChineseWording),
    evidenceNote: normalizeChineseWording(item.evidenceNote),
    source: {
      ...item.source,
      authority: normalizeChineseWording(item.source.authority),
      title: normalizeChineseWording(item.source.title),
      sourceType: normalizeChineseWording(item.source.sourceType),
    },
    deficiencies: item.deficiencies.map((entry) => ({
      ...entry,
      category: normalizeChineseWording(entry.category),
      original: normalizeChineseWording(entry.original),
      observedCondition: entry.observedCondition ? normalizeChineseWording(entry.observedCondition) : entry.observedCondition,
      inspectorFinding: entry.inspectorFinding ? normalizeChineseWording(entry.inspectorFinding) : entry.inspectorFinding,
      detentionReason: entry.detentionReason ? normalizeChineseWording(entry.detentionReason) : entry.detentionReason,
      requiredRectification: entry.requiredRectification ? normalizeChineseWording(entry.requiredRectification) : entry.requiredRectification,
      releaseCondition: entry.releaseCondition ? normalizeChineseWording(entry.releaseCondition) : entry.releaseCondition,
      sourceQuote: entry.sourceQuote ? normalizeChineseWording(entry.sourceQuote) : entry.sourceQuote,
      notes: entry.notes ? normalizeChineseWording(entry.notes) : entry.notes,
    })),
  }
}

function normalizeSourceWording(item: SourceBookmark): SourceBookmark {
  return {
    ...item,
    title: normalizeChineseWording(item.title),
    sourceType: normalizeChineseWording(item.sourceType),
    notes: item.notes ? normalizeChineseWording(item.notes) : item.notes,
    authority: item.authority ? normalizeChineseWording(item.authority) : item.authority,
    tags: item.tags?.map(normalizeChineseWording),
  }
}

function richnessScore(item: InspectionCase) {
  const level = item.evidenceLevel === 'full-dossier' ? 4 : item.evidenceLevel === 'narrative' ? 3 : item.evidenceLevel === 'official-summary' ? 2 : 1
  return level * 1000 + item.narrative.length * 10 + item.deficiencies.length
}
