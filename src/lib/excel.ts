import type { InspectionCase, OfficialSourceGuide, SourceBookmark } from '../types'
import { buildRegionalReport } from './report'

type CellValue = string | number | null | undefined

type Sheet = {
  name: string
  rows: Record<string, CellValue>[]
}

export function exportCasesWorkbook(cases: InspectionCase[], sources: SourceBookmark[], sourceGuides: OfficialSourceGuide[] = [], filename = 'psc-detention-dossiers.xls') {
  const sheets = buildWorkbookSheets(cases, sources, sourceGuides)
  const workbookXml = buildSpreadsheetXml(sheets)
  downloadTextFile(workbookXml, filename.endsWith('.xls') ? filename : filename.replace(/\.xlsx?$/i, '.xls'), 'application/vnd.ms-excel;charset=utf-8')
}

export function exportWorkbookSheetsForTest(cases: InspectionCase[], sources: SourceBookmark[], sourceGuides: OfficialSourceGuide[] = []) {
  return buildWorkbookSheets(cases, sources, sourceGuides)
}

function buildWorkbookSheets(cases: InspectionCase[], sources: SourceBookmark[], sourceGuides: OfficialSourceGuide[] = []) {
  const sheets: Sheet[] = [
    {
      name: '案例總清單',
      rows: cases.map((item) => ({
        船舶: item.vessel,
        IMO: item.imo,
        船旗: item.flag,
        地區: item.region,
        MOU: item.mou,
        港口: item.port,
        檢查日期: item.date,
        解除日期: item.releaseDate ?? '',
        狀態: item.status,
        簡短滯留原因: item.shortSummary,
        滯留數: item.deficiencyCount,
        滯留依據數: item.detentionGroundCount,
        證據深度: item.evidenceLevel,
        主管機關: item.source.authority,
        來源: item.source.url,
      })),
    },
    {
      name: '滯留詳情清單',
      rows: cases.flatMap((item) => item.deficiencies.map((deficiency, index) => ({
        案例ID: item.id,
        船舶: item.vessel,
        IMO: item.imo,
        序號: index + 1,
        滯留代碼: deficiency.code,
        分類: deficiency.category,
        官方原文: deficiency.original,
        操作備註: deficiency.notes ?? '',
        關注度: deficiency.priority === 'high' ? '高' : deficiency.priority === 'medium' ? '中' : deficiency.priority === 'low' ? '低' : '',
        是否新穎: deficiency.novel ? 'Yes' : 'No',
        檢查員認定: deficiency.inspectorFinding ?? '',
        滯留理由: deficiency.detentionReason ?? '',
        整改要求: deficiency.requiredRectification ?? '',
        解除條件: deficiency.releaseCondition ?? '',
        是否滯留依據: deficiency.detentionGround === true ? 'Yes' : deficiency.detentionGround === false ? 'No' : '未公開',
        來源頁碼: deficiency.sourcePage ?? '',
        來源摘錄: deficiency.sourceQuote ?? deficiency.original,
        來源URL: item.source.url,
      }))),
    },
    {
      name: '網址清單',
      rows: sources.map((item) => ({
        標題: item.title,
        主管機關: item.authority ?? '',
        類型: item.sourceType,
        URL: item.url,
        備註: item.notes ?? '',
        是否已刪除: item.deletedAt ? 'Yes' : 'No',
        刪除時間: item.deletedAt ?? '',
        刪除原因: item.deleteReason ?? '',
        更新時間: item.updatedAt ?? '',
        手動添加: item.manual ? 'Yes' : 'No',
        添加時間: item.addedAt,
      })),
    },
  ]

  if (sourceGuides.length) {
    sheets.push({
      name: '代表性來源地圖',
      rows: sourceGuides.map((item) => ({
        地區: item.region,
        主管機關: item.authority,
        來源名稱: item.title,
        URL: item.url,
        證據層級: item.evidenceLevel,
        更新頻率: item.updateCadence,
        最佳用途: item.bestUse,
        證據邊界: item.limitations,
        下一步: item.nextAction,
        自動抓取狀態: item.autoFetch,
        '抓取/更新說明': item.refreshScope,
      })),
    })
  }

  sheets.push({ name: '總結報告', rows: [{ 報告: buildRegionalReport(cases, '全部地區', 'all') }] })
  return sheets
}

export function buildSpreadsheetXml(sheets: Sheet[]) {
  const worksheets = sheets.map((sheet) => {
    const headers = Array.from(new Set(sheet.rows.flatMap((row) => Object.keys(row))))
    const rows = [headers, ...sheet.rows.map((row) => headers.map((header) => row[header]))]
    return `<Worksheet ss:Name="${xmlAttr(sheet.name.slice(0, 31))}"><Table>${rows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xmlText(cell ?? '')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">${worksheets}</Workbook>`
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function xmlText(value: CellValue) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xmlAttr(value: string) {
  return xmlText(value).replace(/"/g, '&quot;')
}
