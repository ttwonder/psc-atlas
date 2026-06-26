import { useMemo, useState } from 'react'
import { ExternalLink, FileText, Link, Upload } from 'lucide-react'
import { pdfCandidateToDeficiencyDraft } from '../lib/editorWorkflow'
import { buildPdfInsights, type PdfInsights } from '../lib/pdfInsights'
import type { SourceBookmark } from '../types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

export function PdfInsightPanel({ sources = [] }: { sources?: SourceBookmark[] }) {
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('尚未上傳 PDF')
  const [pdfUrl, setPdfUrl] = useState('')
  const [urlTaskMessage, setUrlTaskMessage] = useState('尚未提交 PDF URL 任務')
  const [insights, setInsights] = useState<PdfInsights | null>(null)
  const [textPreview, setTextPreview] = useState('')
  const pdfSources = useMemo(() => sources.filter((item) => /\.pdf($|[?#])/i.test(item.url) || /pdf/i.test(`${item.sourceType} ${item.title}`)), [sources])
  const deficiencyDrafts = useMemo(() => insights?.deficiencyCandidates.map((item, index) => pdfCandidateToDeficiencyDraft(item, pdfUrl || fileName || 'uploaded-pdf', index + 1)) ?? [], [fileName, insights, pdfUrl])

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
      setUrlTaskMessage('已直接讀取 PDF URL 並完成初步提煉。若其他官方站被 CORS 阻止，則需要後端下載方案。')
    } catch (error) {
      setUrlTaskMessage(`瀏覽器無法直接讀取此 PDF：${error instanceof Error ? error.message : String(error)}。通常是官方站 CORS/防盜鏈限制；需要 Vercel 後端 /api/pdf-ingest 代下載、歸檔和提煉。`)
    }
  }

  function registerPdfUrlTask() {
    const url = pdfUrl.trim()
    if (!url) return
    if (!/\.pdf($|[?#])/i.test(url)) {
      setUrlTaskMessage('這個 URL 看起來不像 PDF；如確實是 PDF，請先確認鏈接能直接打開 PDF 文件。')
      return
    }
    setUrlTaskMessage(`已記錄 PDF URL 任務：${url}。目前前端不能保存網盤密碼；下一步需由 Vercel 後端 /api/pdf-ingest 用服務端密鑰下載、歸檔並提煉。`)
  }

  return (
    <section className="panel pdf-insight-panel full-span">
      <header>
        <div>
          <p className="eyebrow">PDF REVIEW</p>
          <h2>PDF 閱讀、來源識別與缺陷提煉</h2>
          <p>上傳文字型 PDF 可直接提取英文原文；已採集來源中的 PDF 會在下方列出。掃描件需要 OCR。</p>
        </div>
        <label className="pdf-upload-button">
          <Upload size={17} />上傳 PDF
          <input type="file" accept="application/pdf" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
      </header>
      <div className="pdf-status"><FileText size={18} /><span>{fileName ? `${fileName}｜` : ''}{status}</span></div>

      <div className="pdf-task-box">
        <div>
          <h3>新增 PDF URL 任務</h3>
          <p>把來源中的 PDF 鏈接貼到這裡。前端先記錄任務；真正自動下載到網盤必須走後端服務，不能把網盤帳密放在前端。</p>
        </div>
        <label><Link size={15} />PDF URL<input value={pdfUrl} onChange={(event) => setPdfUrl(event.target.value)} placeholder="https://.../report.pdf" /></label>
        <button className="primary-button" type="button" onClick={extractPdfUrl}>直接讀取並提煉</button>
        <button className="export-button" type="button" onClick={registerPdfUrlTask}>只記錄 PDF 任務</button>
        <small>{urlTaskMessage}</small>
      </div>

      <div className="pdf-source-list">
        <h3>已採集來源中的 PDF</h3>
        {pdfSources.length ? pdfSources.map((item) => (
          <article key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.authority ?? item.sourceType}</span>
            <a href={item.url} target="_blank" rel="noreferrer">打開 PDF <ExternalLink size={13} /></a>
          </article>
        )) : <p>目前來源清單中沒有識別到 PDF URL。</p>}
      </div>

      {insights ? (
        <div className="pdf-insight-grid">
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
            <p>這些草稿可複製給操作員核對後加入案例；不自動入庫，避免未審核 PDF 文字污染正式資料。</p>
            <ol>{deficiencyDrafts.map((item, index) => <li key={`${index}-${item.original}`}><code>{item.category}</code><span lang="en">{item.original}</span><small>{item.sourcePage ?? ''} {item.priority ? `｜初判關注度：${item.priority}` : ''}</small></li>)}</ol>
          </article>
          <article className="pdf-preview">
            <h3>文字預覽</h3>
            <pre>{textPreview}</pre>
          </article>
        </div>
      ) : null}
      <aside className="pdf-storage-note">
        <strong>關於自動下載到網盤</strong>
        <p>完整自動化需要後端任務：Vercel Function 接收 PDF URL → 服務端下載 → 保存到指定網盤/雲存儲 → OCR/提煉 → 寫回 Supabase。網盤帳密/OAuth/rclone 配置只能放在 Vercel 環境變數或服務端，不放前端。</p>
      </aside>
    </section>
  )
}
