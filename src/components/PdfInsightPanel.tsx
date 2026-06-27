import { useMemo, useState } from 'react'
import { CheckSquare, ExternalLink, FileText, Link, Trash2, Upload } from 'lucide-react'
import { pdfCandidateToDeficiencyDraft } from '../lib/editorWorkflow'
import { buildPdfInsights, type PdfInsights } from '../lib/pdfInsights'
import { buildPdfSourceBrief, displayPdfTitle, getPdfSelectionKey, getPdfSources } from '../lib/pdfSources'
import type { SourceBookmark } from '../types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

export function PdfInsightPanel({ sources = [], onDeleteSource, onMarkPdfNotNeeded }: { sources?: SourceBookmark[]; onDeleteSource?: (id: string, reason?: string) => void | Promise<void>; onMarkPdfNotNeeded?: (id: string) => void | Promise<void> }) {
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('尚未上傳 PDF')
  const [pdfUrl, setPdfUrl] = useState('')
  const [urlTaskMessage, setUrlTaskMessage] = useState('尚未提交 PDF URL 任務')
  const [insights, setInsights] = useState<PdfInsights | null>(null)
  const [textPreview, setTextPreview] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const pdfSources = useMemo(() => getPdfSources(sources), [sources])
  const selectedPdfSources = useMemo(() => pdfSources.filter((item) => selectedIds.includes(getPdfSelectionKey(item))), [pdfSources, selectedIds])
  const sourceBriefs = useMemo(() => selectedPdfSources.map(buildPdfSourceBrief), [selectedPdfSources])
  const deficiencyDrafts = useMemo(() => insights?.deficiencyCandidates.map((item, index) => pdfCandidateToDeficiencyDraft(item, pdfUrl || fileName || 'uploaded-pdf', index + 1)) ?? [], [fileName, insights, pdfUrl])

  function togglePdf(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
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
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
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

      <section className="pdf-workbench">
        <article className="panel pdf-source-picker">
          <header>
            <div>
              <p className="eyebrow">COLLECTED PDFS</p>
              <h3>已採集在線 PDF</h3>
            </div>
            <span>{pdfSources.length} 個</span>
          </header>
          <div className="pdf-check-list">
            {pdfSources.length ? pdfSources.map((item) => {
              const selectionKey = getPdfSelectionKey(item)
              const checked = selectedIds.includes(selectionKey)
              return (
                <article key={item.id} className={checked ? 'pdf-check-item selected' : 'pdf-check-item'}>
                  <label className="pdf-check-toggle">
                    <input type="checkbox" checked={checked} onChange={() => togglePdf(selectionKey)} />
                    <div className="pdf-check-copy">
                      <strong>{displayPdfTitle(item)}</strong>
                      <span>{item.authority ?? item.sourceType} · {item.status ?? 'new'}</span>
                      <small>{item.storageUrl ? '已有備用歸檔地址' : '使用在線 PDF 原始網址'}</small>
                    </div>
                  </label>
                  <div className="pdf-check-actions">
                    <a href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>打開 <ExternalLink size={12} /></a>
                    {onDeleteSource ? <button className="danger-button compact" type="button" onClick={(event) => { event.stopPropagation(); onDeleteSource(item.id, 'PDF 資料頁刪除') }}><Trash2 size={12} />刪除</button> : null}
                    {onMarkPdfNotNeeded ? <button className="text-button compact pdf-not-needed-button" type="button" onClick={(event) => { event.stopPropagation(); onMarkPdfNotNeeded(item.id) }}>不需要</button> : null}
                  </div>
                </article>
              )
            }) : <p className="panel-hint">目前來源清單中沒有識別到 PDF。可在本頁貼 PDF URL 或到資料來源新增網址備忘。</p>}
          </div>
        </article>

        <article className="panel pdf-selected-summary">
          <header>
            <div>
              <p className="eyebrow">SELECTED PDF BRIEF</p>
              <h3>勾選 PDF 的來源與重點</h3>
            </div>
            <CheckSquare size={18} />
          </header>
          {sourceBriefs.length ? sourceBriefs.map((brief) => (
            <section key={brief.id} className="pdf-brief-card">
              <div className="pdf-brief-title">
                <strong>{brief.title}</strong>
                <a href={brief.url} target="_blank" rel="noreferrer">打開 PDF <ExternalLink size={12} /></a>
              </div>
              <ul>{brief.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="pdf-online-line"><Link size={13} /><a href={brief.url} target="_blank" rel="noreferrer">{brief.url}</a></p>{brief.storageUrl ? <p className="pdf-storage-line">備用歸檔地址：{brief.storageUrl}</p> : null}
            </section>
          )) : <div className="empty-state compact"><strong>請先勾選左側 PDF</strong><span>勾選後，這裡會用清單形式顯示 PDF 大致介紹、來源、狀態、標籤、備註與在線原始網址。</span></div>}
        </article>
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
