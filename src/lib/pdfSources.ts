import type { SourceBookmark } from '../types'

export interface PdfSourceBrief {
  id: string
  title: string
  url: string
  authority: string
  status: string
  storageUrl: string
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
  if (item.pdfArchivedAt) bullets.push(`PDF 歸檔時間：${item.pdfArchivedAt}`)
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    authority,
    status,
    storageUrl: item.storageUrl || '尚未填寫網盤/歸檔地址',
    bullets,
  }
}
