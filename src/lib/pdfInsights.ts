export interface PdfKeywordTrend {
  keyword: string
  count: number
}

export interface PdfInsights {
  deficiencyCandidates: string[]
  keywordTrends: PdfKeywordTrend[]
  summaryBullets: string[]
}

const keywordRules = [
  'fire door', 'fire detection', 'fire alarm', 'smoke detector', 'fire pump', 'emergency fire pump', 'fire damper', 'co2',
  'lifeboat', 'rescue boat', 'liferaft', 'embarkation', 'emergency generator', 'emergency lighting', 'blackout',
  'bnwas', 'vdr', 'ecdis', 'chart', 'voyage plan', 'ows', 'oily water separator', '15 ppm', 'sewage', 'ballast water',
  'oil record book', 'gmdss', 'inmarsat', 'certificate', 'crew', 'drill', 'ism', 'wage', 'rest hour', 'watertight',
  'weathertight', 'hatch cover', 'corrosion', 'engine room', 'steering gear', 'gas detector', 'cargo securing',
]

const deficiencySignals = [
  'failed', 'failure', 'not operative', 'inoperative', 'could not', 'unable to', 'not working', 'missing', 'expired',
  'invalid', 'defective', 'damaged', 'corroded', 'leak', 'leaking', 'blocked', 'not as required', 'not maintained',
  'not familiar', 'insufficient', 'without', 'overdue', 'unsafe', 'detainable', 'grounds for detention',
]

export function buildPdfInsights(text: string): PdfInsights {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 30)
  const deficiencyCandidates = sentences
    .filter(isLikelyDeficiency)
    .slice(0, 40)
  const keywordTrends = buildKeywordTrends(normalized)
  const summaryBullets = [
    deficiencyCandidates.length ? `疑似具體滯留描述 ${deficiencyCandidates.length} 條，應優先人工核對原 PDF 頁碼。` : '未自動識別到明確滯留描述，可能是掃描件或格式需要 OCR。',
    keywordTrends.length ? `高頻設備/管理詞：${keywordTrends.slice(0, 6).map((item) => `${item.keyword}(${item.count})`).join('、')}。` : '未識別到常見 PSC 設備/管理關鍵詞。',
    '自動提煉只作初篩；正式入庫仍應保留官方原文、來源 URL、頁碼與人工確認。',
  ]
  return { deficiencyCandidates, keywordTrends, summaryBullets }
}

function isLikelyDeficiency(sentence: string) {
  const lower = sentence.toLocaleLowerCase()
  return deficiencySignals.some((signal) => lower.includes(signal))
    && keywordRules.some((keyword) => lower.includes(keyword))
}

function buildKeywordTrends(text: string): PdfKeywordTrend[] {
  const lower = text.toLocaleLowerCase()
  return keywordRules
    .map((keyword) => ({ keyword, count: countOccurrences(lower, keyword) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 20)
}

function countOccurrences(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length ?? 0
}
