import { describe, expect, it } from 'vitest'
import { buildManualCaseDraftFromHtml } from './temporaryWebsiteCase'

describe('temporary website case extraction', () => {
  it('builds a manual case draft from detention webpage HTML', () => {
    const draft = buildManualCaseDraftFromHtml(`
      <html><head><title>PSC detention notice - MV TEST STAR</title></head>
      <body>
        <h1>MV TEST STAR detained at Kaohsiung</h1>
        <p>IMO: 9876543</p>
        <p>Flag: Panama</p>
        <p>Ship type: Bulk carrier</p>
        <p>Date of detention: 2026-06-20</p>
        <p>Port: Kaohsiung</p>
        <ul>
          <li>07105 Fire doors were not self-closing during operational test.</li>
          <li>10111 The safety management system failed to ensure maintenance of emergency generator.</li>
          <li>14104 Oil filtering equipment alarm failed during test.</li>
        </ul>
      </body></html>
    `, 'https://example.com/detention/test-star')

    expect(draft.vessel).toBe('MV TEST STAR')
    expect(draft.imo).toBe('9876543')
    expect(draft.flag).toBe('Panama')
    expect(draft.shipType).toBe('Bulk carrier')
    expect(draft.date).toBe('2026-06-20')
    expect(draft.port).toBe('Kaohsiung')
    expect(draft.sourceUrl).toBe('https://example.com/detention/test-star')
    expect(draft.detentionItemsText).toContain('07105 | 消防安全 | Fire doors were not self-closing')
    expect(draft.detentionItemsText).toContain('10111 | ISM／安全管理 | The safety management system failed')
    expect(draft.detentionItemsText).toContain('14104 | 防污染 | Oil filtering equipment alarm failed')
  })

  it('falls back to text snippets when no defect code is present', () => {
    const draft = buildManualCaseDraftFromHtml(`
      <title>Detention report</title>
      <p>The vessel was detained because lifeboat launching arrangements were inoperative.</p>
      <p>Fire detection system showed multiple sensor faults.</p>
    `, 'https://example.com/report')

    expect(draft.detentionItemsText).toContain('救生設備')
    expect(draft.detentionItemsText).toContain('消防安全')
  })
})
