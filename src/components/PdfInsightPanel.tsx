import { useMemo, useState } from 'react'
import { Archive, CheckSquare, ExternalLink, FileText, Link, Upload } from 'lucide-react'
import { pdfCandidateToDeficiencyDraft } from '../lib/editorWorkflow'
import { buildPdfInsights, type PdfInsights } from '../lib/pdfInsights'
import { buildPdfSourceBrief, getPdfSources } from '../lib/pdfSources'
import type { SourceBookmark } from '../types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

export function PdfInsightPanel({ sources = [] }: { sources?: SourceBookmark[] }) {
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('尚未上傳 PDF')
  const [pdfUrl, setPdfUrl] = useState('')
  const [urlTaskMessage, setUrlTaskMessage] = useState('尚未提交 PDF URL 任務')
  const [insights, setInsights] = useState<PdfInsights | null>(null)
  const [textPreview, setTextPreview] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const pdfSources = useMemo(() => getPdfSources(sources), [sources])
  const selectedPdfSources = useMemo(() => pdfSources.filter((item) => selectedIds.includes(item.id)), [pdfSources, selectedIds])
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
      setUrlTaskMessage(`瀏覽器無法直接讀取此 PDF：${error instanceof Error ? error.message : String(error)}。通常是 CORS/防盜鏈限制；需要 Vercel 後端 /api/pdf-ingest 代下載、歸檔和提煉。`)
    }
  }

  function registerPdfUrlTask() {
    const url = pdfUrl.trim()
    if (!url) return
    if (!/\.pdf($|[?#])/i.test(url)) {
      setUrlTaskMessage('這個 URL 看起來不像 PDF；如確實是 PDF，請先確認鏈接能直接打開 PDF 文件。')
      return
    }
    setUrlTaskMessage(`已記錄 PDF URL 任務：${url}。真正自動下載到網盤需由後端 /api/pdf-ingest 用服務端密鑰處理。`)
  }

  return (
    <div className="pdf-data-page">
      <section className="panel pdf-data-hero">
        <div>
          <p className="eyebrow">PDF DATA CENTER</p>
          <h2>PDF 資料</h2>
          <p>集中管理 PDF 上傳、URL 任務、辨識提煉、資料狀態與網盤/歸檔地址。資料來源頁不再分散放 PDF 功能。</p>
        </div>
        <label className="pdf-upload-button">
          <Upload size={16} />上傳 PDF 辨識
          <input type="file" accept="application/pdf" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
      </section>

      <section className="panel pdf-command-card">
        <div className="pdf-status compact"><FileText size={16} /><span>{fileName ? `${fileName}｜` : ''}{status}</span></div>
        <div className="pdf-url-row">
          <label><Link size={14} />PDF URL<input value={pdfUrl} onChange={(event) => setPdfUrl(event.target.value)} placeholder="https://.../report.pdf" /></label>
          <button className="primary-button" type="button" onClick={extractPdfUrl}>讀取並提煉</button>
          <button className="export-button" type="button" onClick={registerPdfUrlTask}>記錄任務</button>
        </div>
        <small>{urlTaskMessage}</small>
      </section>

      <section className="pdf-workbench">
        <article className="panel pdf-source-picker">
          <header>
            <div>
              <p className="eyebrow">COLLECTED PDFS</p>
              <h3>已獲取 / 已採集 PDF</h3>
            </div>
            <span>{pdfSources.length} 個</span>
          </header>
          <div className="pdf-check-list">
            {pdfSources.length ? pdfSources.map((item) => {
              const checked = selectedIds.includes(item.id)
              return (
                <label key={item.id} className={checked ? 'selected' : ''}>
                  <input type="checkbox" checked={checked} onChange={() => togglePdf(item.id)} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.authority ?? item.sourceType} · {item.status ?? 'new'}</span>
                    <small>{item.storageUrl ? '已有網盤/歸檔地址' : '未填網盤地址'}</small>
                  </div>
                </label>
              )
            }) : <p className="panel-hint">目前來源清單中沒有識別到 PDF。可在本頁貼 PDF URL 或到資料來源新增網址備忘。</p>}
          </div>
        </article>

        <article className="panel pdf-selected-summary">
          <header>
            <div>
              <p className="eyebrow">SELECTED PDF BRIEF</p>
              <h3>勾選 PDF 的介紹與重點</h3>
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
              <p className="pdf-storage-line"><Archive size={13} />{brief.storageUrl}</p>
            </section>
          )) : <div className="empty-state compact"><strong>請先勾選左側 PDF</strong><span>勾選後，這裡會用清單形式顯示 PDF 大致介紹、狀態、標籤、備註與網盤地址。</span></div>}
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
              <h3>疑似具體缺陷描述</h3>
              <ol>{insights.deficiencyCandidates.map((item, index) => <li key={`${index}-${item}`} lang="en">{item}</li>)}</ol>
            </article>
            <article className="pdf-candidates">
              <h3>候選缺陷草稿</h3>
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
        <strong>網盤自動歸檔說明</strong>
        <p>完整自動化需後端：Vercel Function 接收 PDF URL → 服務端下載 → 保存到指定網盤/雲存儲 → OCR/提煉 → 寫回 Supabase。網盤帳密/OAuth/rclone 配置只能放在服務端環境變數，不放前端。</p>
      </aside>
    </div>
  )
}
