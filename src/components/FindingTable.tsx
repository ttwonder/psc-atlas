import { useEffect, useMemo, useRef, useState } from 'react'
import { Edit3, ExternalLink, Search, X } from 'lucide-react'
import type { Deficiency, FindingPriority, InspectionCase } from '../types'
import { priorityLabel, type FindingDraft } from '../lib/editorWorkflow'

interface FindingRow {
  caseItem: InspectionCase
  finding: Deficiency
  index: number
}

const FINDINGS_PER_PAGE = 20

export function paginateFindings<T>(items: T[], requestedPage: number, perPage = FINDINGS_PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const start = (page - 1) * perPage
  return { page, totalPages, items: items.slice(start, start + perPage) }
}

const keywordRules = [
  { label: '防火門', needles: ['fire door', 'fire doors', '防火門', '防火门'] },
  { label: '火警探測', needles: ['fire detection', 'fire detecting', 'fire alarm', '火警探測', '火警探测', '火災探測', '火灾探测'] },
  { label: '煙霧探測器', needles: ['smoke detector', 'smoke detectors', '煙霧探測器', '烟雾探测器'] },
  { label: '消防泵', needles: ['fire pump', 'fire pumps', '消防泵'] },
  { label: '應急消防泵', needles: ['emergency fire pump', 'emergency fire pumps', '應急消防泵', '应急消防泵'] },
  { label: '防火風閘', needles: ['fire damper', 'fire dampers', 'damper', 'dampers', '防火風閘', '防火风闸', '風閘', '风闸'] },
  { label: '速閉閥', needles: ['quick closing', 'quick-closing', 'quick closing valve', '速閉閥', '速闭阀'] },
  { label: 'CO2 系統', needles: ['co2', 'co₂', 'carbon dioxide', '二氧化碳'] },
  { label: '救生艇', needles: ['lifeboat', 'lifeboats', '救生艇'] },
  { label: '救助艇', needles: ['rescue boat', 'rescue boats', '救助艇'] },
  { label: '救生筏', needles: ['liferaft', 'life raft', 'liferafts', 'life rafts', '救生筏'] },
  { label: '登乘安排', needles: ['embarkation', 'boarding ladder', '登乘'] },
  { label: '應急發電機', needles: ['emergency generator', 'emergency generators', '應急發電機', '应急发电机'] },
  { label: '應急照明', needles: ['emergency lighting', 'emergency light', '應急照明', '应急照明'] },
  { label: 'blackout 測試', needles: ['blackout'] },
  { label: 'BNWAS', needles: ['bnwas'] },
  { label: 'VDR/S-VDR', needles: ['vdr', 's-vdr'] },
  { label: 'ECDIS', needles: ['ecdis'] },
  { label: '海圖', needles: ['chart', 'charts', 'enc', '海圖', '海图', '電子海圖', '电子海图'] },
  { label: '航次計劃', needles: ['voyage plan', 'passage plan', '航次計劃', '航次计划'] },
  { label: '油水分離器', needles: ['ows', 'oily water separator', 'oil water separator', '油水分離器', '油水分离器'] },
  { label: '15ppm 報警', needles: ['15 ppm', '15ppm', '15-ppm'] },
  { label: '生活污水裝置', needles: ['sewage', '生活污水', '污水處理', '污水处理'] },
  { label: '壓載水系統', needles: ['ballast water', 'bwms', 'bwts', '壓載水', '压载水'] },
  { label: '油類記錄簿', needles: ['oil record book', '油類記錄簿', '油类记录簿'] },
  { label: 'GMDSS', needles: ['gmdss'] },
  { label: 'INMARSAT-C', needles: ['inmarsat'] },
  { label: '證書', needles: ['certificate', 'certificates', '證書', '证书'] },
  { label: '船員熟悉', needles: ['crew', 'familiar', 'familiarization', '船員', '船员', '熟悉'] },
  { label: '演習', needles: ['drill', 'drills', '演習', '演习'] },
  { label: 'ISM', needles: ['ism', 'sms', 'safety management'] },
  { label: '工資', needles: ['wage', 'wages', 'salary', '工資', '工资'] },
  { label: '工時/休息', needles: ['rest hour', 'rest hours', 'work hour', 'hours of rest', '工時', '工时', '休息'] },
  { label: '風雨密', needles: ['weathertight', 'weather tight', '風雨密', '风雨密'] },
  { label: '水密', needles: ['watertight', 'water tight', '水密'] },
  { label: '艙蓋', needles: ['hatch cover', 'hatch covers', '艙蓋', '舱盖'] },
  { label: '腐蝕', needles: ['corrosion', 'corroded', '腐蝕', '腐蚀', '鏽', '锈'] },
  { label: '機艙', needles: ['engine room', 'machinery space', 'e/r', '機艙', '机舱'] },
  { label: '舵機', needles: ['steering gear', 's/g', '舵機', '舵机'] },
  { label: '氣體探測器', needles: ['gas detector', 'gas detectors', 'gas detection', '氣體探測', '气体探测'] },
  { label: '貨物繫固', needles: ['cargo securing', 'cargo secured', 'lashing', '貨物繫固', '货物系固'] },
] as const

