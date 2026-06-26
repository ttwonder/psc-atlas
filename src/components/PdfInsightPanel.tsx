import { useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { buildPdfInsights, type PdfInsights } from '../lib/pdfInsights'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

export function PdfInsightPanel() {
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState('尚未上傳 PDF')
  const [insights, setInsights] = useState<PdfInsights | null>(null)
  const [textPreview, setTextPreview] = useState('')

  async function handleFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setStatus('正在讀取 PDF 文字…')
    setInsights(null)
    setTextPreview('')
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      const data = await file.arrayBuffer()
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
    } catch (error) {
      setStatus(`PDF 讀取失敗：${error instanceof Error ? error.message : String(error)}。如果是掃描件，需要 OCR 後再上傳文字版 PDF。`)
    }
  }

  return (
    <section className="panel pdf-insight-panel full-span">
      <header>
        <div>
          <p className="eyebrow">PDF REVIEW</p>
          <h2>PDF 閱讀與缺陷提煉</h2>
          <p>上傳文字型 PDF，系統會先提取英文原文，抓出疑似 PSC 具體缺陷描述和高頻設備/管理詞；掃描件需要先 OCR。</p>
        </div>
        <label className="pdf-upload-button">
          <Upload size={17} />上傳 PDF
          <input type="file" accept="application/pdf" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
      </header>
      <div className="pdf-status"><FileText size={18} /><span>{fileName ? `${fileName}｜` : ''}{status}</span></div>
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
          <article className="pdf-preview">
            <h3>文字預覽</h3>
            <pre>{textPreview}</pre>
          </article>
        </div>
      ) : null}
      <aside className="pdf-storage-note">
        <strong>關於自動下載到網盤</strong>
        <p>不能把網盤用戶名/密碼放在前端或 GitHub Pages。安全做法是後續用 Vercel Function + 網盤 OAuth/rclone 或雲存儲 API，服務端保存密鑰，前端只提交 PDF URL 任務。</p>
      </aside>
    </section>
  )
}
