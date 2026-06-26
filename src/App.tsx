import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Download, FileDown, Menu, RefreshCw, Plus } from 'lucide-react'
import { CaseTable } from './components/CaseTable'
import { FilterBar } from './components/FilterBar'
import { FindingTable } from './components/FindingTable'
import { PdfInsightPanel } from './components/PdfInsightPanel'
import { Sidebar, type NavKey } from './components/Sidebar'
import { categories as seedCategories, inspectionCases, shipTypes as seedShipTypes } from './data/cases'
import { officialSourceMap, sourceCoverageSummary, autoFetchSummary } from './data/sourceMap'
import { activeSources, deletedSources, getPriorityNovelFindings, markSourceDeleted, purgeExpiredDeletedSources, restoreSource, updateFinding, updateSourceBookmark, type FindingDraft, type SourceBookmarkDraft } from './lib/editorWorkflow'
import { exportCasesWorkbook } from './lib/excel'
import { canAddSources, canEditDataset, canEditSources, describeCloudError, getCloudUser, getEditorProfile, isCloudConfigured, loadCloudDataset, signInWithEmail, signOutCloud, upsertCloudDataset, upsertCloudSources, type EditorProfile } from './lib/cloudStorage'
import { runServerRefresh } from './lib/serverRefreshClient'
import { fetchLatestOfficialCases } from './lib/officialRefresh'
import { buildRegionalReport } from './lib/report'
import { loadStoredCases, loadStoredSources, mergeCases, mergeSources, saveStoredCases, saveStoredSources, sourceFromCase, sourceFromGuide, slugify } from './lib/storage'
import { calculateTrendSummary, filterCasesByRangeAndRegion, getRegions, timeRangeLabels } from './lib/trends'
import type { InspectionCase, OfficialSourceGuide, SourceBookmark, TimeRangeKey } from './types'

