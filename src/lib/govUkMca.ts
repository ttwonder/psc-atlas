import type { Deficiency, InspectionCase } from '../types'
import { slugify } from './storage'

interface McaParseContext { url: string; title: string; publishedAt: string; fetchedAt: string }

const monthMap: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
}

export async function fetchLatestMcaCases(limit = 8): Promise<InspectionCase[]> {
  const search = new URL('https://www.gov.uk/api/search.json')
  search.searchParams.set('q', '"Foreign flagged ships detained" "Paris MOU"')
  search.searchParams.set('filter_organisations', 'maritime-and-coastguard-agency')
  search.searchParams.set('count', String(Math.max(limit * 3, 20)))
  search.searchParams.set('fields', 'title,link,public_timestamp,description')
  search.searchParams.set('order', '-public_timestamp')
  const searchResponse = await fetch(search)
  if (!searchResponse.ok) throw new Error(`GOV.UK search failed: ${searchResponse.status}`)
  const searchJson = await searchResponse.json() as { results: Array<{ title: string; link: string; public_timestamp: string }> }
  const relevant = searchJson.results.filter((item) => item.title.toLowerCase().includes('foreign flagged ships detained'))
  const fetchedAt = new Date().toISOString()
  const allCases: InspectionCase[] = []
  for (const result of relevant.slice(0, limit)) {
    const path = result.link.startsWith('http') ? new URL(result.link).pathname : result.link
    const contentUrl = `https://www.gov.uk/api/content${path}`
    const response = await fetch(contentUrl)
    if (!response.ok) continue
    const content = await response.json() as { details?: { body?: string }; title?: string; public_updated_at?: string }
    allCases.push(...parseMcaDetentionHtml(content.details?.body ?? '', {
      url: `https://www.gov.uk${path}`,
      title: content.title ?? result.title,
      publishedAt: (result.public_timestamp ?? content.public_updated_at ?? '').slice(0, 10),
      fetchedAt,
    }))
  }
  return allCases
}

export function parseMcaDetentionHtml(html: string, context: McaParseContext): InspectionCase[] {
  const withRows = html.replace(/<tr[\s\S]*?<\/tr>/gi, (row) => `\n${extractCells(row).join('\t')}\n`)
  const text = htmlToText(withRows)
  const blocks = text.split(/(?=\bVessel Name\s*:)/i).slice(1)
  return blocks.map((block) => parseCaseBlock(block, context)).filter((item): item is InspectionCase => Boolean(item))
}

function parseCaseBlock(block: string, context: McaParseContext): InspectionCase | null {
  const vessel = field(block, 'Vessel Name')?.replace(/\s*\(.*?\)\s*$/, '').trim()
  const imo = field(block, 'IMO') ?? field(block, 'IMO No') ?? field(block, 'IMO No.')
  if (!vessel || !imo) return null
  const flagRaw = field(block, 'Flag') ?? '官方未列明'
  const detentionLine = field(block, 'Date and place of detention') ?? ''
  const { date, port } = parseDateAndPort(detentionLine)
  const releaseDate = parseReleaseDate(block)
  const deficiencyRows = parseDeficiencyRows(block)
  const summary = field(block, 'Summary') ?? ''
  const deficiencyCount = parseFirstCount(summary, /(.+?)\s+deficien/i) ?? deficiencyRows.length
  const detentionGroundCount = parseFirstCount(summary, /with\s+(.+?)\s+grounds?/i) ?? deficiencyRows.filter((item) => item.detentionGround).length
  const status = /still under detention/i.test(block) ? 'detained' : releaseDate ? 'released' : 'detained'
  const deficiencies = deficiencyRows.length ? deficiencyRows : [{ code: '官方未列明', category: '官方摘要', original: 'MCA page did not expose a machine-readable deficiency table in this block.', translation: '此區塊未解析到逐項缺陷表。', detentionGround: null }]
  const shortSummary = `${vessel} 於 ${date || '未知日期'} 在 ${port || '英國港口'} 被滯留；公開資料列出 ${detentionGroundCount} 項滯留依據，主要涉及 ${topCategories(deficiencies).join('、')}。${releaseDate ? `已於 ${releaseDate} 解除滯留。` : '報告截止時仍可能處於滯留狀態。'}`
  return {
    id: `mca-${slugify(`${vessel}-${imo}-${date || context.publishedAt}`)}`,
    vessel,
    imo: imo.replace(/[^0-9]/g, ''),
    flag: flagRaw.replace(/\s*\(.*?\)/, '').trim(),
    flagEmoji: '⚓',
    shipType: '官方月報未列明',
    built: null,
    gt: parseInt((field(block, 'GT') ?? '').replace(/\D/g, ''), 10) || null,
    company: field(block, 'Company') ?? '官方月報未列明',
    classSociety: field(block, 'Classification society') ?? '官方月報未列明',
    date: date || context.publishedAt,
    releaseDate,
    port: port || 'UK port',
    mou: 'Paris MoU',
    region: 'UK / Paris MoU',
    deficiencyCount,
    detentionGroundCount,
    status,
    evidenceLevel: 'official-summary',
    shortSummary,
    narrative: [
      `英國 MCA 月度公告記錄，${vessel} 在 ${port || '英國港口'} 接受 PSC 檢查後被滯留。`,
      `公告摘要顯示共 ${deficiencyCount} 項缺失，其中 ${detentionGroundCount} 項列為 Grounds for Detention。`,
      releaseDate ? `公告記錄該船於 ${releaseDate} 解除滯留。` : '公告未提供明確解除滯留日期，或在統計截止時仍處於滯留狀態。',
    ],
    deficiencies,
    source: { authority: 'UK Maritime and Coastguard Agency', title: context.title, url: context.url, publishedAt: context.publishedAt, sourceType: '官方月度滯留報告' },
    evidenceNote: 'MCA 月報公開的是滯留依據摘要；App 保留原文與缺陷代碼，但不把 “Not as required” 擴寫為未公開的現場細節。',
    fetchedAt: context.fetchedAt,
  }
}

