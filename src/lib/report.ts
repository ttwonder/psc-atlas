import type { InspectionCase, TimeRangeKey } from '../types'
import { calculateTrendSummary, filterCasesByRangeAndRegion, timeRangeLabels } from './trends'

export function buildRegionalReport(cases: InspectionCase[], region: string, range: TimeRangeKey, now = new Date()) {
  const summary = calculateTrendSummary(cases, range, region, now)
  const scoped = filterCasesByRangeAndRegion(cases, range, region, now)
  const typical = summary.typicalCases.slice(0, 3)
  const checklist = buildChecklist(summary.topCategories.map((item) => item.category))
  return [
    `# ${summary.region} PSC 滯留趨勢與預防檢查報告`,
    '',
    `**期間：** ${timeRangeLabels[range]}  `,
    `**案例數：** ${summary.totalCases}  `,
    `**滯留依據項數：** ${summary.totalDetainableDeficiencies}`,
    '',
    '## 一、匯總判斷與優先信號',
    summary.prioritySignals.length ? summary.prioritySignals.map((item) => `- ${item}`).join('\n') : '- 所選範圍內暫無足夠案例形成優先信號。',
    '',
    '## 二、近期檢查重點趨勢',
    summary.focusDirections.length ? summary.focusDirections.map((item) => `- ${item}`).join('\n') : '- 所選範圍內暫無足夠案例形成趨勢。',
    '',
    '## 三、主要缺陷類別',
    summary.topCategories.length ? summary.topCategories.map((item) => `- ${item.category}：${item.count} 項；涉及案例：${item.cases.slice(0, 5).join('、')}`).join('\n') : '- 無。',
    '',
    '## 四、地區分布與證據深度',
    summary.regionBreakdown.length ? summary.regionBreakdown.map((item) => `- ${item.region}：${item.cases} 案、${item.detainable} 項滯留依據；分析可用 ${item.analysisReady} 案，索引待補 ${item.indexOnly} 案。`).join('\n') : '- 無。',
    '',
    '## 五、典型扣船案例',
    typical.length ? typical.map((item) => `### ${item.vessel} / IMO ${item.imo}\n- 港口/日期：${item.port} / ${item.date}\n- 簡短原因：${item.shortSummary}\n- 滯留依據：${item.detentionGroundCount} 項；來源：${item.source.url}`).join('\n\n') : '- 所選範圍沒有案例。',
    '',
    '## 六、船舶督導自查清單',
    checklist.superintendent.map((item) => `- [ ] ${item}`).join('\n'),
    '',
    '## 七、船上自查自糾清單',
    checklist.shipboard.map((item) => `- [ ] ${item}`).join('\n'),
    '',
    '## 八、來源網址',
    scoped.map((item) => `- ${item.source.title}: ${item.source.url}`).filter((value, index, arr) => arr.indexOf(value) === index).join('\n') || '- 無。',
  ].join('\n')
}

export function buildChecklist(categories: string[]) {
  const baseSuperintendent = [
    '核對近三次 PSC/內審/船級社缺陷是否已完成根因分析與關閉證據。',
    '抽查 PMS 維護記錄、備件、測試照片/影片與船員訪談是否一致。',
    '對照預抵港口 PSC 重點，提前安排船岸聯合遠程預檢。',
  ]
  const baseShipboard = [
    '船長組織抵港前 PSC brief，逐項確認責任人、證據和整改時限。',
    '將所有臨時修理、失效設備、未完成缺陷主動報告公司並保留通信記錄。',
    '確認演習記錄、測試記錄與實際設備狀態一致，避免只具備紙面記錄。',
  ]
  const categoryMap: Record<string, { superintendent: string[]; shipboard: string[] }> = {
    '消防安全': {
      superintendent: ['抽查固定滅火、探火、消防泵、防火風閘、防火門和 A 級分隔照片/測試證據。'],
      shipboard: ['實測消防泵、探火警報、風閘/防火門，並由船員現場演示消防系統操作。'],
    },
    'ISM／安全管理': {
      superintendent: ['對多系統缺陷啟動 SMS 有效性審查，確認船岸責任和資源支持。'],
      shipboard: ['船長檢查缺陷報告、風險評估、permit to work 和演習改進是否形成閉環。'],
    },
    '救生設備': {
      superintendent: ['要求提交救生艇/救助艇釋放裝置、登乘安排、艇機和電池的近期測試證據。'],
      shipboard: ['按清單檢查救生艇、救助艇、吊艇架、登乘梯、無線電救生設備和標識。'],
    },
    '航行安全': {
      superintendent: ['抽查 ECDIS/紙海圖更新、航次計劃、羅經差和航行燈維護閉環。'],
      shipboard: ['駕駛台團隊復核航次計劃、海圖更新、磁羅經/電羅經、信號燈和 BNWAS。'],
    },
    '防污染': {
      superintendent: ['核對 OWS/ODME/EGCS/油類留存與排放管路的測試、校驗和記錄。'],
      shipboard: ['檢查油水分離器、15ppm 警報、SOx 替代安排、油類記錄簿和排放閥封存。'],
    },
    'MLC／船員權益': {
      superintendent: ['確認工資、休息時間、伙食、醫療、遣返和投訴程序資料可供 PSC 查驗。'],
      shipboard: ['船員能說明工資支付、休息記錄、投訴渠道、伙食淡水和醫療安排。'],
    },
  }
  const superintendent = [...baseSuperintendent]
  const shipboard = [...baseShipboard]
  for (const category of categories) {
    superintendent.push(...(categoryMap[category]?.superintendent ?? [`針對 ${category} 類缺陷建立船岸專項核查。`]))
    shipboard.push(...(categoryMap[category]?.shipboard ?? [`船上逐項核對 ${category} 相關設備、記錄與船員熟悉程度。`]))
  }
  return { superintendent, shipboard }
}
