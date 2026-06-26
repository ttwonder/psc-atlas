import type { SourceBookmark } from '../types'
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

export function isPdfSource(item: SourceBookmark) {
  return /\.pdf($|[?#])/i.test(item.url)
    || /\bpdf\b/i.test(`${item.sourceType} ${item.title} ${(item.tags ?? []).join(' ')}`)
}

export function getPdfSources(sources: SourceBookmark[]) {
  return sources.filter((item) => !item.deletedAt && isPdfSource(item))
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
    title: item.title,
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
    links.push({ url: absolute, title: htmlToPlainText(match[3]) || fileNameFromUrl(absolute) || 'PDF 文件' })
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
      const links = extractPdfLinksFromHtml(html, source.url)
      if (!links.length) {
        messages.push(`${source.title} 未找到 PDF 連結`)
        continue
      }
      const pdfSources = links.map((link): SourceBookmark => ({
        id: `auto-pdf-${slugify(link.url)}`,
        title: link.title,
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

function isPdfUrlLike(value: string) {
  return /\.pdf(?:$|[?#])/i.test(value.trim())
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
