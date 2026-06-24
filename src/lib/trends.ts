import type { CaseStatus, EvidenceLevel, InspectionCase, TimeRangeKey, TrendSummary } from '../types'

export const timeRangeLabels: Record<TimeRangeKey, string> = { '3m': '最近3個月', '6m': '最近6個月', '1y': '最近一年', all: '全部時間' }

export function filterCasesByRangeAndRegion(cases: InspectionCase[], range: TimeRangeKey, region: string, now = new Date()) {
  const threshold = rangeStart(range, now)
  return cases.filter((item) => {
    const inRegion = !region || region === '全部地區' || item.region === region || item.source.authority === region || item.mou === region
    const inRange = !threshold || new Date(`${item.date}T00:00:00`).getTime() >= threshold.getTime()
    return inRegion && inRange
  })
}

export function calculateTrendSummary(cases: InspectionCase[], range: TimeRangeKey, region: string, now = new Date()): TrendSummary {
  const scoped = filterCasesByRangeAndRegion(cases, range, region, now)
  const categoryMap = new Map<string, { count: number; cases: string[] }>()
  const authorityMap = new Map<string, number>()
  const regionMap = new Map<string, { cases: number; detainable: number; indexOnly: number; analysisReady: number }>()
  const evidenceMap = new Map<EvidenceLevel, number>()
  const statusMap = new Map<CaseStatus, number>()
  const monthMap = new Map<string, { cases: number; detainable: number }>()
  const matrixMap = new Map<string, { category: string; region: string; count: number }>()
  const keywordMap = new Map<string, number>()

  for (const item of scoped) {
    const detainable = detainableCount(item)
    authorityMap.set(item.source.authority, (authorityMap.get(item.source.authority) ?? 0) + 1)
    evidenceMap.set(item.evidenceLevel, (evidenceMap.get(item.evidenceLevel) ?? 0) + 1)
    statusMap.set(item.status, (statusMap.get(item.status) ?? 0) + 1)
    const regionStats = regionMap.get(item.region) ?? { cases: 0, detainable: 0, indexOnly: 0, analysisReady: 0 }
    regionStats.cases += 1
    regionStats.detainable += detainable
    if (item.evidenceLevel === 'index-only') regionStats.indexOnly += 1
    else regionStats.analysisReady += 1
    regionMap.set(item.region, regionStats)

    const month = item.date.slice(0, 7) || '未知月份'
    const monthStats = monthMap.get(month) ?? { cases: 0, detainable: 0 }
    monthStats.cases += 1
    monthStats.detainable += detainable
    monthMap.set(month, monthStats)

    for (const deficiency of item.deficiencies) {
      const increment = deficiency.detentionGround === false ? 0 : 1
      const current = categoryMap.get(deficiency.category) ?? { count: 0, cases: [] }
      current.count += increment
      if (!current.cases.includes(item.vessel)) current.cases.push(item.vessel)
      categoryMap.set(deficiency.category, current)
      const matrixKey = `${deficiency.category}|${item.region}`
      const cell = matrixMap.get(matrixKey) ?? { category: deficiency.category, region: item.region, count: 0 }
      cell.count += increment
      matrixMap.set(matrixKey, cell)
      if (increment) {
        for (const keyword of extractKeywords(`${deficiency.original} ${deficiency.translation}`)) {
          keywordMap.set(keyword, (keywordMap.get(keyword) ?? 0) + 1)
        }
      }
    }
  }

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, value]) => ({ category, ...value }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
  const topAuthorities = Array.from(authorityMap.entries()).map(([authority, count]) => ({ authority, count })).sort((a, b) => b.count - a.count)
  const regionBreakdown = Array.from(regionMap.entries())
    .map(([name, value]) => ({ region: name, ...value }))
    .sort((a, b) => b.detainable - a.detainable || b.cases - a.cases || a.region.localeCompare(b.region))
  const evidenceMix = Array.from(evidenceMap.entries()).map(([level, count]) => ({ level, count })).sort((a, b) => b.count - a.count)
  const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count)
  const monthlyTrend = Array.from(monthMap.entries())
    .map(([month, value]) => ({ month, ...value }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
  const categoryRegionMatrix = Array.from(matrixMap.values()).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 18)
  const topKeywords = Array.from(keywordMap.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, 18)
  const typicalCases = [...scoped].sort((a, b) => b.detentionGroundCount - a.detentionGroundCount).slice(0, 5)
  return {
    range,
    region: region || '全部地區',
    totalCases: scoped.length,
    totalDetainableDeficiencies: topCategories.reduce((sum, item) => sum + item.count, 0),
    analysisReadyCases: scoped.filter((item) => item.evidenceLevel !== 'index-only').length,
    indexOnlyCases: scoped.filter((item) => item.evidenceLevel === 'index-only').length,
    topCategories,
    topAuthorities,
    regionBreakdown,
    evidenceMix,
    statusBreakdown,
    monthlyTrend,
    categoryRegionMatrix,
    topKeywords,
    prioritySignals: buildPrioritySignals(scoped, topCategories, regionBreakdown),
    typicalCases,
    focusDirections: topCategories.slice(0, 4).map((item) => focusText(item.category, item.count)),
  }
}