function flattenFindings(cases: InspectionCase[]): FindingRow[] {
  return cases.flatMap((caseItem) =>
    caseItem.deficiencies.map((finding, index) => ({ caseItem, finding, index })),
  )
}

function evidenceLabel(level: InspectionCase['evidenceLevel']) {
  if (level === 'full-dossier') return '完整卷宗'
  if (level === 'narrative') return '深度敘事'
  if (level === 'index-only') return '只有索引'
  return '官方摘要'
}

function rowText(row: FindingRow) {
  const { caseItem, finding } = row
  return `${caseItem.date} ${caseItem.vessel} ${caseItem.imo} ${caseItem.region} ${caseItem.port} ${caseItem.source.authority} ${finding.code} ${finding.category} ${finding.original} ${finding.notes ?? ''} ${finding.sourceQuote ?? ''}`.toLocaleLowerCase()
}

function textMatchesKeyword(text: string, label: string) {
  const normalized = text.toLocaleLowerCase()
  const rule = keywordRules.find((item) => item.label === label)
  if (!rule) return normalized.includes(label.toLocaleLowerCase())
  return rule.needles.some((needle) => normalized.includes(needle.toLocaleLowerCase()))
}

function rowMatchesKeyword(row: FindingRow, label: string) {
  return textMatchesKeyword(rowText(row), label)
}