function parseDeficiencyRows(block: string): Deficiency[] {
  const rows = block.split('\n').map((line) => line.trim()).filter(Boolean)
  const deficiencies: Deficiency[] = []
  for (const line of rows) {
    const cells = line.split('\t').map((cell) => cell.trim()).filter(Boolean)
    if (cells.length >= 3 && !/defective item/i.test(cells[0])) deficiencies.push(rowToDeficiency(cells[0], cells[1], cells[2]))
  }
  if (deficiencies.length) return deficiencies
  const start = rows.findIndex((line) => /Defective item/i.test(line))
  if (start === -1) return []
  for (let i = start + 3; i + 2 < rows.length; i += 3) {
    if (/This vessel|DETENTIONS|For further/i.test(rows[i])) break
    if (/^Yes$/i.test(rows[i + 2])) deficiencies.push(rowToDeficiency(rows[i], rows[i + 1], rows[i + 2]))
  }
  return deficiencies
}

function rowToDeficiency(item: string, nature: string, ground: string): Deficiency {
  const match = item.match(/^([0-9]{5}|官方未列明)\s*[–—-]?\s*(.*)$/)
  const code = match?.[1] ?? '官方未列明'
  const title = (match?.[2] || item).trim()
  return {
    code,
    category: categoryFromCode(code, title),
    original: `${item} — ${nature}.`,
    translation: `${title || item}：${translateNature(nature)}。`,
    detentionGround: /^yes$/i.test(ground),
    inspectorFinding: nature,
    detentionReason: /^yes$/i.test(ground) ? 'MCA 公告表格將此項標示為 Ground for Detention。' : undefined,
    sourceQuote: `${item} | ${nature} | ${ground}`,
  }
}

export function categoryFromCode(code: string, title = '') {
  const prefix = code.slice(0, 2)
  if (code === '15150' || /ISM/i.test(title)) return 'ISM／安全管理'
  if (prefix === '07') return '消防安全'
  if (prefix === '11') return '救生設備'
  if (prefix === '10') return '航行安全'
  if (prefix === '14') return '防污染'
  if (prefix === '18') return 'MLC／船員權益'
  if (prefix === '04') return '應急準備'
  if (prefix === '02') return '船體／適航'
  if (prefix === '03') return '水密／安全通道'
  if (prefix === '01') return '證書／文件'
  return '其他／官方摘要'
}

function translateNature(nature: string) {
  const normalized = nature.trim().toLowerCase()
  if (normalized.includes('not as required')) return '不符合要求'
  if (normalized.includes('inoperative')) return '無法操作'
  if (normalized.includes('missing')) return '缺失'
  if (normalized.includes('lack of familiarity')) return '船員不熟悉'
  if (normalized.includes('lack of training')) return '訓練不足'
  if (normalized.includes('expired')) return '已過期'
  if (normalized.includes('not properly maintained')) return '維護不當'
  if (normalized.includes('invalid')) return '無效'
  return nature
}

function topCategories(deficiencies: Deficiency[]) {
  return Array.from(new Set(deficiencies.map((item) => item.category))).slice(0, 3)
}

function field(block: string, label: string) {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?:No\\.?)?\\s*:\\s*([^\\n]+)`, 'i')
  return block.match(pattern)?.[1]?.trim()
}

function parseDateAndPort(value: string) {
  const match = value.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s+at\s+(.+)/i)
  if (!match) return { date: '', port: value.trim() }
  return { date: toIsoDate(match[1], match[2], match[3]), port: match[4].trim() }
}

function parseReleaseDate(block: string) {
  const match = block.match(/This vessel was released\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i)
  return match ? toIsoDate(match[1], match[2], match[3]) : null
}

function toIsoDate(day: string, month: string, year: string) {
  const mm = monthMap[month.toLowerCase()]
  return mm ? `${year}-${mm}-${day.padStart(2, '0')}` : `${year}-${day.padStart(2, '0')}`
}

function parseFirstCount(value: string, regex: RegExp) {
  const raw = value.match(regex)?.[1]
  if (!raw) return null
  const digit = raw.match(/\d+/)?.[0]
  if (digit) return Number(digit)
  return wordsToNumber(raw)
}

function wordsToNumber(value: string) {
  const words = value.toLowerCase().replace(/-/g, ' ').split(/\s+/)
  let total = 0
  for (const word of words) total += numberWords[word] ?? 0
  return total || null
}

function extractCells(row: string) {
  return Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => htmlToText(match[1]).trim())
}

function htmlToText(value: string) {
  const withBreaks = value
    .replace(/<\/(p|div|h\d|li|td|th)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  return withBreaks.replace(/<[^>]+>/g, '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
