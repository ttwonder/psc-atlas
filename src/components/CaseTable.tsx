import type { InspectionCase } from '../types'

interface CaseTableProps {
  cases: InspectionCase[]
  selectedId: string | null
  onSelect: (item: InspectionCase) => void
}

function defectPreview(item: InspectionCase) {
  const concrete = item.deficiencies
    .filter((entry) => entry.category !== '索引資料')
    .slice(0, 3)
    .map((entry) => entry.original)
  if (!concrete.length) return '此來源只提供近期滯留索引，未公開逐項缺陷內容。'
  return concrete.join('；')
}

export function CaseTable({ cases, selectedId, onSelect }: CaseTableProps) {
  return (
    <div className="table-wrap">
      <table className="case-table">
        <thead><tr><th>船舶</th><th>地區/機關</th><th>檢查日期</th><th>滯留簡述</th><th>具體缺陷內容</th><th>缺失／滯留</th><th>證據深度</th></tr></thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.id} className={`${selectedId === item.id ? 'selected' : ''} ${item.status === 'detained' ? 'detained-row' : ''}`} onClick={() => onSelect(item)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(item) }}>
              <td className="vessel-name"><button className="row-jump-button" type="button" onClick={(event) => { event.stopPropagation(); onSelect(item) }}>{item.vessel}</button><span className="flag-line">IMO {item.imo} · {item.flagEmoji} {item.flag}</span></td>
              <td>{item.region}<span className="mou-line">{item.source.authority}</span></td>
              <td>{item.date}<span className="mou-line">{item.port}</span></td>
              <td className="summary-cell">{item.shortSummary}</td>
              <td className="defect-preview-cell">{defectPreview(item)}</td>
              <td><strong>{item.deficiencyCount || item.deficiencies.length}</strong><span className="mou-line">{item.detentionGroundCount} 項依據</span></td>
              <td><span className={`evidence-badge ${item.evidenceLevel}`}>{item.evidenceLevel === 'narrative' ? '完整敘事' : item.evidenceLevel === 'full-dossier' ? '完整卷宗' : item.evidenceLevel === 'index-only' ? '索引' : '官方摘要'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {cases.length === 0 ? <div className="empty-state"><strong>沒有符合條件的案例</strong><span>請放寬篩選條件後再試。</span></div> : null}
    </div>
  )
}