function buildKeywordTags(rows: FindingRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const text = rowText(row)
    for (const rule of keywordRules) {
      if (textMatchesKeyword(text, rule.label)) counts.set(rule.label, (counts.get(rule.label) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 28)
}

export const __findingKeywordTest = { textMatchesKeyword }

export function FindingTable({
  cases,
  onSelect,
  focusCaseId,
  globalQuery = '',
  categories = [],
  canEdit = false,
  onUpdateFinding,
}: {
  cases: InspectionCase[]
  onSelect: (item: InspectionCase) => void
  focusCaseId?: string | null
  globalQuery?: string
  categories?: string[]
  canEdit?: boolean
  onUpdateFinding?: (caseId: string, findingIndex: number, draft: FindingDraft) => void
}) {
  const [localQuery, setLocalQuery] = useState('')
  const [keyword, setKeyword] = useState('')
  const [editingKey, setEditingKey] = useState('')
  const [draftCode, setDraftCode] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftOriginal, setDraftOriginal] = useState('')
  const [draftObservedCondition, setDraftObservedCondition] = useState('')
  const [draftInspectorFinding, setDraftInspectorFinding] = useState('')
  const [draftDetentionReason, setDraftDetentionReason] = useState('')
  const [draftRequiredRectification, setDraftRequiredRectification] = useState('')
  const [draftReleaseCondition, setDraftReleaseCondition] = useState('')
  const [draftSourcePage, setDraftSourcePage] = useState('')
  const [draftSourceQuote, setDraftSourceQuote] = useState('')
  const [draftDetentionGround, setDraftDetentionGround] = useState<string>('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftPriority, setDraftPriority] = useState<FindingPriority>('low')
  const [draftNovel, setDraftNovel] = useState(false)
  const [page, setPage] = useState(1)
  const [permissionMessage, setPermissionMessage] = useState('')
  const rows = useMemo(() => flattenFindings(cases), [cases])
  const normalizedGlobal = globalQuery.trim().toLocaleLowerCase()
  const normalizedLocal = localQuery.trim().toLocaleLowerCase()
  const baseFilteredRows = useMemo(() => rows.filter((row) => {
    const text = rowText(row)
    return (!normalizedGlobal || text.includes(normalizedGlobal))
      && (!normalizedLocal || text.includes(normalizedLocal))
  }), [normalizedGlobal, normalizedLocal, rows])
  const keywordTags = useMemo(() => buildKeywordTags(baseFilteredRows), [baseFilteredRows])
  const filteredRows = useMemo(() => baseFilteredRows.filter((row) => {
    return !keyword || rowMatchesKeyword(row, keyword)
  }), [baseFilteredRows, keyword])
  const pagedRows = useMemo(() => paginateFindings(filteredRows, page), [filteredRows, page])
  const pageRows = pagedRows.items
  const focusedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPage(1)
  }, [normalizedGlobal, normalizedLocal, keyword, cases])

  useEffect(() => {
    if (page !== pagedRows.page) setPage(pagedRows.page)
  }, [page, pagedRows.page])

  useEffect(() => {
    if (!focusCaseId) return
    focusedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusCaseId, filteredRows.length])

  return (
    <div className="finding-list-wrap">
      <div className="finding-toolbar" aria-label="缺陷關鍵詞篩選">
        <label className="finding-search-field">
          <Search size={16} />
          <span className="sr-only">搜尋缺陷關鍵詞</span>
          <input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="搜尋缺陷原文、設備、代碼、港口，例如 fire door / lifeboat / 07105" />
        </label>
        {localQuery || keyword ? <button type="button" className="text-clear-button" onClick={() => { setLocalQuery(''); setKeyword('') }}><X size={14} />清除缺陷篩選</button> : null}
      </div>
      <div className="keyword-chip-help">高頻關鍵詞標籤；圓圈數字 = 目前上方篩選範圍內命中該設備/作業詞的缺陷項數。點擊後會用同一套同義詞規則篩選。</div>
      <div className="keyword-chip-list" aria-label="高頻缺陷關鍵詞">
        {keywordTags.map((item) => (
          <button key={item.label} type="button" className={keyword === item.label ? 'active' : ''} onClick={() => setKeyword((value) => value === item.label ? '' : item.label)}>
            {item.label}<span>{item.count}</span>
          </button>
        ))}
      </div>
      <div className="finding-result-count">顯示第 {pagedRows.page} / {pagedRows.totalPages} 頁，每頁 20 項；共 {filteredRows.length} / {rows.length} 項缺陷{keyword ? `｜關鍵詞：${keyword}` : ''}</div>
      {permissionMessage ? <div className="permission-note">{permissionMessage}</div> : null}
      <div className="finding-card-list">
        {pageRows.map(({ caseItem, finding, index }) => {
          const key = `${caseItem.id}-${finding.code}-${index}`
          const editing = editingKey === key
          return (
          <article
            key={key}
            ref={focusCaseId === caseItem.id && index === 0 ? focusedRef : undefined}
            className={`finding-card ${caseItem.evidenceLevel === 'index-only' ? 'index-only-finding' : ''} ${focusCaseId === caseItem.id ? 'selected' : ''} ${editing ? 'editing' : ''}`}
            onClick={() => { if (!editing) onSelect(caseItem) }}
            tabIndex={0}
            onKeyDown={(event) => { if (!editing && (event.key === 'Enter' || event.key === ' ')) onSelect(caseItem) }}
          >
            <div className="finding-card-meta">
              <strong>{caseItem.date}</strong>
              <span>{caseItem.vessel}</span>
              <small>IMO {caseItem.imo}</small>
            </div>
            <div className="finding-card-region">
              <span>{caseItem.region}</span>
              <small>{caseItem.port}</small>
              <code>{finding.code}</code>
              <b>{finding.category}</b>
              <span className={`priority-pill priority-${finding.priority ?? 'low'}`}>關注度：{priorityLabel(finding.priority)}</span>
              {finding.novel ? <span className="novel-pill">新穎</span> : null}
            </div>
            <div className="finding-card-copy">
              <p className="finding-original" lang="en">{finding.original}</p>
              {finding.notes ? <p className="finding-notes">備註：{finding.notes}</p> : null}
              {editing ? (
                <div className="finding-edit-form" onClick={(event) => event.stopPropagation()}>
                  <label>缺陷代碼<input value={draftCode} onChange={(event) => setDraftCode(event.target.value)} placeholder="例如 07105" /></label>
                  <label>官方原文<textarea value={draftOriginal} onChange={(event) => setDraftOriginal(event.target.value)} placeholder="保留/修訂官方 Form B 原文" /></label>
                  <label>分類
                    <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)}>
                      {Array.from(new Set([finding.category, ...categories])).map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>觀察狀態<input value={draftObservedCondition} onChange={(event) => setDraftObservedCondition(event.target.value)} placeholder="測試/現場觀察" /></label>
                  <label>檢查員認定<textarea value={draftInspectorFinding} onChange={(event) => setDraftInspectorFinding(event.target.value)} /></label>
                  <label>滯留理由<textarea value={draftDetentionReason} onChange={(event) => setDraftDetentionReason(event.target.value)} /></label>
                  <label>整改要求<textarea value={draftRequiredRectification} onChange={(event) => setDraftRequiredRectification(event.target.value)} /></label>
                  <label>解除條件<textarea value={draftReleaseCondition} onChange={(event) => setDraftReleaseCondition(event.target.value)} /></label>
                  <label>來源頁碼<input value={draftSourcePage} onChange={(event) => setDraftSourcePage(event.target.value)} placeholder="p. 3" /></label>
                  <label>來源摘錄<textarea value={draftSourceQuote} onChange={(event) => setDraftSourceQuote(event.target.value)} /></label>
                  <label>是否滯留依據<select value={draftDetentionGround} onChange={(event) => setDraftDetentionGround(event.target.value)}><option value="">未公開</option><option value="true">是</option><option value="false">否</option></select></label>
                  <label>關注度
                    <select value={draftPriority} onChange={(event) => setDraftPriority(event.target.value as FindingPriority)}>
                      <option value="low">低</option>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                    </select>
                  </label>
                  <label className="inline-check"><input type="checkbox" checked={draftNovel} onChange={(event) => setDraftNovel(event.target.checked)} /> 新穎，需要關注</label>
                  <label>備註<textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} placeholder="公司預防措施、需跟蹤的設備/程序、內部備註" /></label>
                </div>
              ) : null}
            </div>
            <div className="finding-card-actions">
              <span className={`ground-state ${finding.detentionGround === true ? 'yes' : 'unknown'}`}>{finding.detentionGround === true ? '滯留依據' : '未公開'}</span>
              <span className={`evidence-badge ${caseItem.evidenceLevel}`}>{evidenceLabel(caseItem.evidenceLevel)}</span>
              {editing && canEdit && onUpdateFinding ? <>
                <button className="text-button compact" type="button" onClick={(event) => { event.stopPropagation(); onUpdateFinding(caseItem.id, index, { code: draftCode, original: draftOriginal, category: draftCategory, observedCondition: draftObservedCondition, inspectorFinding: draftInspectorFinding, detentionReason: draftDetentionReason, requiredRectification: draftRequiredRectification, releaseCondition: draftReleaseCondition, sourcePage: draftSourcePage, sourceQuote: draftSourceQuote, detentionGround: draftDetentionGround === 'true' ? true : draftDetentionGround === 'false' ? false : null, notes: draftNotes, priority: draftPriority, novel: draftNovel }); setEditingKey('') }}>保存</button>
                <button className="text-button compact" type="button" onClick={(event) => { event.stopPropagation(); setEditingKey('') }}>取消</button>
              </> : <button className="text-button compact" type="button" onClick={(event) => { event.stopPropagation(); if (!canEdit || !onUpdateFinding) { setPermissionMessage('請先在「資料來源」頁用操作員帳號登入；只有 editor/owner 可以修改缺陷詳情。'); return } setPermissionMessage(''); setEditingKey(key); setDraftCode(finding.code); setDraftOriginal(finding.original); setDraftCategory(finding.category); setDraftObservedCondition(finding.observedCondition ?? ''); setDraftInspectorFinding(finding.inspectorFinding ?? ''); setDraftDetentionReason(finding.detentionReason ?? ''); setDraftRequiredRectification(finding.requiredRectification ?? ''); setDraftReleaseCondition(finding.releaseCondition ?? ''); setDraftSourcePage(finding.sourcePage ?? ''); setDraftSourceQuote(finding.sourceQuote ?? ''); setDraftDetentionGround(finding.detentionGround === true ? 'true' : finding.detentionGround === false ? 'false' : ''); setDraftNotes(finding.notes ?? ''); setDraftPriority(finding.priority ?? 'low'); setDraftNovel(Boolean(finding.novel)) }}><Edit3 size={13} />修改</button>}
              <a className="source-mini-link" href={caseItem.source.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                官方來源<ExternalLink size={13} />
              </a>
            </div>
          </article>
          )
        })}
      </div>
      {filteredRows.length > 20 ? <div className="finding-pagination pagination" aria-label="缺陷詳情分頁">
        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={pagedRows.page <= 1}>上一頁</button>
        <span>第 {pagedRows.page} / {pagedRows.totalPages} 頁</span>
        <button type="button" onClick={() => setPage((value) => Math.min(pagedRows.totalPages, value + 1))} disabled={pagedRows.page >= pagedRows.totalPages}>下一頁</button>
      </div> : null}
      {filteredRows.length === 0 ? <div className="empty-state"><strong>沒有符合條件的缺陷</strong><span>請放寬篩選條件或換一個關鍵詞。</span></div> : null}
    </div>
  )
}
