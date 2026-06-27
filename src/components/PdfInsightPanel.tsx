import { useMemo, useState } from 'react'
import { ExternalLink, FileText, Link, Trash2, Upload } from 'lucide-react'
import { pdfCandidateToDeficiencyDraft } from '../lib/editorWorkflow'
import { buildPdfInsights, type PdfInsights } from '../lib/pdfInsights'
import { buildPdfCoverage, buildPdfCoverageYearOptions, displayPdfTitle, filterPdfSources, getPdfReviewMeta, getPdfSources, paginatePdfSources, PDF_COVERAGE_PERIODS, PDF_COVERAGE_UNMARKED, splitPdfCoverage, type PdfReviewDraft, type PdfSourceFilters } from '../lib/pdfSources'
import type { PdfReferenceLevel, SourceBookmark } from '../types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

const referenceLabels: Record<PdfReferenceLevel, string> = { low: '低', medium: '中', high: '高' }

export function PdfInsightPanel({ sources = [], onDeleteSource, onMarkPdfNotNeeded, onUpdatePdfMeta }: {
  sources?: SourceBookmark[]
  onDeleteSource?: (id: string, reason?: string) => void | Promise<void>
  onMarkPdfNotNeeded?: (id: string) => void | Promise<void>
  onUpdatePdfMeta?: (id: string, draft: PdfReviewDraft) => void | Promise<void>
}) {
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('尚未上傳 PDF')
  const [pdfUrl, setPdfUrl] = useState('')
  const [urlTaskMessage, setUrlTaskMessage] = useState('尚未提交 PDF URL 任務')
  const [insights, setInsights] = useState<PdfInsights | null>(null)
  const [textPreview, setTextPreview] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState('all')
  const [attentionFilter, setAttentionFilter] = useState<PdfSourceFilters['attention']>('all')
  const [referenceFilter, setReferenceFilter] = useState<PdfReferenceLevel | 'all'>('all')
  const [coverageYearFilter, setCoverageYearFilter] = useState('all')
  const [coveragePeriodFilter, setCoveragePeriodFilter] = useState('all')
  const [page, setPage] = useState(1)

  const pdfSources = useMemo(() => getPdfSources(sources), [sources])
  const authorityOptions = useMemo(() => Array.from(new Set(pdfSources.map((item) => item.authority || item.sourceType || '未標記來源'))).sort(), [pdfSources])
  const coverageYearOptions = useMemo(() => buildPdfCoverageYearOptions(2024, 2100), [])
  const coveragePeriodOptions = useMemo(() => [PDF_COVERAGE_UNMARKED, ...PDF_COVERAGE_PERIODS], [])
  const filteredSources = useMemo(() => filterPdfSources(pdfSources, { authority: authorityFilter, attention: attentionFilter, referenceLevel: referenceFilter, coverage: 'all', coverageYear: coverageYearFilter, coveragePeriod: coveragePeriodFilter }), [attentionFilter, authorityFilter, coveragePeriodFilter, coverageYearFilter, pdfSources, referenceFilter])
  const pageData = useMemo(() => paginatePdfSources(filteredSources, page, 20), [filteredSources, page])
  const deficiencyDrafts = useMemo(() => insights?.deficiencyCandidates.map((item, index) => pdfCandidateToDeficiencyDraft(item, pdfUrl || fileName || 'uploaded-pdf', index + 1)) ?? [], [fileName, insights, pdfUrl])

  function updateFilter(run: () => void) {
    run()
    setPage(1)
  }

  async function extractPdf(data: ArrayBuffer, label: string) {
    setFileName(label)
    setStatus('正在讀取 PDF 文字…')
    setInsights(null)
    setTextPreview('')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const pdf = await pdfjs.getDocument({ data }).promise
    const pageTexts: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const pageItem = await pdf.getPage(pageNumber)
      const content = await pageItem.getTextContent()
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ')
      pageTexts.push(`--- Page ${pageNumber} ---\n${text}`)
    }
    const fullText = pageTexts.join('\n')
    setTextPreview(fullText.slice(0, 3000))
    setInsights(buildPdfInsights(fullText))
    setStatus(`已讀取 ${pdf.numPages} 頁；已完成初步提煉。`)
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    try {
      await extractPdf(await file.arrayBuffer(), file.name)
    } catch (error) {
      setStatus(`PDF 讀取失敗：${error instanceof Error ? error.message : String(error)}。如果是掃描件，需要 OCR 後再上傳文字版 PDF。`)
    }
  }

  async function extractPdfUrl() {
    const url = pdfUrl.trim()
    if (!url) return
    setUrlTaskMessage('正在嘗試直接下載並提煉 PDF URL……')
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await extractPdf(await response.arrayBuffer(), url.split('/').pop() || url)
      setUrlTaskMessage('已直接讀取 PDF URL 並完成初步提煉。若官方站被 CORS 阻止，需後端代下載。')
    } catch (error) {
      setUrlTaskMessage(`瀏覽器無法直接讀取此 PDF：${error instanceof Error ? error.message : String(error)}。通常是官方站 CORS/防盜鏈限制；仍可先保存這個在線 PDF 原始網址，必要時再人工打開。`)
    }
  }

  function registerPdfUrlTask() {
    const url = pdfUrl.trim()
    if (!url) return
    if (!/\.pdf($|[?#])/i.test(url)) {
      setUrlTaskMessage('這個 URL 看起來不像 PDF；如確實是 PDF，請先確認鏈接能直接打開 PDF 文件。')
      return
    }
    setUrlTaskMessage(`已記錄在線 PDF 原始網址：${url}。目前先不做網盤自動歸檔，後續需要時再接入後端保存。`)
  }

  return (
    <div className="pdf-data-page">
      <section className="panel pdf-data-hero">
        <div>
          <p className="eyebrow">ONLINE PDF MANAGER</p>
          <h2>在線 PDF 管理</h2>
          <p>集中保存官方在線 PDF 原始網址、來源說明、備註與辨識重點；暫不做網盤自動歸檔。</p>
        </div>
        <label className="pdf-upload-button">
          <Upload size={16} />上傳 PDF 辨識
          <input type="file" accept="application/pdf" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
      </section>

      <section className="panel pdf-command-card">
        <div className="pdf-status compact"><FileText size={16} /><span>{fileName ? `${fileName}｜` : ''}{status}</span></div>
        <div className="pdf-url-row">
          <label><Link size={14} />在線 PDF 原始網址<input value={pdfUrl} onChange={(event) => setPdfUrl(event.target.value)} placeholder="https://official-site/.../report.pdf" /></label>
          <button className="primary-button" type="button" onClick={extractPdfUrl}>讀取並提煉</button>
          <button className="export-button" type="button" onClick={registerPdfUrlTask}>記錄網址</button>
        </div>
        <small>{urlTaskMessage}</small>
      </section>

      <section className="panel pdf-source-list-panel">
        <header className="pdf-list-header">
          <div>
            <p className="eyebrow">COLLECTED PDFS</p>
            <h3>已採集在線 PDF</h3>
            <p>每頁最多 20 個；可按來源、是否需關注、參考意義與覆蓋範圍篩選。</p>
          </div>
          <span>{filteredSources.length} / {pdfSources.length} 個</span>
        </header>

        <div className="pdf-filter-row">
          <label>地方 / 來源<select value={authorityFilter} onChange={(event) => updateFilter(() => setAuthorityFilter(event.target.value))}><option value="all">全部來源</option>{authorityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>是否需要關注<select value={attentionFilter} onChange={(event) => updateFilter(() => setAttentionFilter(event.target.value as PdfSourceFilters['attention']))}><option value="all">全部</option><option value="attention">需關注</option><option value="normal">未標記關注</option></select></label>
          <label>參考意義<select value={referenceFilter} onChange={(event) => updateFilter(() => setReferenceFilter(event.target.value as PdfReferenceLevel | 'all'))}><option value="all">全部</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
          <label>覆蓋年份<select value={coverageYearFilter} onChange={(event) => updateFilter(() => setCoverageYearFilter(event.target.value))}><option value="all">全部年份</option>{coverageYearOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>覆蓋期間<select value={coveragePeriodFilter} onChange={(event) => updateFilter(() => setCoveragePeriodFilter(event.target.value))}><option value="all">全部期間</option>{coveragePeriodOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>

        <div className="pdf-table-list">
          {pageData.items.length ? pageData.items.map((item) => {
            const meta = getPdfReviewMeta(item)
            const coverageParts = splitPdfCoverage(meta.coverage)
            const authority = item.authority || item.sourceType || '未標記來源'
            return (
              <article key={item.id} className={`pdf-list-row ${meta.needsAttention ? 'needs-attention' : ''}`}>
                <div className="pdf-list-main">
                  <strong>{displayPdfTitle(item)}</strong>
                  <span>{authority} · {item.status ?? 'new'} · 參考意義：{referenceLabels[meta.referenceLevel]} · 覆蓋：{meta.coverage}</span>
                  {item.notes ? <small>備註：{item.notes}</small> : null}
                  {item.tags?.length ? <small>標籤：{item.tags.join('、')}</small> : null}
                  <p className="pdf-online-line"><Link size={13} /><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p>
                  {item.storageUrl ? <p className="pdf-storage-line">備用歸檔地址：{item.storageUrl}</p> : null}
                </div>
                <div className="pdf-review-controls">
                  <button className={meta.needsAttention ? 'primary-button compact' : 'text-button compact'} type="button" onClick={() => onUpdatePdfMeta?.(item.id, { needsAttention: !meta.needsAttention })}>{meta.needsAttention ? '已關注' : '需關注'}</button>
                  <label>參考意義<select value={meta.referenceLevel} onChange={(event) => onUpdatePdfMeta?.(item.id, { referenceLevel: event.target.value as PdfReferenceLevel })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
                  <label>覆蓋年份<select value={coverageParts.year} onChange={(event) => onUpdatePdfMeta?.(item.id, { coverage: buildPdfCoverage(event.target.value, coverageParts.period) })}>{coverageYearOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label>覆蓋期間<select value={coverageParts.period} onChange={(event) => onUpdatePdfMeta?.(item.id, { coverage: buildPdfCoverage(coverageParts.year, event.target.value) })}>{coveragePeriodOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                </div>
                <div className="pdf-list-actions">
                  <a href={item.url} target="_blank" rel="noreferrer">打開 <ExternalLink size={12} /></a>
                  {onDeleteSource ? <button className="danger-button compact" type="button" onClick={() => onDeleteSource(item.id, 'PDF 資料頁刪除')}><Trash2 size={12} />刪除</button> : null}
                  {onMarkPdfNotNeeded ? <button className="text-button compact" type="button" onClick={() => onMarkPdfNotNeeded(item.id)}>不需要</button> : null}
                </div>
              </article>
            )
          }) : <p className="panel-hint">目前沒有符合篩選條件的 PDF。可放寬篩選或到資料來源新增網址備忘。</p>}
        </div>

        <footer className="pdf-pagination">
          <button className="text-button compact" type="button" disabled={pageData.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一頁</button>
          <span>第 {pageData.page} / {pageData.totalPages} 頁，每頁最多 20 個</span>
          <button className="text-button compact" type="button" disabled={pageData.page >= pageData.totalPages} onClick={() => setPage((value) => Math.min(pageData.totalPages, value + 1))}>下一頁</button>
        </footer>
      </section>

      {insights ? (
        <section className="panel pdf-insight-panel">
          <header>
            <div>
              <p className="eyebrow">AUTO RECOGNITION</p>
              <h3>本次上傳 / URL PDF 辨識結果</h3>
            </div>
          </header>
          <div className="pdf-insight-grid compact">
            <article>
              <h3>自動摘要</h3>
              <ul>{insights.summaryBullets.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <h3>高頻設備/管理詞</h3>
              <div className="pdf-keywords">{insights.keywordTrends.map((item) => <span key={item.keyword}>{item.keyword}<b>{item.count}</b></span>)}</div>
            </article>
            <article className="pdf-candidates">
              <h3>疑似具體滯留描述</h3>
              <ol>{insights.deficiencyCandidates.map((item, index) => <li key={`${index}-${item}`} lang="en">{item}</li>)}</ol>
            </article>
            <article className="pdf-candidates">
              <h3>候選滯留草稿</h3>
              <ol>{deficiencyDrafts.map((item, index) => <li key={`${index}-${item.original}`}><code>{item.category}</code><span lang="en">{item.original}</span><small>{item.sourcePage ?? ''} {item.priority ? `｜初判關注度：${item.priority}` : ''}</small></li>)}</ol>
            </article>
            <article className="pdf-preview">
              <h3>文字預覽</h3>
              <pre>{textPreview}</pre>
            </article>
          </div>
        </section>
      ) : null}

      <aside className="pdf-storage-note panel">
        <strong>目前策略：只管理在線 PDF 原始網址</strong>
        <p>現階段不自動下載、不保存到網盤；網站只記錄官方 PDF URL、來源、備註與辨識結果。若官方 PDF 失效，之後再考慮接入 Cloudflare R2、Supabase Storage 或 Google Drive 做備用歸檔。</p>
      </aside>
    </div>
  )
}