function App() {
  const [cases, setCases] = useState<InspectionCase[]>(() => loadStoredCases(inspectionCases))
  const [sources, setSources] = useState<SourceBookmark[]>(() => loadStoredSources(inspectionCases, officialSourceMap))
  const [activePage, setActivePage] = useState<NavKey>('cases')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [shipType, setShipType] = useState('')
  const [category, setCategory] = useState('')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('all')
  const [detainedOnly, setDetainedOnly] = useState(false)
  const [selected, setSelected] = useState<InspectionCase | null>(() => cases[0] ?? null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('尚未執行本次更新')
  const [loading, setLoading] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [cloudConfigured] = useState(() => isCloudConfigured())
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(null)
  const [editorProfile, setEditorProfile] = useState<EditorProfile | null>(null)
  const [cloudEmailInput, setCloudEmailInput] = useState('')
  const [cloudMessage, setCloudMessage] = useState(() => isCloudConfigured() ? '雲端資料庫已設定，正在檢查登入與同步狀態……' : '尚未設定雲端資料庫；目前使用本機資料。')
  const [cloudLoading, setCloudLoading] = useState(false)
  const [serverRefreshToken, setServerRefreshToken] = useState('')
  const [serverRefreshMessage, setServerRefreshMessage] = useState('後端刷新 API 適用於 Vercel 部署；授權者輸入 refresh token 後可由伺服器抓取並寫入 Supabase。')
  const [serverRefreshLoading, setServerRefreshLoading] = useState(false)
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase())

  const regions = useMemo(() => getRegions(cases), [cases])
  const shipTypes = useMemo(() => Array.from(new Set([...seedShipTypes, ...cases.map((item) => item.shipType)])).sort(), [cases])
  const categories = useMemo(() => Array.from(new Set([...seedCategories, ...cases.flatMap((item) => item.deficiencies.map((entry) => entry.category))])).sort(), [cases])

  useEffect(() => {
    let cancelled = false
    async function loadCloud() {
      if (!cloudConfigured) return
      setCloudLoading(true)
      try {
        const user = await getCloudUser()
        const profile = user ? await getEditorProfile() : null
        if (!cancelled) {
          setCloudUserEmail(user?.email ?? null)
          setEditorProfile(profile)
        }
        const dataset = await loadCloudDataset(inspectionCases, officialSourceMap)
        if (cancelled) return
        setCases(dataset.cases)
        setSources(dataset.sources)
        saveStoredCases(dataset.cases)
        saveStoredSources(dataset.sources)
        setCloudMessage(dataset.cloudCaseCount
          ? `已從雲端載入 ${dataset.cloudCaseCount} 筆案例、${dataset.cloudSourceCount} 個來源；本機 seed 已合併。${user ? `目前登入：${user.email}${profile ? `（${profile.role}）` : '（未在操作員白名單，僅可讀）'}` : '目前未登入，只能讀取公開資料。'}`
          : `雲端目前尚未有資料；正在使用本機 seed。${profile && canEditDataset(profile) ? '可按「同步目前資料到雲端」初始化資料庫。' : user ? '你已登入，但未獲 dataset/editor 權限。' : '請登入後同步目前資料到雲端。'}`)
      } catch (error) {
        if (!cancelled) setCloudMessage(`雲端讀取失敗：${describeCloudError(error)}；已保留本機資料。`)
      } finally {
        if (!cancelled) setCloudLoading(false)
      }
    }
    loadCloud()
    return () => { cancelled = true }
  }, [cloudConfigured])

  const filteredCases = useMemo(() => {
    const ranged = filterCasesByRangeAndRegion(cases, timeRange, region)
    return ranged.filter((item) => {
      const findingText = item.deficiencies.map((entry) => `${entry.code} ${entry.category} ${entry.original} ${entry.notes ?? ''} ${entry.sourceQuote ?? ''}`).join(' ')
      const haystack = `${item.vessel} ${item.imo} ${item.shortSummary} ${item.port} ${item.region} ${item.source.authority} ${findingText}`.toLocaleLowerCase()
      const matchesQuery = !deferredQuery || haystack.includes(deferredQuery)
      const matchesShip = !shipType || item.shipType === shipType
      const matchesCategory = !category || item.deficiencies.some((entry) => entry.category === category)
      return matchesQuery && matchesShip && matchesCategory && (!detainedOnly || item.status === 'detained')
    })
  }, [cases, category, deferredQuery, detainedOnly, region, shipType, timeRange])

  const trend = useMemo(() => calculateTrendSummary(cases, timeRange, region || '全部地區'), [cases, region, timeRange])
  const report = useMemo(() => buildRegionalReport(cases, region || '全部地區', timeRange), [cases, region, timeRange])

  function resetFilters() { setQuery(''); setRegion(''); setShipType(''); setCategory(''); setTimeRange('all'); setDetainedOnly(false) }
  function selectCase(item: InspectionCase) { setSelected(item); setActivePage('findings'); setMobileNavOpen(false) }
  function navigate(key: NavKey) { setActivePage(key); setMobileNavOpen(false) }

  async function handleCloudSignIn() {
    const email = cloudEmailInput.trim()
    if (!email) return
    setCloudLoading(true)
    try {
      await signInWithEmail(email)
      setCloudMessage(`已發送登入連結到 ${email}。請到信箱點擊連結，回到網站後即可寫入雲端。`)
    } catch (error) {
      setCloudMessage(`登入失敗：${describeCloudError(error)}`)
    } finally {
      setCloudLoading(false)
    }
  }

  async function handleCloudSignOut() {
    setCloudLoading(true)
    try {
      await signOutCloud()
      setCloudUserEmail(null)
      setEditorProfile(null)
      setCloudMessage('已登出；仍可讀取公開雲端資料，但不能寫入。')
    } catch (error) {
      setCloudMessage(`登出失敗：${describeCloudError(error)}`)
    } finally {
      setCloudLoading(false)
    }
  }

  async function syncCurrentDatasetToCloud() {
    if (!cloudConfigured) {
      setCloudMessage('尚未設定 Supabase，不能同步到雲端。')
      return
    }
    setCloudLoading(true)
    try {
      const user = await getCloudUser()
      if (!user) {
        setCloudMessage('請先用 email 登入，才可以把資料寫入雲端。')
        return
      }
      const profile = await getEditorProfile()
      if (!canEditDataset(profile)) {
        setEditorProfile(profile)
        setCloudMessage('你已登入，但不是 editor/owner，不能同步整個資料集。')
        return
      }
      await upsertCloudDataset(cases, sources)
      setCloudUserEmail(user.email ?? null)
      setEditorProfile(await getEditorProfile())
      setCloudMessage(`已同步到雲端：${cases.length} 筆案例、${cases.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項缺陷、${sources.length} 個來源。其他人重新打開網站即可看到。`)
    } catch (error) {
      setCloudMessage(`同步雲端失敗：${describeCloudError(error)}`)
    } finally {
      setCloudLoading(false)
    }
  }

  async function refreshViaServer() {
    const token = serverRefreshToken.trim()
    if (!token) {
      setServerRefreshMessage('請輸入 refresh token。')
      return
    }
    setServerRefreshLoading(true)
    setServerRefreshMessage('正在呼叫後端 API 抓取最新資料並寫入 Supabase……')
    try {
      const result = await runServerRefresh(token, 12)
      setServerRefreshMessage(`後端刷新完成：${result.messages?.join('；') || '無訊息'}；寫入/更新 ${result.insertedOrUpdatedCases ?? 0} 案例、${result.detainableDeficiencies ?? 0} 項滯留缺陷。`)
      if (cloudConfigured) {
        const dataset = await loadCloudDataset(inspectionCases, officialSourceMap)
        setCases(dataset.cases)
        setSources(dataset.sources)
        saveStoredCases(dataset.cases)
        saveStoredSources(dataset.sources)
        setCloudMessage(`已重新從雲端載入：${dataset.cloudCaseCount} 筆雲端案例、${dataset.cloudSourceCount} 個雲端來源。`)
      }
    } catch (error) {
      setServerRefreshMessage(`後端刷新失敗：${describeCloudError(error)}。若目前不是 Vercel 部署，請先設定 VITE_REFRESH_API_URL 或部署 api/refresh.ts。`)
    } finally {
      setServerRefreshLoading(false)
    }
  }

  async function refreshLatest() {
    setLoading(true)
    setUpdateMessage('正在依來源頁策略抓取：GOV.UK/MCA 月報 + Paris MoU current detentions；舊案例會保留並合併……')
    try {
      const result = await fetchLatestOfficialCases(12)
      const incoming = result.cases.map(keepDetentionOnly).filter((item): item is InspectionCase => Boolean(item))
      const current2025 = cases.map(keepDetentionOnly).filter((item): item is InspectionCase => Boolean(item))
      const merged = mergeCases(current2025, incoming)
      const newSources = mergeSources(incoming.map(sourceFromCase), officialSourceMap.map(sourceFromGuide))
      const mergedSources = mergeSources(sources, newSources)
      setCases(merged)
      setSources(mergedSources)
      saveStoredCases(merged)
      saveStoredSources(mergedSources)
      const user = cloudConfigured ? await getCloudUser() : null
      if (user) {
        const profile = await getEditorProfile()
        setEditorProfile(profile)
        if (canEditDataset(profile)) {
          await upsertCloudDataset(merged, mergedSources)
          setCloudUserEmail(user.email ?? null)
        } else {
          setCloudMessage('已在本機完成刷新；你不是 editor/owner，不能把整個資料集寫入雲端。')
        }
      }
      setUpdateMessage(`更新完成：${result.messages.join('；')}；已按要求排除 FPMC、排除非滯留缺陷，只保留 2025 年以後滯留項。${user ? '已同步寫入雲端資料庫。' : cloudConfigured ? '雲端未登入，暫存於本機；登入後可同步到雲端。' : '目前使用本機資料。'}資料庫累積 ${merged.length} 筆案例、${merged.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項滯留依據。`)
      if (!selected && merged.length) setSelected(merged[0])
    } catch (error) {
      setUpdateMessage(`更新失敗：${describeCloudError(error)}。既有資料已保留；可在「資料來源」手動加入網址備忘。`)
    } finally {
      setLoading(false)
    }
  }

  async function persistSources(nextSources: SourceBookmark[], successMessage: string) {
    const merged = purgeExpiredDeletedSources(mergeSources([], nextSources))
    setSources(merged)
    saveStoredSources(merged)
    if (!cloudConfigured) return
    try {
      const user = await getCloudUser()
      if (user) {
        await upsertCloudSources(merged)
        setCloudUserEmail(user.email ?? null)
        setEditorProfile(await getEditorProfile())
        setCloudMessage(successMessage)
      } else {
        setCloudMessage('來源變更已保存到本機；請登入後按「同步目前資料到雲端」。')
      }
    } catch (error) {
      setCloudMessage(`來源已保存到本機，但同步雲端失敗：${describeCloudError(error)}`)
    }
  }

  async function persistNewSource(item: SourceBookmark, nextSources: SourceBookmark[], successMessage: string) {
    const merged = purgeExpiredDeletedSources(mergeSources([], nextSources))
    setSources(merged)
    saveStoredSources(merged)
    if (!cloudConfigured) return
    try {
      const user = await getCloudUser()
      if (user) {
        const profile = await getEditorProfile()
        setEditorProfile(profile)
        if (!canAddSources(profile)) {
          setCloudMessage('來源已保存到本機；你的 email 未在來源提交白名單內，不能寫入雲端。')
          return
        }
        await upsertCloudSources([item])
        setCloudUserEmail(user.email ?? null)
        setCloudMessage(successMessage)
      } else {
        setCloudMessage('來源已保存到本機；請登入後再提交到雲端。')
      }
    } catch (error) {
      setCloudMessage(`來源已保存到本機，但同步新增來源失敗：${describeCloudError(error)}`)
    }
  }

  async function addManualSource() {
    const url = manualUrl.trim()
    if (!url) return
    const item: SourceBookmark = {
      id: `manual-${slugify(url)}-${Date.now()}`,
      title: manualTitle.trim() || url,
      url,
      sourceType: '手動備忘',
      addedAt: new Date().toISOString(),
      manual: true,
      notes: manualNotes.trim(),
    }
    await persistNewSource(item, mergeSources(sources, [item]), `已把新來源同步到雲端：${item.title}`)
    setManualUrl(''); setManualTitle(''); setManualNotes('')
  }

  async function saveSourceEdit(id: string, draft: SourceBookmarkDraft) {
    if (!mayEditSources) { setCloudMessage('只有 editor/owner 可以修改已採集來源。'); return }
    const next = sources.map((item) => item.id === id ? updateSourceBookmark(item, draft) : item)
    await persistSources(next, `已更新來源：${draft.title || id}`)
  }

  async function softDeleteSource(id: string, reason = '') {
    if (!mayEditSources) { setCloudMessage('只有 editor/owner 可以刪除來源。'); return }
    const user = cloudConfigured ? await getCloudUser() : null
    const next = sources.map((item) => item.id === id ? markSourceDeleted(item, user?.email, reason) : item)
    await persistSources(next, '已移到「已刪除」板塊；30 天後會自動清除。')
  }

  async function restoreDeletedSource(id: string) {
    if (!mayEditSources) { setCloudMessage('只有 editor/owner 可以還原來源。'); return }
    const next = sources.map((item) => item.id === id ? restoreSource(item) : item)
    await persistSources(next, '已還原來源。')
  }

  async function saveFindingEdit(caseId: string, findingIndex: number, draft: FindingDraft) {
    if (!mayEditFindings) { setCloudMessage('只有 editor/owner 可以修改缺陷分類、備註、關注度和新穎標記。'); return }
    const nextCases = updateFinding(cases, caseId, findingIndex, draft)
    setCases(nextCases)
    saveStoredCases(nextCases)
    setSelected((current) => nextCases.find((item) => item.id === (current?.id ?? caseId)) ?? current)
    if (!cloudConfigured) return
    try {
      const user = await getCloudUser()
      if (user) {
        await upsertCloudDataset(nextCases, sources)
        setCloudUserEmail(user.email ?? null)
        setEditorProfile(await getEditorProfile())
        setCloudMessage('缺陷備註/關注度已同步到雲端。')
      } else {
        setCloudMessage('缺陷修改已保存到本機；登入後可同步到雲端。')
      }
    } catch (error) {
      setCloudMessage(`缺陷已保存到本機，但同步雲端失敗：${describeCloudError(error)}`)
    }
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `psc-regional-report-${region || 'all'}-${timeRange}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const mayAddSources = canAddSources(editorProfile)
  const mayEditSources = canEditSources(editorProfile)
  const mayEditFindings = canEditDataset(editorProfile)

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar active={activePage} collapsed={sidebarCollapsed} mobileOpen={mobileNavOpen} onToggle={() => { setSidebarCollapsed((value) => !value); setMobileNavOpen(false) }} onNavigate={navigate} />
      {mobileNavOpen ? <button className="nav-backdrop" type="button" aria-label="關閉導覽" onClick={() => setMobileNavOpen(false)} /> : null}
      <main className="main-content">
        <header className="page-header">
          <div><h1>PSC 滯留案例卷宗 App</h1><p>累積官方來源、近期趨勢、地區報告、預防自查清單與 Excel 匯出</p></div>
          <div className="header-actions">
            <button className="export-button" type="button" onClick={refreshLatest} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''} />獲取最新缺失</button>
            <button className="export-button" type="button" onClick={() => exportCasesWorkbook(filteredCases, sources, officialSourceMap)}><Download size={18} />匯出 Excel</button>
          </div>
          <button className="mobile-menu" type="button" aria-label="開啟導覽" onClick={() => setMobileNavOpen(true)}><Menu /></button>
        </header>

        <div className="update-strip"><span>{updateMessage}</span><span>目前累積：{cases.length} 案例 / {cases.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項缺陷 / {activeSources(sources).length} 個有效網址</span></div>
        <FilterBar query={query} region={region} shipType={shipType} category={category} timeRange={timeRange} detainedOnly={detainedOnly} regions={regions} shipTypes={shipTypes} categories={categories} onQueryChange={setQuery} onRegionChange={setRegion} onShipTypeChange={setShipType} onCategoryChange={setCategory} onTimeRangeChange={setTimeRange} onDetainedOnlyChange={setDetainedOnly} onReset={resetFilters} />

        {activePage === 'overview' ? <Overview trend={trend} cases={filteredCases} onSelect={selectCase} /> : null}
        {activePage === 'cases' ? <CasesPage cases={filteredCases} selected={selected} onSelect={selectCase} /> : null}
        {activePage === 'findings' ? <FindingsPage cases={filteredCases} selected={selected} onSelect={selectCase} query={deferredQuery} categories={categories} canEdit={mayEditFindings} onUpdateFinding={saveFindingEdit} /> : null}
        {activePage === 'priority' ? <PriorityNovelPage cases={filteredCases} /> : null}
        {activePage === 'analysis' ? <AnalysisPage report={report} trend={trend} range={timeRange} onDownload={downloadReport} /> : null}
        {activePage === 'sources' ? <SourcesPage sources={sources} sourceGuides={officialSourceMap} manualUrl={manualUrl} manualTitle={manualTitle} manualNotes={manualNotes} loading={loading} updateMessage={updateMessage} cloudConfigured={cloudConfigured} cloudUserEmail={cloudUserEmail} cloudEmailInput={cloudEmailInput} cloudMessage={cloudMessage} cloudLoading={cloudLoading} serverRefreshToken={serverRefreshToken} serverRefreshMessage={serverRefreshMessage} serverRefreshLoading={serverRefreshLoading} onServerRefreshToken={setServerRefreshToken} onServerRefresh={refreshViaServer} onCloudEmail={setCloudEmailInput} onCloudSignIn={handleCloudSignIn} onCloudSignOut={handleCloudSignOut} onCloudSync={syncCurrentDatasetToCloud} onUrl={setManualUrl} onTitle={setManualTitle} onNotes={setManualNotes} onAdd={addManualSource} onRefresh={refreshLatest} onSaveSource={saveSourceEdit} onDeleteSource={softDeleteSource} onRestoreSource={restoreDeletedSource} canAddSources={mayAddSources} canEditSources={mayEditSources} editorProfile={editorProfile} /> : null}
      </main>
    </div>
  )
}

function keepDetentionOnly(item: InspectionCase): InspectionCase | null {
  if (item.date < '2025-01-01') return null
  if (/\bFPMC\b/i.test(`${item.vessel} ${item.company}`)) return null
  const detentionDeficiencies = item.deficiencies.filter((entry) => entry.detentionGround === true)
  if (!detentionDeficiencies.length) return null
  return {
    ...item,
    deficiencies: detentionDeficiencies,
    deficiencyCount: detentionDeficiencies.length,
    detentionGroundCount: detentionDeficiencies.length,
    status: 'detained',
  }
}

function Overview({ trend, cases, onSelect }: { trend: ReturnType<typeof calculateTrendSummary>; cases: InspectionCase[]; onSelect: (item: InspectionCase) => void }) {
  return <div className="dashboard-page"><TrendCards trend={trend} /><section className="panel"><h2>近期主要趨勢</h2><ul className="trend-list">{trend.focusDirections.map((item) => <li key={item}>{item}</li>)}</ul>{trend.topKeywords.length ? <div className="overview-keywords"><strong>高頻關鍵詞</strong><div>{trend.topKeywords.map((item) => <span key={item.keyword}>{item.keyword}<b>{item.count}</b></span>)}</div></div> : null}</section><section className="panel"><h2>典型案例快速入口</h2><div className="quick-case-grid">{cases.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => onSelect(item)}><strong>{item.vessel}</strong><span>{item.shortSummary}</span></button>)}</div></section></div>
}

function TrendCards({ trend }: { trend: ReturnType<typeof calculateTrendSummary> }) {
  return <section className="stat-grid"><article><span>案例數</span><strong>{trend.totalCases}</strong><small>{trend.region} · {timeRangeLabels[trend.range]}</small></article><article><span>滯留依據</span><strong>{trend.totalDetainableDeficiencies}</strong><small>逐項缺陷累計</small></article><article><span>主要類別</span><strong>{trend.topCategories[0]?.category ?? '暫無'}</strong><small>{trend.topCategories[0]?.count ?? 0} 項</small></article><article><span>典型案例</span><strong>{trend.typicalCases[0]?.vessel ?? '暫無'}</strong><small>可點案例庫查看詳情</small></article></section>
}

function CasesPage(props: { cases: InspectionCase[]; selected: InspectionCase | null; onSelect: (item: InspectionCase) => void }) {
  return (
    <div className="dossier-workbench">
      <section className="case-list evidence-card" aria-label="PSC 案例總清單">
        <header className="section-header"><div><h2>案例總清單</h2><p>點擊任一船舶，會跳到「缺陷詳情」分頁中該船對應的缺陷位置。</p></div></header>
        <CaseTable cases={props.cases} selectedId={props.selected?.id ?? null} onSelect={props.onSelect} />
      </section>
    </div>
  )
}

function FindingsPage(props: { cases: InspectionCase[]; selected: InspectionCase | null; onSelect: (item: InspectionCase) => void; query: string; categories: string[]; canEdit: boolean; onUpdateFinding: (caseId: string, findingIndex: number, draft: FindingDraft) => void }) {
  return (
    <div className="dossier-workbench">
      <section className="case-list evidence-card" aria-label="PSC 缺陷詳情清單">
        <header className="section-header"><div><h2>缺陷詳情清單</h2><p>這是獨立分頁；上方搜尋、時間段、地區、船型、缺陷類別會同步篩選這張表。登入的操作員可修改分類、備註、關注度與新穎標記。</p></div></header>
        <FindingTable cases={props.cases} onSelect={props.onSelect} focusCaseId={props.selected?.id ?? null} globalQuery={props.query} categories={props.categories} canEdit={props.canEdit} onUpdateFinding={props.onUpdateFinding} />
      </section>
    </div>
  )
}

function PriorityNovelPage({ cases }: { cases: InspectionCase[] }) {
  const rows = getPriorityNovelFindings(cases)
  return (
    <div className="dossier-workbench">
      <section className="case-list evidence-card" aria-label="重點與新穎缺陷">
        <header className="section-header"><div><h2>重點 + 新穎缺陷</h2><p>只展示關注度為中/高或已勾選「新穎」的具體缺陷原文；上方時間段和其他篩選同樣生效。</p></div></header>
        <div className="priority-finding-list">
          {rows.map(({ caseItem, finding, index }) => (
            <article key={`${caseItem.id}-${index}`}>
              <p lang="en">{finding.original}</p>
            </article>
          ))}
        </div>
        {rows.length === 0 ? <div className="empty-state"><strong>目前沒有標記為中/高或新穎的缺陷</strong><span>可到「缺陷詳情」修改缺陷關注度或勾選新穎。</span></div> : null}
      </section>
    </div>
  )
}

function buildPreventionActions(trend: ReturnType<typeof calculateTrendSummary>) {
  const actions = trend.topCategories.slice(0, 5).map((item) => `把「${item.category}」納入本週船舶預檢：按缺陷原文逐項核對，至少抽查 ${Math.min(item.count, 10)} 個對應設備/文件/演習記錄。`)
  if (trend.topKeywords.length) actions.unshift(`高頻設備/作業詞：${trend.topKeywords.slice(0, 6).map((item) => `${item.keyword}(${item.count})`).join('、')}；優先安排船岸自查。`)
  if (trend.indexOnlyCases) actions.push(`${trend.indexOnlyCases} 筆 index-only 來源不能直接作原因分析，需追 Form A/B、PDF 或港口國月報補原文。`)
  return actions.slice(0, 7)
}

function AnalysisPage({ report, trend, range, onDownload }: { report: string; trend: ReturnType<typeof calculateTrendSummary>; range: TimeRangeKey; onDownload: () => void }) {
  const maxMonthly = Math.max(...trend.monthlyTrend.map((item) => item.detainable), 1)
  const preventionActions = buildPreventionActions(trend)
  return (
    <div className="analysis-grid">
      <section className="analysis-hero panel">
        <div>
          <p className="eyebrow">SUMMARY ANALYSIS</p>
          <h2>匯總情況分析頁：先判斷要抓哪些重點</h2>
          <p>所有圖表都受上方地區、期間、船型、類別篩選控制。索引-only 案例只作「最新跟蹤」，不混入可分析缺陷結論。</p>
        </div>
        <button className="export-button" type="button" onClick={onDownload}><FileDown size={17} />下載 Markdown 報告</button>
      </section>
      <TrendCards trend={trend} />
      <section className="panel priority-panel">
        <h2>優先信號</h2>
        <ul className="trend-list">{trend.prioritySignals.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section className="panel prevention-panel">
        <h2>公司預防行動清單</h2>
        <p>把趨勢直接轉成船岸可執行的預檢/跟蹤項，而不是只看統計。</p>
        <ol className="trend-list">{preventionActions.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>
      <section className="panel"><h2>{timeRangeLabels[range]}主要缺陷面向</h2><div className="category-bars">{trend.topCategories.map((item) => <div key={item.category}><span>{item.category}</span><strong>{item.count}</strong><progress max={trend.topCategories[0]?.count || 1} value={item.count} /></div>)}</div></section>
      <section className="panel"><h2>地區案件與趨勢</h2><div className="region-breakdown">{trend.regionBreakdown.map((item) => <article key={item.region}><strong>{item.region}</strong><span>{item.cases} 案 / {item.detainable} 項依據</span><small>分析可用 {item.analysisReady}｜索引待補 {item.indexOnly}</small></article>)}</div></section>
      <section className="panel"><h2>證據深度與狀態</h2><div className="mix-grid"><div>{trend.evidenceMix.map((item) => <p key={item.level}><b>{item.level}</b><span>{item.count} 案</span></p>)}</div><div>{trend.statusBreakdown.map((item) => <p key={item.status}><b>{item.status}</b><span>{item.count} 案</span></p>)}</div></div></section>
      <section className="panel"><h2>月份走勢（最近12個月份）</h2><div className="month-trend">{trend.monthlyTrend.map((item) => <div key={item.month}><span>{item.month}</span><progress max={maxMonthly} value={item.detainable} /><strong>{item.detainable}</strong></div>)}</div></section>
      <section className="panel matrix-panel"><h2>地區 × 缺陷面向矩陣</h2><div className="matrix-list">{trend.categoryRegionMatrix.map((item) => <span key={`${item.category}-${item.region}`}>{item.region}<b>{item.category}</b><strong>{item.count}</strong></span>)}</div></section>
      <section className="panel report-panel"><header><h2>地區性總結報告</h2><button className="export-button" type="button" onClick={onDownload}><FileDown size={17} />下載 Markdown</button></header><pre>{report}</pre></section>
    </div>
  )
}

interface SourcesPageProps {
  sources: SourceBookmark[]
  sourceGuides: OfficialSourceGuide[]
  manualUrl: string
  manualTitle: string
  manualNotes: string
  loading: boolean
  updateMessage: string
  cloudConfigured: boolean
  cloudUserEmail: string | null
  cloudEmailInput: string
  cloudMessage: string
  cloudLoading: boolean
  serverRefreshToken: string
  serverRefreshMessage: string
  serverRefreshLoading: boolean
  canAddSources: boolean
  canEditSources: boolean
  editorProfile: EditorProfile | null
  onServerRefreshToken: (value: string) => void
  onServerRefresh: () => void
  onCloudEmail: (value: string) => void
  onCloudSignIn: () => void
  onCloudSignOut: () => void
  onCloudSync: () => void
  onUrl: (value: string) => void
  onTitle: (value: string) => void
  onNotes: (value: string) => void
  onAdd: () => void | Promise<void>
  onRefresh: () => void
  onSaveSource: (id: string, draft: SourceBookmarkDraft) => void | Promise<void>
  onDeleteSource: (id: string, reason?: string) => void | Promise<void>
  onRestoreSource: (id: string) => void | Promise<void>
}

function SourcesPage(props: SourcesPageProps) {
  const [sourceTab, setSourceTab] = useState<'guides' | 'collected' | 'deleted' | 'pdf' | 'refresh'>('guides')
  const [editingSourceId, setEditingSourceId] = useState('')
  const [sourceDraft, setSourceDraft] = useState<SourceBookmarkDraft>({ title: '', url: '', sourceType: '', authority: '', notes: '', publishedAt: '', fetchedAt: '', evidenceLevel: undefined, autoFetch: undefined, status: 'new', tags: '', storageUrl: '' })
  const [deleteReason, setDeleteReason] = useState('')
  const [sourcePermissionMessage, setSourcePermissionMessage] = useState('')
  const activeSourceList = activeSources(props.sources)
  const deletedSourceList = deletedSources(props.sources)
  return (
    <div className="sources-page">
      <section className="panel source-command-panel">
        <div>
          <p className="eyebrow">SOURCE REGISTRY</p>
          <h2>資料來源標籤頁</h2>
          <p>這裡集中放定期查看的官方/準官方入口，也標明哪些能自動抓取、哪些只能人工追完整卷宗。</p>
        </div>
        <button className="primary-button" type="button" onClick={props.onRefresh} disabled={props.loading}><RefreshCw size={17} className={props.loading ? 'spin' : ''} />獲取最新缺失</button>
        <small>{props.updateMessage}</small>
      </section>
      <section className="panel cloud-panel full-span">
        <div>
          <p className="eyebrow">CLOUD DATABASE</p>
          <h2>雲端資料庫同步</h2>
          <p>{props.cloudMessage}</p>
          <small>{props.cloudConfigured ? (props.cloudUserEmail ? `已登入：${props.cloudUserEmail}｜角色：${props.editorProfile?.role ?? '未在白名單'}｜${props.canEditSources ? '可修改/刪除來源' : props.canAddSources ? '可新增來源' : '只讀'}` : 'Supabase 已設定；目前未登入，公開資料可讀但不能寫入。') : '尚未設定 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。'}</small>
        </div>
        {props.cloudConfigured ? (
          <div className="cloud-actions">
            {props.cloudUserEmail ? (
              <button className="export-button" type="button" onClick={props.onCloudSignOut} disabled={props.cloudLoading}>登出</button>
            ) : (
              <label>
                Email 登入
                <input value={props.cloudEmailInput} onChange={(event) => props.onCloudEmail(event.target.value)} placeholder="you@example.com" />
              </label>
            )}
            {!props.cloudUserEmail ? <button className="primary-button" type="button" onClick={props.onCloudSignIn} disabled={props.cloudLoading || !props.cloudEmailInput.trim()}>發送登入連結</button> : null}
            <button className="primary-button" type="button" onClick={props.onCloudSync} disabled={props.cloudLoading || !props.cloudUserEmail || !canEditDataset(props.editorProfile)}>{props.cloudLoading ? '同步中…' : '同步目前資料到雲端'}</button>
          </div>
        ) : (
          <div className="cloud-actions"><code>先建立 Supabase 專案並設定環境變數</code></div>
        )}
      </section>
      <div className="source-tabs" role="tablist" aria-label="資料來源分頁">
        <button type="button" className={sourceTab === 'guides' ? 'active' : ''} onClick={() => setSourceTab('guides')}>官方來源地圖</button>
        <button type="button" className={sourceTab === 'collected' ? 'active' : ''} onClick={() => setSourceTab('collected')}>已採集/備忘網址</button>
        <button type="button" className={sourceTab === 'deleted' ? 'active' : ''} onClick={() => setSourceTab('deleted')}>已刪除</button>
        <button type="button" className={sourceTab === 'pdf' ? 'active' : ''} onClick={() => setSourceTab('pdf')}>PDF 閱讀提煉</button>
        <button type="button" className={sourceTab === 'refresh' ? 'active' : ''} onClick={() => setSourceTab('refresh')}>自動抓取策略</button>
      </div>

      {sourceTab === 'guides' ? (
        <section className="panel source-guide-panel full-span">
          <header>
            <h2>代表性官方來源地圖</h2>
            <span>{sourceCoverageSummary(props.sourceGuides)}｜{autoFetchSummary(props.sourceGuides)}</span>
          </header>
          <div className="source-guide-list">
            {props.sourceGuides.map((item) => (
              <article key={item.id}>
                <div className="source-guide-top"><strong>{item.region}</strong><span className={`evidence-badge ${item.evidenceLevel}`}>{item.evidenceLevel}</span></div>
                <h3>{item.title}</h3>
                <p><b>更新頻率：</b>{item.updateCadence}</p>
                <p><b>最佳用途：</b>{item.bestUse}</p>
                <p><b>證據邊界：</b>{item.limitations}</p>
                <p><b>下一步：</b>{item.nextAction}</p>
                <p><b>抓取狀態：</b>{item.autoFetch} — {item.refreshScope}</p>
                <a href={item.url} target="_blank" rel="noreferrer">打開官方入口</a>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sourceTab === 'collected' ? (
        <>
          <section className="panel source-form">
            <h2>手動添加網頁/PDF 備忘</h2>
            <label>網址<input value={props.manualUrl} onChange={(event) => props.onUrl(event.target.value)} placeholder="https://..." /></label>
            <label>標題<input value={props.manualTitle} onChange={(event) => props.onTitle(event.target.value)} placeholder="例如：某港口 PSC detention notice" /></label>
            <label>備註<textarea value={props.manualNotes} onChange={(event) => props.onNotes(event.target.value)} placeholder="用途、需要回頭查的頁碼或重點" /></label>
            <button className="primary-button" type="button" onClick={props.onAdd} disabled={props.cloudConfigured && props.cloudUserEmail !== null && !props.canAddSources}><Plus size={17} />加入網址清單</button>
            {props.cloudUserEmail && !props.canAddSources ? <small className="permission-note">你的帳號目前不是 source_editor/editor/owner，不能寫入雲端來源。</small> : null}
          </section>
          <section className="panel collected-sources-panel">
            <h2>已採集 / 備忘網址清單</h2>
            <p className="panel-hint">操作員以上可修改來源各欄位並刪除來源；刪除會先移到「已刪除」板塊，30 天後自動清空。</p>
            <label className="delete-reason-field">刪除原因（可選）<input value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="例如：重複來源 / 無效網址 / 已合併到其他來源" /></label>
            {sourcePermissionMessage ? <div className="permission-note">{sourcePermissionMessage}</div> : null}
            <div className="source-list">{activeSourceList.map((item) => {
              const editing = editingSourceId === item.id
              return <article key={item.id} className={editing ? 'source-editing' : ''}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.authority ?? item.sourceType} · {item.manual ? '手動備忘' : '來源庫'}</span>
                  {item.notes ? <small>{item.notes}</small> : null}
                  {editing ? <div className="source-edit-form">
                    <label>標題<input value={sourceDraft.title} onChange={(event) => setSourceDraft((draft) => ({ ...draft, title: event.target.value }))} /></label>
                    <label>網址<input value={sourceDraft.url} onChange={(event) => setSourceDraft((draft) => ({ ...draft, url: event.target.value }))} /></label>
                    <label>類型<input value={sourceDraft.sourceType} onChange={(event) => setSourceDraft((draft) => ({ ...draft, sourceType: event.target.value }))} /></label>
                    <label>機關<input value={sourceDraft.authority ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, authority: event.target.value }))} /></label>
                    <label>備註<textarea value={sourceDraft.notes ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, notes: event.target.value }))} /></label>
                    <label>發布日期<input value={sourceDraft.publishedAt ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, publishedAt: event.target.value }))} placeholder="YYYY-MM-DD" /></label>
                    <label>抓取/歸檔時間<input value={sourceDraft.fetchedAt ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, fetchedAt: event.target.value }))} placeholder="YYYY-MM-DD 或 ISO 時間" /></label>
                    <label>證據層級<select value={sourceDraft.evidenceLevel ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, evidenceLevel: event.target.value as SourceBookmarkDraft['evidenceLevel'] || undefined }))}><option value="">未標記</option><option value="index-only">index-only</option><option value="official-summary">official-summary</option><option value="narrative">narrative</option><option value="full-dossier">full-dossier</option></select></label>
                    <label>自動抓取<select value={sourceDraft.autoFetch ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, autoFetch: event.target.value as SourceBookmarkDraft['autoFetch'] || undefined }))}><option value="">未標記</option><option value="enabled">enabled</option><option value="partial">partial</option><option value="manual">manual</option><option value="restricted">restricted</option></select></label>
                    <label>狀態<select value={sourceDraft.status ?? 'new'} onChange={(event) => setSourceDraft((draft) => ({ ...draft, status: event.target.value as SourceBookmarkDraft['status'] }))}><option value="new">new</option><option value="queued">queued</option><option value="downloaded">downloaded</option><option value="analysis-ready">analysis-ready</option><option value="failed">failed</option><option value="archived">archived</option></select></label>
                    <label>標籤<input value={typeof sourceDraft.tags === 'string' ? sourceDraft.tags : sourceDraft.tags?.join(', ') ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, tags: event.target.value }))} placeholder="pdf, uscg, fire" /></label>
                    <label>網盤/歸檔地址<input value={sourceDraft.storageUrl ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, storageUrl: event.target.value }))} placeholder="webdav:// 或 https://drive..." /></label>
                  </div> : null}
                </div>
                <div className="source-row-actions">
                  <a href={item.url} target="_blank" rel="noreferrer">打開網址</a>
                  {editing && props.canEditSources ? <>
                    <button className="text-button compact" type="button" onClick={() => { props.onSaveSource(item.id, sourceDraft); setEditingSourceId('') }}>保存</button>
                    <button className="text-button compact" type="button" onClick={() => setEditingSourceId('')}>取消</button>
                  </> : <>
                    <button className="text-button compact" type="button" onClick={() => { if (!props.canEditSources) { setSourcePermissionMessage('請先用操作員帳號登入；source_editor/editor/owner 才能修改來源。'); return } setSourcePermissionMessage(''); setEditingSourceId(item.id); setSourceDraft({ title: item.title, url: item.url, sourceType: item.sourceType, authority: item.authority ?? '', notes: item.notes ?? '', publishedAt: item.publishedAt ?? '', fetchedAt: item.fetchedAt ?? '', evidenceLevel: item.evidenceLevel, autoFetch: item.autoFetch, status: item.status ?? 'new', tags: item.tags?.join(', ') ?? '', storageUrl: item.storageUrl ?? '', pdfArchivedAt: item.pdfArchivedAt ?? '' }) }}>修改</button>
                    <button className="danger-button compact" type="button" onClick={() => { if (!props.canEditSources) { setSourcePermissionMessage('請先用操作員帳號登入；source_editor/editor/owner 才能刪除來源。'); return } setSourcePermissionMessage(''); props.onDeleteSource(item.id, deleteReason) }}>刪除</button>
                  </>}
                </div>
              </article>
            })}</div>
          </section>
        </>
      ) : null}

      {sourceTab === 'deleted' ? (
        <section className="panel collected-sources-panel full-span">
          <h2>已刪除來源</h2>
          <p className="panel-hint">這裡暫存已刪除來源；刪除滿 30 天後會在本機/同步時自動清除。</p>
          <div className="source-list deleted-source-list">{deletedSourceList.map((item) => <article key={item.id}>
            <div><strong>{item.title}</strong><span>{item.deletedAt ? `刪除時間：${item.deletedAt.slice(0, 10)}` : '已刪除'}{item.deletedBy ? ` · ${item.deletedBy}` : ''}</span>{item.deleteReason ? <small>{item.deleteReason}</small> : null}<a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></div>
            <button className="text-button compact" type="button" onClick={() => { if (!props.canEditSources) { setSourcePermissionMessage('請先用操作員帳號登入；source_editor/editor/owner 才能還原來源。'); return } props.onRestoreSource(item.id) }}>還原</button>
          </article>)}</div>
          {deletedSourceList.length === 0 ? <div className="empty-state"><strong>暫無已刪除來源</strong><span>刪除來源後會先出現在這裡。</span></div> : null}
        </section>
      ) : null}

      {sourceTab === 'pdf' ? <PdfInsightPanel sources={props.sources} /> : null}

      {sourceTab === 'refresh' ? (
        <section className="panel refresh-plan-panel full-span">
          <h2>後端自動抓取與補案策略</h2>
          <div className="server-refresh-box">
            <div>
              <strong>Vercel 後端刷新</strong>
              <p>{props.serverRefreshMessage}</p>
            </div>
            <label>
              Refresh token
              <input type="password" value={props.serverRefreshToken} onChange={(event) => props.onServerRefreshToken(event.target.value)} placeholder="輸入 PSC_REFRESH_TOKEN" />
            </label>
            <button className="primary-button" type="button" onClick={props.onServerRefresh} disabled={props.serverRefreshLoading || !props.serverRefreshToken.trim()}>{props.serverRefreshLoading ? '後端抓取中…' : '由後端獲取最新缺失'}</button>
          </div>
          <div className="refresh-plan-grid">
            {props.sourceGuides.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.autoFetch}</span><p>{item.refreshScope}</p><small>{item.nextAction}</small></article>)}
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default App
