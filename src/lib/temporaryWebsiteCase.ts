import type { ManualCaseDraft } from './editorWorkflow'

const DETENTION_KEYWORDS = /detain|detention|deficien|defect|inoperative|failed|not working|not self-closing|missing|expired|oil|fire|lifeboat|emergency|safety management|ISM|pollution|alarm/i

export function buildManualCaseDraftFromHtml(html: string, url: string, now = new Date().toISOString()): ManualCaseDraft {
  const title = extractTitle(html)
  const text = htmlToText(html)
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const compact = lines.join('\n')
  const vessel = extractVessel(lines, title) || '臨時網站案例'
  const imo = matchFirst(compact, /\bIMO\s*(?:No\.?|number)?\s*[:#-]?\s*(\d{7})\b/i)
  const flag = matchFirst(compact, /\bFlag\s*[:：-]\s*([^\n|,;]+)/i)
  const shipType = matchFirst(compact, /\b(?:Ship\s*type|Vessel\s*type|Type)\s*[:：-]\s*([^\n|,;]+)/i)
  const date = normalizeDate(matchFirst(compact, /\b(?:Date(?: of detention)?|Detention date)\s*[:：-]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i)) || now.slice(0, 10)
  const port = matchFirst(compact, /\bPort\s*[:：-]\s*([^\n|,;]+)/i) || matchFirst(compact, /detained\s+at\s+([^\n|,;.]+)/i)
  const detentionItemsText = extractDetentionRows(lines)
  return {
    vessel,
    imo,
    flag,
    shipType,
    date,
    port,
    region: '臨時網站抓取',
    authority: title || hostFromUrl(url) || '臨時網站',
    sourceUrl: url,
    sourceTitle: title || url,
    summary: `${vessel} 臨時網站自動抓取案例；請人工核對官方來源。`,
    detentionItemsText: detentionItemsText || `TEMP | 待分類 | ${text.slice(0, 300) || '未能自動識別滯留內容，請人工補充。'}`,
  }
}

function extractDetentionRows(lines: string[]) {
  const rows: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const clean = line.replace(/^(?:[-•*]|\d{1,2}[.)])\s+/, '').replace(/\s+/g, ' ').trim()
    if (clean.length < 18) continue
    const code = matchFirst(clean, /\b(\d{5})\b/) || 'TEMP'
    if (!/\b\d{5}\b/.test(clean) && !DETENTION_KEYWORDS.test(clean)) continue
    const original = clean.replace(/^\d{5}\s*[-:：|]?\s*/, '').trim()
    const key = `${code}|${original}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(`${code} | ${inferCategory(original)} | ${original}`)
    if (rows.length >= 20) break
  }
  return rows.join('\n')
}

function inferCategory(text: string) {
  const value = text.toLowerCase()
  if (/oil|pollution|garbage|sewage|marpol|filtering/.test(value)) return '防污染'
  if (/fire|detector|alarm|door|damper|extinguish/.test(value)) return '消防安全'
  if (/lifeboat|life.?saving|launching|rescue|embarkation/.test(value)) return '救生設備'
  if (/ism|safety management|sms|management system/.test(value)) return 'ISM／安全管理'
  if (/emergency|generator|battery|blackout/.test(value)) return '應急準備'
  if (/navigation|chart|voyage|radar|ecdis/.test(value)) return '航行安全'
  if (/certificate|document|record|logbook/.test(value)) return '證書／文件'
  if (/engine|machinery|steering|propulsion/.test(value)) return '主輔機／機艙'
  return '操作／設備滯留'
}

function extractVessel(lines: string[], title: string) {
  const joined = [title, ...lines.slice(0, 20)].join('\n')
  return matchFirst(joined, /\b(?:MV|M\/V|MT|M\/T|MS|M\/S)\s+([A-Z0-9][A-Z0-9 '\-]{2,60})\b/i, (value) => `MV ${value.trim().replace(/\s+/g, ' ')}`)
    || matchFirst(joined, /\bVessel\s*[:：-]\s*([^\n|,;]+)/i)
    || matchFirst(joined, /\bShip\s*[:：-]\s*([^\n|,;]+)/i)
}

function extractTitle(html: string) {
  const value = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  return value ? decodeHtml(value).replace(/\s+/g, ' ').trim() : ''
}

function htmlToText(html: string) {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|li|div|h\d|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function matchFirst(text: string, pattern: RegExp, map?: (value: string) => string) {
  const match = text.match(pattern)
  const value = match?.[1]?.trim()
  return value ? (map ? map(value) : value.replace(/\s+/g, ' ').trim()) : ''
}

function normalizeDate(value: string) {
  if (!value) return ''
  const parts = value.replace(/\//g, '-').split('-').map((part) => part.padStart(2, '0'))
  if (parts[0]?.length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}`
  if (parts[2]?.length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return value
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
}

function hostFromUrl(value: string) {
  try { return new URL(value).hostname } catch { return '' }
}