export function getRegions(cases: InspectionCase[]) {
  return Array.from(new Set(cases.map((item) => item.region).filter(Boolean))).sort()
}

function detainableCount(item: InspectionCase) {
  return item.deficiencies.reduce((sum, deficiency) => sum + (deficiency.detentionGround === false ? 0 : 1), 0)
}

function rangeStart(range: TimeRangeKey, now: Date) {
  if (range === 'all') return null
  const months = range === '3m' ? 3 : range === '6m' ? 6 : 12
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate())
}

function buildPrioritySignals(cases: InspectionCase[], topCategories: Array<{ category: string; count: number }>, regionBreakdown: Array<{ region: string; cases: number; detainable: number; indexOnly: number; analysisReady: number }>) {
  const signals: string[] = []
  const top = topCategories[0]
  if (top) signals.push(`第一優先檢查面向：${top.category}，在所選範圍內累計 ${top.count} 項滯留依據。`)
  const leadingRegion = regionBreakdown[0]
  if (leadingRegion) signals.push(`地區重點：${leadingRegion.region} 目前案例/缺陷信號最集中（${leadingRegion.cases} 案、${leadingRegion.detainable} 項依據）。`)
  const indexOnly = cases.filter((item) => item.evidenceLevel === 'index-only')
  if (indexOnly.length) signals.push(`${indexOnly.length} 筆為最新索引但缺少缺陷原文，需優先追月度清單或 Form A/B，避免用空白索引做原因分析。`)
  const stillDetained = cases.filter((item) => item.status === 'detained')
  if (stillDetained.length) signals.push(`${stillDetained.length} 筆仍在滯留/未確認解除，適合作為本週跟蹤清單。`)
  return signals
}

function extractKeywords(text: string) {
  const lower = text.toLocaleLowerCase()
  const rules: Array<[string, string]> = [
    ['fire door', '防火門'], ['fire detection', '火警探測'], ['smoke detector', '煙霧探測器'], ['fire pump', '消防泵'],
    ['emergency fire pump', '應急消防泵'], ['fire damper', '防火風閘'], ['quick closing', '速閉閥'], ['co2', 'CO2 系統'],
    ['lifeboat', '救生艇'], ['rescue boat', '救助艇'], ['liferaft', '救生筏'], ['embarkation', '登乘安排'],
    ['emergency generator', '應急發電機'], ['emergency lighting', '應急照明'], ['blackout', 'blackout 測試'],
    ['bnwas', 'BNWAS'], ['vdr', 'VDR/S-VDR'], ['ecdis', 'ECDIS'], ['chart', '海圖'], ['voyage plan', '航次計劃'],
    ['ows', '油水分離器'], ['15 ppm', '15ppm 報警'], ['sewage', '生活污水裝置'], ['ballast water', '壓載水系統'],
    ['oil record book', '油類記錄簿'], ['gmdss', 'GMDSS'], ['inmarsat', 'INMARSAT-C'], ['certificate', '證書'],
    ['crew', '船員熟悉'], ['drill', '演習'], ['ism', 'ISM'], ['wage', '工資'], ['rest hour', '工時/休息'],
    ['weathertight', '風雨密'], ['watertight', '水密'], ['hatch cover', '艙蓋'], ['corrosion', '腐蝕'],
    ['engine room', '機艙'], ['steering gear', '舵機'], ['gas detector', '氣體探測器'], ['cargo securing', '貨物繫固'],
  ]
  return rules.filter(([needle]) => lower.includes(needle)).map(([, label]) => label)
}

function focusText(category: string, count: number) {
  const guide: Record<string, string> = {
    '消防安全': '消防安全仍是重點：固定滅火、探火、風閘、防火門和消防演習需要上船前逐項測試。',
    'ISM／安全管理': 'ISM 缺陷反映船岸管理失效：需追查重複缺陷、維護閉環和船員熟悉程度。',
    '救生設備': '救生設備是高風險項：救生艇/救助艇、釋放裝置、登乘安排和演習記錄需提前核查。',
    '航行安全': '航行安全重點包括海圖、羅經、航次計劃、信號燈和駕駛台設備。',
    '防污染': '防污染檢查聚焦 MARPOL 設備、SOx/排放替代安排、油類留存和排放管路。',
    'MLC／船員權益': 'MLC 類缺陷通常由投訴觸發，工資、休息、伙食、住宿和遣返資料要能即時證明。',
    '操作／設備缺陷': '操作／設備缺陷多集中在具體設備失效、測試不能演示、貨物/機艙現場狀態不合格，需按設備逐項試驗。',
  }
  return `${guide[category] ?? `${category} 類缺陷近期出現 ${count} 項滯留依據，建議納入預檢清單。`}（${count} 項）`
}
