import { AlertTriangle, BookOpenText, Building2, CalendarDays, ExternalLink, FileCheck2, FileText, MapPin, ShipWheel, X } from 'lucide-react'
import type { Deficiency, InspectionCase } from '../types'

function CompactDeficiency({ item }: { item: Deficiency }) {
  return (
    <li className="deficiency-item">
      <span className="deficiency-icon"><FileText size={20} strokeWidth={1.8} /></span>
      <span className="deficiency-copy"><strong>{item.category}</strong><small>{item.translation}</small></span>
      <code>{item.code}</code>
    </li>
  )
}

function DeficiencyEvidence({ item, index }: { item: Deficiency; index: number }) {
  return (
    <article className="evidence-record" id={`deficiency-${index + 1}`}>
      <header><span className="record-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.category}</strong><code>{item.code}</code></div><span className={`ground-state ${item.detentionGround === true ? 'yes' : 'unknown'}`}>{item.detentionGround === true ? '滯留依據' : '個別判定未公開'}</span></header>
      <dl>
        <div><dt>官方原文</dt><dd lang="en">{item.original}</dd></div>
        <div><dt>中文整理</dt><dd>{item.translation}</dd></div>
        {item.inspectorFinding ? <div><dt>檢查員認定</dt><dd>{item.inspectorFinding}</dd></div> : null}
        {item.detentionReason ? <div><dt>滯留理由</dt><dd>{item.detentionReason}</dd></div> : null}
        {item.requiredRectification ? <div><dt>整改要求</dt><dd>{item.requiredRectification}</dd></div> : null}
        {item.releaseCondition ? <div><dt>解除情況</dt><dd>{item.releaseCondition}</dd></div> : null}
        {item.sourceQuote ? <div><dt>來源摘錄</dt><dd>{item.sourceQuote}{item.sourcePage ? `（${item.sourcePage}）` : ''}</dd></div> : null}
        {item.observedCondition ? <div><dt>證據說明</dt><dd>{item.observedCondition}</dd></div> : null}
      </dl>
    </article>
  )
}

interface CaseDetailProps { item: InspectionCase | null; expanded: boolean; onClose: () => void; onExpand: () => void }

export function CaseDetail({ item, expanded, onClose, onExpand }: CaseDetailProps) {
  if (!item) return <aside className="detail-panel detail-empty"><ShipWheel size={30} /><p>選擇一筆案例查看檢查詳情</p></aside>
  return (
    <aside className={`detail-panel ${expanded ? 'expanded' : ''}`} aria-label={`${item.vessel} 案例詳情`}>
      <button className="icon-button close-detail" type="button" onClick={expanded ? onExpand : onClose} aria-label="關閉詳情"><X size={20} /></button>
      <header className="dossier-heading">
        <div><p className="dossier-label">{expanded ? 'PSC CASE DOSSIER' : item.source.sourceType}</p><h2>{item.vessel}</h2><p>IMO {item.imo}</p></div>
        {expanded ? <a className="source-button" href={item.source.url} target="_blank" rel="noreferrer">查看官方來源<ExternalLink size={16} /></a> : null}
      </header>
      <div className="meta-line"><span>{item.flagEmoji} {item.flag}</span><span><Building2 size={16} />{item.region}</span><span><FileCheck2 size={16} />{item.evidenceLevel === 'narrative' ? '完整敘事證據' : item.evidenceLevel === 'full-dossier' ? '完整卷宗' : '官方月報摘要'}</span></div>
      <strong className={`detail-status ${item.status}`}>{item.status === 'detained' ? '報告截止時仍在滯留' : item.status === 'released' ? '已解除滯留' : '無滯留'}</strong>
      <section className="quick-summary"><h3>快速摘要</h3><p>{item.shortSummary}</p></section>
      <dl className="inspection-meta">
        <div><dt><CalendarDays size={17} /></dt><dd>{item.date}{item.releaseDate ? ` → ${item.releaseDate}` : ''}</dd></div>
        <div><dt><MapPin size={17} /></dt><dd>{item.port} · {item.mou}</dd></div>
        <div><dt><FileText size={17} /></dt><dd>{item.deficiencyCount} 項缺失 · {item.detentionGroundCount} 項滯留依據</dd></div>
      </dl>

      {expanded ? (
        <div className="dossier-body">
          <section className="narrative-section"><div className="section-title"><BookOpenText size={19} /><div><h3>案例經過與處置</h3><p>依官方敘事整理，不補寫未公開事實</p></div></div>{item.narrative.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>
          <aside className="source-note"><AlertTriangle size={19} /><div><strong>證據邊界</strong><p>{item.evidenceNote}</p></div></aside>
          <section className="records-section"><div className="section-title"><FileText size={19} /><div><h3>逐項缺失證據</h3><p>官方原文、中文整理、檢查員認定、滯留理由與解除情況分欄保存</p></div></div><div className="records-list">{item.deficiencies.map((entry, index) => <DeficiencyEvidence item={entry} index={index} key={`${entry.code}-${index}`} />)}</div></section>
          <section className="case-facts"><h3>船舶與來源資料</h3><dl><div><dt>總噸</dt><dd>{item.gt ?? '來源未列明'}</dd></div><div><dt>公司</dt><dd>{item.company}</dd></div><div><dt>船級社</dt><dd>{item.classSociety}</dd></div><div><dt>來源發布</dt><dd>{item.source.publishedAt}</dd></div></dl><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title}<ExternalLink size={15} /></a></section>
        </div>
      ) : (
        <>
          <section className="deficiency-section"><h3>公開的具體缺失</h3><ul>{item.deficiencies.slice(0, 4).map((entry, index) => <CompactDeficiency item={entry} key={`${entry.code}-${index}`} />)}</ul>{item.deficiencies.length > 4 ? <p className="remaining-count">另有 {item.deficiencies.length - 4} 項已整理缺失</p> : null}</section>
          <button className="text-button" type="button" onClick={onExpand}>閱讀完整案例卷宗 →</button>
        </>
      )}
    </aside>
  )
}
