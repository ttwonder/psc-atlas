import type { InspectionCase } from '../types'
import { fetchLatestMcaCases } from './govUkMca'
import { slugify } from './storage'

export interface OfficialRefreshResult {
  cases: InspectionCase[]
  messages: string[]
}

export async function fetchLatestOfficialCases(limit = 8): Promise<OfficialRefreshResult> {
  const messages: string[] = []
  const batches = await Promise.allSettled([
    withTimeout(fetchLatestMcaCases(limit), 15000, 'MCA 月報請求逾時'),
    withTimeout(fetchParisCurrentDetentions(), 10000, 'Paris MoU current detentions 請求逾時'),
  ])
  const cases: InspectionCase[] = []
  const mca = batches[0]
  if (mca.status === 'fulfilled') {
    cases.push(...mca.value)
    messages.push(`MCA 月報 ${mca.value.length} 筆`)
  } else messages.push(`MCA 月報失敗：${messageFromError(mca.reason)}`)
  const paris = batches[1]
  if (paris.status === 'fulfilled') {
    cases.push(...paris.value)
    messages.push(`Paris MoU current detentions ${paris.value.length} 筆索引`)
  } else messages.push(`Paris MoU current detentions 失敗：${messageFromError(paris.reason)}`)
  return { cases, messages }
}

export async function fetchParisCurrentDetentions(): Promise<InspectionCase[]> {
  const response = await fetch('https://parismou.org/Inspection-Database/current-detentions')
  if (!response.ok) throw new Error(`Paris MoU current detentions failed: ${response.status}`)
  const html = await response.text()
  return parseParisCurrentDetentionsHtml(html, new Date().toISOString())
}

export function parseParisCurrentDetentionsHtml(html: string, fetchedAt: string): InspectionCase[] {
  const rows = Array.from(html.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map((match) => extractCells(match[0]).map(clean))
  const candidates = rows.filter((cells) => cells.length >= 4 && cells.some((cell) => /\b\d{7}\b/.test(cell)) && !cells.join(' ').toLowerCase().includes('imo'))
  return candidates.map((cells, index) => rowToParisIndexCase(cells, index, fetchedAt)).filter((item): item is InspectionCase => Boolean(item))
}

function rowToParisIndexCase(cells: string[], index: number, fetchedAt: string): InspectionCase | null {
  const joined = cells.join(' | ')
  const imo = joined.match(/\b\d{7}\b/)?.[0]
  if (!imo) return null
  const date = cells.find((cell) => /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/.test(cell) || /\b\d{1,2}[-/]\d{1,2}[-/]20\d{2}\b/.test(cell))
  const isoDate = normalizeDate(date) || fetchedAt.slice(0, 10)
  const vessel = cells.find((cell) => /[A-Za-z]{3}/.test(cell) && !/detention|port|country|imo/i.test(cell) && !/\b\d{7}\b/.test(cell) && !normalizeDate(cell)) ?? `Paris MoU detention ${index + 1}`
  const country = cells.find((cell) => /Croatia|United Kingdom|UK|Germany|Spain|Italy|France|Netherlands|Belgium|Poland|Romania|Bulgaria|Greece|Ireland|Portugal|Norway|Sweden|Finland|Denmark|Estonia|Latvia|Lithuania|Malta|Cyprus|Slovenia|Iceland/i.test(cell)) ?? 'Paris MoU port state'
  const port = cells.find((cell) => cell !== vessel && cell !== country && !cell.includes(imo) && !normalizeDate(cell) && /[A-Za-z]{3}/.test(cell)) ?? 'Port not disclosed'
  return {
    id: `paris-current-${slugify(`${vessel}-${imo}-${isoDate}`)}`,
    vessel,
    imo,
    flag: '未公開',
    flagEmoji: '⚓',
    shipType: 'Current detention index',
    built: null,
    gt: null,
    company: '未公開',
    classSociety: '未公開',
    date: isoDate,
    releaseDate: null,
    port,
    mou: 'Paris MoU',
    region: `${country} / Paris MoU`,
    deficiencyCount: 0,
    detentionGroundCount: 0,
    status: 'detained',
    evidenceLevel: 'index-only',
    shortSummary: `Paris MoU current detentions 列出 ${vessel} / IMO ${imo} 仍在 ${port} 滯留；此來源不公開逐項缺陷原文，需後續月度清單或 Form A/B 才能分析原因。`,
    narrative: ['此筆由 Paris MoU current detentions 自動抓取，僅作最新滯留索引，不作缺陷原因分析。'],
    deficiencies: [{ code: 'INDEX', category: '具體缺陷未公開', original: '具體缺陷未公開；需追 Form A/B、月度清單或官方附件。', detentionGround: null }],
    source: { authority: 'Paris MoU', title: 'Current detentions', url: 'https://parismou.org/Inspection-Database/current-detentions', publishedAt: isoDate, sourceType: 'Current detentions 索引' },
    evidenceNote: '自動抓取只保存索引邊界；不要把此筆作為分析可用缺陷證據。',
    fetchedAt,
  }
}

function extractCells(row: string) {
  return Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => htmlToText(match[1]))
}

function htmlToText(value: string) {
  const text = value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  return text.replace(/\s+/g, ' ').trim()
}

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeDate(value?: string) {
  if (!value) return ''
  const ymd = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/)
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  const dmy = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return ''
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => { globalThis.clearTimeout(timer); resolve(value) },
      (error) => { globalThis.clearTimeout(timer); reject(error) },
    )
  })
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
