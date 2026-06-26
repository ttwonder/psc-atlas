import type { InspectionCase } from '../types'

interface CaseTableProps {
  cases: InspectionCase[]
  selectedId: string | null
  onSelect: (item: InspectionCase) => void
}

function defectPreview(item: InspectionCase) {
  const concrete = item.deficiencies
    .filter((entry) => entry.category !== '索引資料')
    .slice(0, 2)
    .map((entry) => entry.original)
  if (!concrete.length) return '此來源只提供近期滯留索引，未公開逐項缺陷內容。'
  return concrete.join('；')
}

function evidenceLabel(item: InspectionCase) {
  if (item.evidenceLevel === 'narrative') return '完整敘事'
  if (item.evidenceLevel === 'full-dossier') return '完整卷宗'
  if (item.evidenceLevel === 'index-only') return '索引'
  return '官方摘要'
}

export function CaseTable({ cases, selectedId, onSelect }: CaseTableProps) {
  return (
    <div className="case-card-list" aria-label="PSC 案例總清單">
      {cases.map((item) => (
        <article
          key={item.id}
          className={`case-card-row ${selectedId === item.id ? 'selected' : ''} ${item.status === 'detained' ? 'detained-row' : ''}`}
          onClick={() => onSelect(item)}
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(item) }}
        >
          <div className="case-card-main">
            <button className="row-jump-button" type="button" onClick={(event) => { event.stopPropagation(); onSelect(item) }}>{item.vessel}</button>
            <span>IMO {item.imo} · {item.flagEmoji} {item.flag}</span>
          </div>
          <div className="case-card-meta">
            <strong>{item.region}</strong>
            <span>{item.source.authority}</span>
            <small>{item.date} · {item.port}</small>
          </div>
          <p className="case-card-summary">{item.shortSummary}</p>
          <p className="case-card-defects" lang="en">{defectPreview(item)}</p>
          <div className="case-card-badges">
            <span>{item.deficiencyCount || item.deficiencies.length} 缺陷</span>
            <span>{item.detentionGroundCount} 滯留依據</span>
            <span className={`evidence-badge ${item.evidenceLevel}`}>{evidenceLabel(item)}</span>
          </div>
        </article>
      ))}
      {cases.length === 0 ? <div className="empty-state"><strong>沒有符合條件的案例</strong><span>請放寬篩選條件後再試。</span></div> : null}
    </div>
  )
}
