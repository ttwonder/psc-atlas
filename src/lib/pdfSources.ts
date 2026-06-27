import type { PdfReferenceLevel, SourceBookmark } from '../types'
import { slugify } from './storage'

export interface PdfSourceBrief {
  id: string
  title: string
  url: string
  authority: string
  status: string
  storageUrl?: string
  bullets: string[]
}

export type PdfAttentionFilter = 'all' | 'attention' | 'normal'
export type PdfCoveragePeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | '上半年' | '下半年' | '年度匯總'
export const PDF_COVERAGE_UNMARKED = '未標記'
export const PDF_COVERAGE_PERIODS: PdfCoveragePeriod[] = ['Q1', 'Q2', 'Q3', 'Q4', '上半年', '下半年', '年度匯總']

export interface PdfReviewMeta {
  needsAttention: boolean
  referenceLevel: PdfReferenceLevel
  coverage: string
}

export interface PdfReviewDraft {
  needsAttention?: boolean
  referenceLevel?: PdfReferenceLevel
  coverage?: string
}

export interface PdfSourceFilters {
  authority: string
  attention: PdfAttentionFilter
  referenceLevel: PdfReferenceLevel | 'all'
  coverage: string
  coverageYear?: string
  coveragePeriod?: string
}

export function isPdfSource(item: SourceBookmark) {
  return /\.pdf($|[?#])/i.test(item.url)
    || /\bpdf\b/i.test(`${item.sourceType} ${item.title} ${(item.tags ?? []).join(' ')}`)
}

export function getPdfSources(sources: SourceBookmark[]) {
  return sources.filter((item) => !item.deletedAt && !isPdfNotNeeded(item) && isPdfSource(item))
}

export function getPdfReviewMeta(item: SourceBookmark): PdfReviewMeta {
  return {
    needsAttention: Boolean(item.pdfNeedsAttention || item.tags?.includes('pdf-attention')),
    referenceLevel: item.pdfReferenceLevel ?? referenceLevelFromTags(item.tags) ?? 'medium',
    coverage: item.pdfCoverage?.trim() || coverageFromTags(item.tags) || '未標記',
  }
}

export function updatePdfReviewMeta(item: SourceBookmark, draft: PdfReviewDraft, now = new Date().toISOString()): SourceBookmark {
  const current = getPdfReviewMeta(item)
  return {
    ...item,
    pdfNeedsAttention: draft.needsAttention ?? current.needsAttention,
    pdfReferenceLevel: draft.referenceLevel ?? current.referenceLevel,
    pdfCoverage: draft.coverage?.trim() || current.coverage,
    updatedAt: now,
  }
}

export function buildPdfCoverageYearOptions(startYear = new Date().getFullYear() - 2, endYear = 2100) {
  const years: string[] = [PDF_COVERAGE_UNMARKED]
  for (let year = startYear; year <= endYear; year += 1) years.push(String(year))
  return years
}

export function splitPdfCoverage(coverage: string) {
  const value = coverage?.trim() || PDF_COVERAGE_UNMARKED
  if (!value || value === PDF_COVERAGE_UNMARKED) return { year: PDF_COVERAGE_UNMARKED, period: PDF_COVERAGE_UNMARKED }
  const year = value.match(/\b(20\d{2}|19\d{2}|2100)\b/)?.[1] ?? PDF_COVERAGE_UNMARKED
  const period = PDF_COVERAGE_PERIODS.find((item) => value.includes(item)) ?? PDF_COVERAGE_UNMARKED
  return { year, period }
}

export function buildPdfCoverage(year: string, period: string) {
  if (!year || year === PDF_COVERAGE_UNMARKED) return PDF_COVERAGE_UNMARKED
  if (!period || period === PDF_COVERAGE_UNMARKED) return year
  return `${year} ${period}`
}

export function filterPdfSources(sources: SourceBookmark[], filters: PdfSourceFilters) {
  return getPdfSources(sources).filter((item) => {
    const meta = getPdfReviewMeta(item)
    if (filters.authority !== 'all' && (item.authority || item.sourceType || '未標記來源') !== filters.authority) return false
    if (filters.attention === 'attention' && !meta.needsAttention) return false
    if (filters.attention === 'normal' && meta.needsAttention) return false
    if (filters.referenceLevel !== 'all' && meta.referenceLevel !== filters.referenceLevel) return false
    if (filters.coverage !== 'all' && meta.coverage !== filters.coverage) return false
    const coverageParts = splitPdfCoverage(meta.coverage)
    if (filters.coverageYear && filters.coverageYear !== 'all' && coverageParts.year !== filters.coverageYear) return false
    if (filters.coveragePeriod && filters.coveragePeriod !== 'all' && coverageParts.period !== filters.coveragePeriod) return false
    return true
  })
}

export function paginatePdfSources(sources: SourceBookmark[], page: number, pageSize = 20) {
  const totalPages = Math.max(1, Math.ceil(sources.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return { items: sources.slice(start, start + pageSize), page: safePage, totalPages, pageSize, totalItems: sources.length }
}

export function getPdfSelectionKey(item: Pick<SourceBookmark, 'url' | 'id'>) {
  return normalizePdfUrl(item.url) || item.id
}

export function isPdfNotNeeded(item: SourceBookmark) {
  return item.tags?.includes('pdf-not-needed') || item.status === 'failed' && /不需要|not needed/i.test(item.deleteReason ?? item.notes ?? '')
}

export function displayPdfTitle(item: Pick<SourceBookmark, 'title' | 'url' | 'authority' | 'sourceType'>) {
  const cleanTitle = item.title.trim()
  if (cleanTitle && !isGenericPdfTitle(cleanTitle)) return cleanTitle
  return fileNameFromUrl(item.url) || cleanTitle || item.authority || item.sourceType || 'PDF 文件'
}

export function buildPdfSourceBrief(item: SourceBookmark): PdfSourceBrief {
  const authority = item.authority || item.sourceType || '未標記來源'
  const status = item.status || (item.storageUrl ? 'archived' : 'new')
  const bullets = [
    `機關/來源：${authority}`,
    `狀態：${status}`,
  ]
  if (item.tags?.length) bullets.push(`標籤：${item.tags.join('、')}`)
  if (item.notes) bullets.push(`備註：${item.notes}`)
  if (item.publishedAt) bullets.push(`發布日期：${item.publishedAt}`)
  if (item.fetchedAt) bullets.push(`抓取時間：${item.fetchedAt}`)
  if (item.pdfArchivedAt) bullets.push(`備用歸檔時間：${item.pdfArchivedAt}`)
  return {
    id: item.id,
    title: displayPdfTitle(item),
    url: item.url,
    authority,
    status,
    storageUrl: item.storageUrl || undefined,
    bullets,
  }
}

export interface ExtractedPdfLink {
  url: string
  title: string
}

export interface PdfDiscoveryOptions {
  fetcher?: (url: string) => Promise<{ ok: boolean; text: () => Promise<string>; status?: number }>
  fetchedAt?: string
  maxPages?: number
  timeoutMs?: number
}

export interface PdfDiscoveryResult {
  sources: SourceBookmark[]
  messages: string[]
}

export function extractPdfLinksFromHtml(html: string, pageUrl: string): ExtractedPdfLink[] {
  const links: ExtractedPdfLink[] = []
  const seen = new Set<string>()
  const anchorPattern = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtmlAttribute(match[2])
    if (!isPdfUrlLike(rawHref)) continue
    const absolute = resolveUrl(rawHref, pageUrl)
    if (!absolute || seen.has(absolute)) continue
    seen.add(absolute)
    const anchorTitle = htmlToPlainText(match[3])
    links.push({ url: absolute, title: isGenericPdfTitle(anchorTitle) ? (fileNameFromUrl(absolute) || anchorTitle || 'PDF 文件') : anchorTitle })
  }

  const barePattern = /https?:\/\/[^\s"'<>]+?\.pdf(?:[?#][^\s"'<>]*)?/gi
  for (const match of html.matchAll(barePattern)) {
    const absolute = resolveUrl(decodeHtmlAttribute(match[0]), pageUrl)
    if (!absolute || seen.has(absolute)) continue
    seen.add(absolute)
    links.push({ url: absolute, title: fileNameFromUrl(absolute) || 'PDF 文件' })
  }
  return links
}

export async function discoverPdfSourcesFromPages(sources: SourceBookmark[], options: PdfDiscoveryOptions = {}): Promise<PdfDiscoveryResult> {
  const fetcher = options.fetcher ?? ((url: string) => fetch(url))
  const fetchedAt = options.fetchedAt ?? new Date().toISOString()
  const maxPages = options.maxPages ?? 12
  const timeoutMs = options.timeoutMs ?? 6000
  const candidates = sources
    .filter((item) => !item.deletedAt && !isPdfSource(item) && /^https?:\/\//i.test(item.url))
    .sort((a, b) => Number(b.manual) - Number(a.manual) || b.addedAt.localeCompare(a.addedAt))
    .slice(0, maxPages)
  const skippedPdfUrls = new Set(sources.filter((item) => isPdfSource(item) || item.deletedAt || isPdfNotNeeded(item)).map((item) => normalizePdfUrl(item.url)).filter(Boolean))

  const discovered: SourceBookmark[] = []
  const messages: string[] = []
  for (const source of candidates) {
    try {
      const response = await withPdfScanTimeout(fetcher(source.url), timeoutMs, `${source.title} PDF 掃描逾時`)
      if (!response.ok) {
        messages.push(`${source.title} PDF 掃描失敗：HTTP ${response.status ?? 'error'}`)
        continue
      }
      const html = await response.text()
      const links = extractPdfLinksFromHtml(html, source.url).filter((link) => !skippedPdfUrls.has(normalizePdfUrl(link.url)))
      if (!links.length) {
        messages.push(`${source.title} 未找到 PDF 連結`)
        continue
      }
      const pdfSources = links.map((link): SourceBookmark => ({
        id: `auto-pdf-${slugify(link.url)}`,
        title: isGenericPdfTitle(link.title) ? `${fileNameFromUrl(link.url) || 'PDF 文件'}（${source.title}）` : link.title,
        url: link.url,
        sourceType: '在線 PDF / 自動抓取',
        authority: source.authority || source.title,
        addedAt: fetchedAt,
        manual: false,
        notes: `自動從「${source.title}」頁面抓到 PDF 連結；原始頁：${source.url}`,
        fetchedAt,
        status: 'new',
        tags: ['online-pdf', 'auto-discovered'],
      }))
      discovered.push(...pdfSources)
      messages.push(`${source.title} 找到 ${pdfSources.length} 個 PDF`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      messages.push(`${source.title} PDF 掃描失敗：${message}`)
    }
  }
  return { sources: discovered, messages }
}


function isGenericPdfTitle(value: string) {
  return /^(pdf|pdf文件|pdf 文件|download|下載|打開|open|view|document)$/i.test(value.trim())
}

function referenceLevelFromTags(tags: string[] | undefined): PdfReferenceLevel | undefined {
  if (tags?.includes('pdf-ref-high')) return 'high'
  if (tags?.includes('pdf-ref-medium')) return 'medium'
  if (tags?.includes('pdf-ref-low')) return 'low'
  return undefined
}

function coverageFromTags(tags: string[] | undefined) {
  const tag = tags?.find((item) => item.startsWith('pdf-coverage:'))
  return tag ? tag.replace('pdf-coverage:', '').trim() : ''
}

function isPdfUrlLike(value: string) {
  return /\.pdf(?:$|[?#])/i.test(value.trim())
}

function normalizePdfUrl(value: string) {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return value.trim().replace(/\/$/, '')
  }
}

function resolveUrl(rawUrl: string, baseUrl: string) {
  try {
    return new URL(rawUrl.trim(), baseUrl).toString()
  } catch {
    return ''
  }
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function htmlToPlainText(value: string) {
  return decodeHtmlAttribute(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function fileNameFromUrl(value: string) {
  try {
    const url = new URL(value)
    const last = url.pathname.split('/').filter(Boolean).at(-1) ?? ''
    return decodeURIComponent(last).replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim()
  } catch {
    return ''
  }
}

function withPdfScanTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => { globalThis.clearTimeout(timer); resolve(value) },
      (error) => { globalThis.clearTimeout(timer); reject(error) },
    )
  })
}
