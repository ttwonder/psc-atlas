import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Download, FileDown, Menu, RefreshCw, Plus } from 'lucide-react'
import { CaseTable } from './components/CaseTable'
import { FilterBar } from './components/FilterBar'
import { FindingTable } from './components/FindingTable'
import { PdfInsightPanel } from './components/PdfInsightPanel'
import { Sidebar, type NavKey } from './components/Sidebar'
import { categories as seedCategories, inspectionCases, shipTypes as seedShipTypes } from './data/cases'
import { officialSourceMap, sourceCoverageSummary, autoFetchSummary } from './data/sourceMap'
import { activeSources, appendManualFindingToCase, createManualInspectionCase, deletedSources, getPriorityNovelFindings, markSourceDeleted, priorityLabel, purgeExpiredDeletedSources, restoreSource, updateFinding, updateSourceBookmark, type FindingDraft, type ManualCaseDraft, type SourceBookmarkDraft } from './lib/editorWorkflow'
import { exportCasesWorkbook } from './lib/excel'
import { canAddSources, canEditDataset, canEditSources, describeCloudError, getCloudUser, getEditorProfile, insertCloudAuditLog, isCloudConfigured, loadCloudDataset, loadCloudOperatorRoster, signInWithEmail, signOutCloud, upsertCloudDataset, upsertCloudOperatorRoster, upsertCloudSources, type EditorProfile } from './lib/cloudStorage'
import { runServerRefresh } from './lib/serverRefreshClient'
import { fetchLatestOfficialCases } from './lib/officialRefresh'
import { DEFAULT_OPERATOR_ROSTER, OPERATOR_ACTION_LABELS, OPERATOR_DEPARTMENTS, buildAuditLog, canOperatorPerform, cloudProfileToIdentity, identityFromRosterSelection, normalizeOperatorRoles, normalizeOperatorRoster, verifyOperatorIdentity, type OperatorAction, type OperatorAuditLog, type OperatorIdentity, type OperatorRoleMap, type OperatorRoster, type RosterManagedRole } from './lib/operatorAccess'
import { buildRegionalReport } from './lib/report'
import { loadStoredCases, loadStoredSources, mergeCases, mergeSources, saveStoredCases, saveStoredSources, sourceFromCase, sourceFromGuide, slugify } from './lib/storage'
import { calculateTrendSummary, filterCasesByRangeAndRegion, getRegions, timeRangeLabels } from './lib/trends'
import type { FindingPriority, InspectionCase, OfficialSourceGuide, SourceBookmark, TimeRangeKey } from './types'


const OPERATOR_ROSTER_STORAGE_KEY = 'psc_operator_roster'
const OPERATOR_AUDIT_STORAGE_KEY = 'psc_operator_audit_logs'
const OPERATOR_ROLES_STORAGE_KEY = 'psc_operator_roles'
const OPERATOR_ROLES_VERSION_STORAGE_KEY = 'psc_operator_roles_version'

function loadLocalOperatorRoster(): OperatorRoster {
  try {
    return normalizeOperatorRoster(JSON.parse(localStorage.getItem(OPERATOR_ROSTER_STORAGE_KEY) || 'null') ?? DEFAULT_OPERATOR_ROSTER)
  } catch {
    return normalizeOperatorRoster(DEFAULT_OPERATOR_ROSTER)
  }
}

function saveLocalOperatorRoster(roster: OperatorRoster) {
  localStorage.setItem(OPERATOR_ROSTER_STORAGE_KEY, JSON.stringify(normalizeOperatorRoster(roster)))
}

function loadLocalOperatorRoles(roster: OperatorRoster): OperatorRoleMap {
  try {
    const raw = JSON.parse(localStorage.getItem(OPERATOR_ROLES_STORAGE_KEY) || 'null')
    const roles = normalizeOperatorRoles(raw, roster)
    if (localStorage.getItem(OPERATOR_ROLES_VERSION_STORAGE_KEY) !== '2' && roles['航運處']?.['吳建泰處長']) {
      roles['航運處']['吳建泰處長'] = 'admin'
    }
    return roles
  } catch {
    return normalizeOperatorRoles(null, roster)
  }
}

function saveLocalOperatorRoles(roles: OperatorRoleMap, roster: OperatorRoster) {
  localStorage.setItem(OPERATOR_ROLES_STORAGE_KEY, JSON.stringify(normalizeOperatorRoles(roles, roster)))
  localStorage.setItem(OPERATOR_ROLES_VERSION_STORAGE_KEY, '2')
}

function loadLocalAuditLogs(): OperatorAuditLog[] {
  try {
    const value = JSON.parse(localStorage.getItem(OPERATOR_AUDIT_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function saveLocalAuditLogs(logs: OperatorAuditLog[]) {
  localStorage.setItem(OPERATOR_AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, 500)))
}


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
  const [operatorRoster, setOperatorRoster] = useState<OperatorRoster>(() => loadLocalOperatorRoster())
  const [operatorRoles, setOperatorRoles] = useState<OperatorRoleMap>(() => loadLocalOperatorRoles(loadLocalOperatorRoster()))
  const [currentOperator, setCurrentOperator] = useState<OperatorIdentity | null>(null)
  const [auditLogs, setAuditLogs] = useState<OperatorAuditLog[]>(() => loadLocalAuditLogs())
  const [pendingOperatorAction, setPendingOperatorAction] = useState<{ action: OperatorAction; targetTitle: string; onConfirm: (actor: OperatorIdentity) => void | Promise<void> } | null>(null)
  const [operatorIdentityMessage, setOperatorIdentityMessage] = useState('')
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
        try {
          const cloudRoster = await loadCloudOperatorRoster()
          if (cloudRoster) {
            setOperatorRoster(cloudRoster.roster)
            setOperatorRoles(cloudRoster.roles)
            saveLocalOperatorRoster(cloudRoster.roster)
            saveLocalOperatorRoles(cloudRoster.roles, cloudRoster.roster)
          }
        } catch (error) {
          console.warn('Load PSC operator roster failed', error)
        }
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

  async function loadLatestCloudState(reason = '手動同步') {
    if (!cloudConfigured) {
      setCloudMessage('尚未設定 Supabase，無法取得雲端最新內容；目前是本機快取資料。')
      return
    }
    setCloudLoading(true)
    try {
      const user = await getCloudUser()
      const profile = user ? await getEditorProfile() : null
      const dataset = await loadCloudDataset(inspectionCases, officialSourceMap)
      setCases(dataset.cases)
      setSources(dataset.sources)
      saveStoredCases(dataset.cases)
      saveStoredSources(dataset.sources)
      setCloudUserEmail(user?.email ?? null)
      setEditorProfile(profile)
      try {
        const cloudRoster = await loadCloudOperatorRoster()
        if (cloudRoster) {
          setOperatorRoster(cloudRoster.roster)
          setOperatorRoles(cloudRoster.roles)
          saveLocalOperatorRoster(cloudRoster.roster)
          saveLocalOperatorRoles(cloudRoster.roles, cloudRoster.roster)
        }
      } catch (error) {
        console.warn('Load PSC operator roster failed', error)
      }
      setCloudMessage(`${reason}完成：已載入雲端 ${dataset.cloudCaseCount} 筆案例、${dataset.cloudSourceCount} 個來源。${user ? `目前登入：${user.email}${profile ? `（${profile.role}）` : '（未在白名單）'}` : '目前未登入；若 Supabase RLS 僅允許登入寫入，修改只能先存本機。'}`)
    } catch (error) {
      setCloudMessage(`取得雲端最新內容失敗：${describeCloudError(error)}；已保留本機資料。`)
    } finally {
      setCloudLoading(false)
    }
  }

  useEffect(() => {
    if (!cloudConfigured) return
    const onFocus = () => { void loadLatestCloudState('自動同步最新') }
    const onVisibility = () => { if (document.visibilityState === 'visible') void loadLatestCloudState('自動同步最新') }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(() => { void loadLatestCloudState('自動同步最新') }, 60000)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
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

  function getAdminIdentity() {
    return cloudProfileToIdentity(editorProfile)
  }

  async function appendAuditLog(log: OperatorAuditLog) {
    const nextLogs = [log, ...auditLogs].slice(0, 500)
    setAuditLogs(nextLogs)
    saveLocalAuditLogs(nextLogs)
    if (cloudConfigured) {
      try { await insertCloudAuditLog(log) } catch (error) { setCloudMessage(`操作已完成，但 LOG 同步雲端失敗：${describeCloudError(error)}`) }
    }
  }

  function requestOperator(action: OperatorAction, targetTitle: string, run: (actor: OperatorIdentity) => void | Promise<void>) {
    const adminIdentity = getAdminIdentity()
    if (adminIdentity && canOperatorPerform(adminIdentity, action)) {
      void run(adminIdentity)
      return
    }
    if (currentOperator && verifyOperatorIdentity(currentOperator, operatorRoster).valid && canOperatorPerform(currentOperator, action)) {
      void run(currentOperator)
      return
    }
    setOperatorIdentityMessage('')
    setPendingOperatorAction({ action, targetTitle, onConfirm: run })
  }

  async function confirmOperatorIdentity(identity: OperatorIdentity) {
    if (!pendingOperatorAction) return
    const verification = verifyOperatorIdentity(identity, operatorRoster)
    if (!verification.valid) {
      setOperatorIdentityMessage(verification.message)
      return
    }
    if (!canOperatorPerform(identity, pendingOperatorAction.action)) {
      setOperatorIdentityMessage('這項操作需要 Owner 或管理員權限。')
      return
    }
    const pending = pendingOperatorAction
    setCurrentOperator(identity)
    setPendingOperatorAction(null)
    setOperatorIdentityMessage('')
    await pending.onConfirm(identity)
  }

  async function persistOperatorRoster(nextRoster: OperatorRoster, nextRoles: OperatorRoleMap = operatorRoles, forceCloudSync = false) {
    const normalized = normalizeOperatorRoster(nextRoster)
    const normalizedRoles = normalizeOperatorRoles(nextRoles, normalized)
    setOperatorRoster(normalized)
    setOperatorRoles(normalizedRoles)
    saveLocalOperatorRoster(normalized)
    saveLocalOperatorRoles(normalizedRoles, normalized)
    if (cloudConfigured && (forceCloudSync || canManageOperatorRoster)) {
      try { await upsertCloudOperatorRoster(normalized, normalizedRoles) } catch (error) { setCloudMessage(`操作員名單已保存到本機，但同步 Supabase 失敗：${describeCloudError(error)}`) }
    }
  }

  async function addRosterName(department: string, name: string, role: RosterManagedRole = 'operator') {
    requestOperator('manage_roster', `新增操作員 ${department}/${name}`, async (actor) => {
      const dept = department as keyof OperatorRoster
      const trimmed = name.trim()
      if (!trimmed || !operatorRoster[dept]) return
      const before = operatorRoster
      const next = normalizeOperatorRoster({ ...operatorRoster, [dept]: [...operatorRoster[dept], trimmed] })
      const nextRoles = normalizeOperatorRoles({ ...operatorRoles, [dept]: { ...(operatorRoles[dept] ?? {}), [trimmed]: role } }, next)
      await persistOperatorRoster(next, nextRoles, canOperatorPerform(actor, 'manage_roster'))
      await appendAuditLog(buildAuditLog({ actor, action: 'manage_roster', targetType: 'roster', targetId: dept, targetTitle: `新增 ${trimmed}`, before, after: next }))
    })
  }

  async function removeRosterName(department: string, name: string) {
    requestOperator('manage_roster', `移除操作員 ${department}/${name}`, async (actor) => {
      const dept = department as keyof OperatorRoster
      if (!operatorRoster[dept]) return
      const before = operatorRoster
      const next = normalizeOperatorRoster({ ...operatorRoster, [dept]: operatorRoster[dept].filter((item) => item !== name) })
      const deptRoles = { ...(operatorRoles[dept] ?? {}) }
      delete deptRoles[name]
      const nextRoles = normalizeOperatorRoles({ ...operatorRoles, [dept]: deptRoles }, next)
      await persistOperatorRoster(next, nextRoles, canOperatorPerform(actor, 'manage_roster'))
      await appendAuditLog(buildAuditLog({ actor, action: 'manage_roster', targetType: 'roster', targetId: dept, targetTitle: `移除 ${name}`, before, after: next }))
    })
  }


  async function updateRosterRole(department: string, name: string, role: RosterManagedRole) {
    requestOperator('manage_roster', `修改權限 ${department}/${name}`, async (actor) => {
      const dept = department as keyof OperatorRoster
      if (!operatorRoster[dept]?.includes(name)) return
      const before = operatorRoles
      const nextRoles = normalizeOperatorRoles({ ...operatorRoles, [dept]: { ...(operatorRoles[dept] ?? {}), [name]: role } }, operatorRoster)
      await persistOperatorRoster(operatorRoster, nextRoles, canOperatorPerform(actor, 'manage_roster'))
      await appendAuditLog(buildAuditLog({ actor, action: 'manage_roster', targetType: 'roster', targetId: `${department}/${name}`, targetTitle: `修改 ${name} 為 ${role === 'admin' ? '管理員' : '操作員'}`, before, after: nextRoles }))
      if (currentOperator?.department === department && currentOperator?.name === name) setCurrentOperator({ ...currentOperator, role })
    })
  }

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
      setCloudMessage(`已同步到雲端：${cases.length} 筆案例、${cases.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項滯留、${sources.length} 個來源。其他人重新打開網站即可看到。`)
    } catch (error) {
      setCloudMessage(`同步雲端失敗：${describeCloudError(error)}`)
    } finally {
      setCloudLoading(false)
    }
  }

  async function saveCurrentChangesToCloud() {
    if (!cloudConfigured) {
      setCloudMessage('尚未設定 Supabase，無法保存到雲端；目前只保存在本機瀏覽器。')
      return
    }
    requestOperator('edit_finding', '保存目前修改到雲端', async (actor) => {
      setCloudLoading(true)
      try {
        const user = await getCloudUser()
        const profile = user ? await getEditorProfile() : null
        setCloudUserEmail(user?.email ?? null)
        setEditorProfile(profile)
        if (!user) {
          // 嘗試匿名寫入；若 RLS 不允許，catch 會提示需要登入/調整 SQL。
          await upsertCloudDataset(cases, sources)
        } else if (canEditDataset(profile) || canOperatorPerform(actor, 'edit_finding')) {
          await upsertCloudDataset(cases, sources)
        } else {
          setCloudMessage('你已登入，但沒有保存資料集權限。請改用 Owner/Admin/editor 帳號，或在 Supabase RLS 開放 operator 寫入。')
          return
        }
        await upsertCloudOperatorRoster(operatorRoster, operatorRoles).catch(() => undefined)
        setCloudMessage(`保存修改完成：已嘗試同步 ${cases.length} 筆案例、${cases.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項滯留、${sources.length} 個來源。`)
        await appendAuditLog(buildAuditLog({ actor, action: 'edit_finding', targetType: 'dataset', targetId: 'current-dataset', targetTitle: '保存目前修改到雲端' }))
      } catch (error) {
        setCloudMessage(`保存修改失敗：${describeCloudError(error)}。本機修改仍已保存；若要所有人看到，請用 Owner/Admin 登入或更新 Supabase RLS。`)
      } finally {
        setCloudLoading(false)
      }
    })
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
      setServerRefreshMessage(`後端刷新完成：${result.messages?.join('；') || '無訊息'}；寫入/更新 ${result.insertedOrUpdatedCases ?? 0} 案例、${result.detainableDeficiencies ?? 0} 項滯留滯留。`)
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
      let cloudWriteMessage = cloudConfigured ? '已嘗試用部門/姓名模式寫入雲端資料庫。' : '目前使用本機資料。'
      if (cloudConfigured) {
        try {
          const user = await getCloudUser()
          const profile = user ? await getEditorProfile() : null
          setCloudUserEmail(user?.email ?? null)
          setEditorProfile(profile)
          if (!user || canEditDataset(profile)) {
            await upsertCloudDataset(merged, mergedSources)
            cloudWriteMessage = user ? '已同步寫入雲端資料庫。' : '已用匿名 operator policy 寫入雲端資料庫。'
          } else {
            cloudWriteMessage = '已在本機完成刷新；目前帳號沒有整批寫入權限。'
          }
        } catch (error) {
          cloudWriteMessage = `刷新結果已保存本機，但寫入雲端失敗：${describeCloudError(error)}`
        }
      }
      setUpdateMessage(`更新完成：${result.messages.join('；')}；已按要求排除 FPMC、排除非滯留滯留，只保留 2025 年以後滯留項。${cloudWriteMessage}資料庫累積 ${merged.length} 筆案例、${merged.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項滯留依據。`)
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
      const profile = user ? await getEditorProfile() : null
      await upsertCloudSources(merged)
      setCloudUserEmail(user?.email ?? null)
      setEditorProfile(profile)
      setCloudMessage(user ? successMessage : `${successMessage}（已用部門/姓名模式寫入雲端，無需 Supabase email 登入。）`)
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
      const profile = user ? await getEditorProfile() : null
      if (user && !canAddSources(profile)) {
        setEditorProfile(profile)
        setCloudMessage('來源已保存到本機；目前登入帳號未在來源提交白名單內。')
        return
      }
      await upsertCloudSources([item])
      setCloudUserEmail(user?.email ?? null)
      setEditorProfile(profile)
      setCloudMessage(user ? successMessage : `${successMessage}（已用部門/姓名模式寫入雲端，無需 Supabase email 登入。）`)
    } catch (error) {
      setCloudMessage(`來源已保存到本機，但同步新增來源失敗：${describeCloudError(error)}`)
    }
  }

  async function addManualSource() {
    const url = manualUrl.trim()
    if (!url) return
    const title = manualTitle.trim() || url
    requestOperator('add_source', title, async (actor) => {
      const item: SourceBookmark = {
        id: `manual-${slugify(url)}-${Date.now()}`,
        title,
        url,
        sourceType: '手動備忘',
        addedAt: new Date().toISOString(),
        manual: true,
        notes: manualNotes.trim(),
      }
      await persistNewSource(item, mergeSources(sources, [item]), `已把新來源保存：${item.title}`)
      await appendAuditLog(buildAuditLog({ actor, action: 'add_source', targetType: 'source', targetId: item.id, targetTitle: item.title, after: item }))
      setManualUrl(''); setManualTitle(''); setManualNotes('')
    })
  }

  async function saveSourceEdit(id: string, draft: SourceBookmarkDraft) {
    const before = sources.find((item) => item.id === id)
    requestOperator('edit_source', before?.title ?? id, async (actor) => {
      const after = before ? updateSourceBookmark(before, draft) : null
      const next = sources.map((item) => item.id === id && after ? after : item)
      await persistSources(next, `已更新來源：${draft.title || id}`)
      await appendAuditLog(buildAuditLog({ actor, action: 'edit_source', targetType: 'source', targetId: id, targetTitle: after?.title ?? draft.title ?? id, before, after }))
    })
  }

  async function softDeleteSource(id: string, reason = '') {
    const before = sources.find((item) => item.id === id)
    requestOperator('delete_source', before?.title ?? id, async (actor) => {
      const after = before ? markSourceDeleted(before, `${actor.department}/${actor.name}`, reason) : null
      const next = sources.map((item) => item.id === id && after ? after : item)
      await persistSources(next, '已移到「已刪除」板塊；30 天後會自動清除。')
      await appendAuditLog(buildAuditLog({ actor, action: 'delete_source', targetType: 'source', targetId: id, targetTitle: before?.title ?? id, before, after }))
    })
  }

  async function restoreDeletedSource(id: string) {
    const before = sources.find((item) => item.id === id)
    requestOperator('restore_source', before?.title ?? id, async (actor) => {
      const after = before ? restoreSource(before) : null
      const next = sources.map((item) => item.id === id && after ? after : item)
      await persistSources(next, '已還原來源。')
      await appendAuditLog(buildAuditLog({ actor, action: 'restore_source', targetType: 'source', targetId: id, targetTitle: before?.title ?? id, before, after }))
    })
  }

  async function saveFindingEdit(caseId: string, findingIndex: number, draft: FindingDraft) {
    const caseItem = cases.find((item) => item.id === caseId)
    const before = caseItem?.deficiencies[findingIndex]
    requestOperator('edit_finding', before?.original.slice(0, 80) ?? `${caseId}#${findingIndex}`, async (actor) => {
      const nextCases = updateFinding(cases, caseId, findingIndex, draft)
      const after = nextCases.find((item) => item.id === caseId)?.deficiencies[findingIndex]
      setCases(nextCases)
      saveStoredCases(nextCases)
      setSelected((current) => nextCases.find((item) => item.id === (current?.id ?? caseId)) ?? current)
      await appendAuditLog(buildAuditLog({ actor, action: 'edit_finding', targetType: 'finding', targetId: `${caseId}#${findingIndex}`, targetTitle: before?.original.slice(0, 120) ?? `${caseId}#${findingIndex}`, before, after }))
      if (!cloudConfigured) return
      try {
        const user = await getCloudUser()
        const profile = user ? await getEditorProfile() : null
        setCloudUserEmail(user?.email ?? null)
        setEditorProfile(profile)
        if (!user || canEditDataset(profile) || canOperatorPerform(actor, 'edit_finding')) {
          await upsertCloudDataset(nextCases, sources)
          setCloudMessage(user ? '滯留修改已自動同步到雲端，並已寫入 LOG。' : '滯留修改已保存到本機，並已嘗試匿名同步雲端；若其他人未看到，請檢查 Supabase RLS 是否允許 operator/anon 寫入。')
        } else {
          setCloudMessage('滯留修改已保存到本機並已記錄 LOG；目前帳號沒有同步雲端權限。')
        }
      } catch (error) {
        setCloudMessage(`滯留已保存到本機，但同步雲端失敗：${describeCloudError(error)}。若要所有人立即看到，請用 Owner/Admin 登入或更新 Supabase RLS。`)
      }
    })
  }

  async function saveManualCase(draft: ManualCaseDraft) {
    requestOperator('edit_finding', draft.vessel || '手動增加案例', async (actor) => {
      const manualCase = createManualInspectionCase(draft)
      const nextCases = mergeCases(cases, [manualCase])
      const nextSources = mergeSources(sources, [sourceFromCase(manualCase)])
      setCases(nextCases)
      setSources(nextSources)
      setSelected(manualCase)
      setActivePage('findings')
      saveStoredCases(nextCases)
      saveStoredSources(nextSources)
      await appendAuditLog(buildAuditLog({ actor, action: 'edit_finding', targetType: 'dataset', targetId: manualCase.id, targetTitle: `手動增加案例：${manualCase.vessel}`, after: manualCase }))
      if (!cloudConfigured) return
      try {
        await upsertCloudDataset(nextCases, nextSources)
        setCloudMessage(`已新增手動案例「${manualCase.vessel}」，並嘗試同步 ${manualCase.deficiencies.length} 項滯留到雲端。`)
      } catch (error) {
        setCloudMessage(`手動案例已保存本機，但同步雲端失敗：${describeCloudError(error)}`)
      }
    })
  }

  async function saveManualFinding(caseId: string, draft: FindingDraft) {
    const caseItem = cases.find((item) => item.id === caseId)
    requestOperator('edit_finding', `手動輸入滯留：${caseItem?.vessel ?? caseId}`, async (actor) => {
      const nextCases = appendManualFindingToCase(cases, caseId, draft)
      const afterCase = nextCases.find((item) => item.id === caseId)
      const after = afterCase?.deficiencies.at(-1)
      setCases(nextCases)
      saveStoredCases(nextCases)
      setSelected(afterCase ?? caseItem ?? null)
      await appendAuditLog(buildAuditLog({ actor, action: 'edit_finding', targetType: 'finding', targetId: `${caseId}#manual`, targetTitle: draft.original?.slice(0, 120) || '手動輸入滯留', after }))
      if (!cloudConfigured) return
      try {
        await upsertCloudDataset(nextCases, sources)
        setCloudMessage(`已新增手動滯留到「${afterCase?.vessel ?? caseId}」，並嘗試同步雲端。`)
      } catch (error) {
        setCloudMessage(`手動滯留已保存本機，但同步雲端失敗：${describeCloudError(error)}`)
      }
    })
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
  const adminIdentity = getAdminIdentity()
  const canManageOperatorRoster = Boolean((adminIdentity && canOperatorPerform(adminIdentity, 'manage_roster')) || (currentOperator && verifyOperatorIdentity(currentOperator, operatorRoster).valid && canOperatorPerform(currentOperator, 'manage_roster')))
  const hasWriteIdentity = Boolean(adminIdentity || (currentOperator && verifyOperatorIdentity(currentOperator, operatorRoster).valid))

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar active={activePage} collapsed={sidebarCollapsed} mobileOpen={mobileNavOpen} onToggle={() => { setSidebarCollapsed((value) => !value); setMobileNavOpen(false) }} onNavigate={navigate} />
      {mobileNavOpen ? <button className="nav-backdrop" type="button" aria-label="關閉導覽" onClick={() => setMobileNavOpen(false)} /> : null}
      <main className="main-content">
        <header className="page-header">
          <div><h1>PSC 滯留案例卷宗 App</h1><p>累積官方來源、近期趨勢、地區報告、預防自查清單與 Excel 匯出</p></div>
          <div className="header-actions">
            <button className="export-button" type="button" onClick={refreshLatest} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''} />獲取最新滯留</button>
            <button className="primary-button save-changes-button" type="button" onClick={saveCurrentChangesToCloud} disabled={cloudLoading}>保存修改</button>
            <button className="export-button" type="button" onClick={() => exportCasesWorkbook(filteredCases, sources, officialSourceMap)}><Download size={18} />匯出 Excel</button>
          </div>
          <button className="mobile-menu" type="button" aria-label="開啟導覽" onClick={() => setMobileNavOpen(true)}><Menu /></button>
        </header>

        <div className="update-strip"><span>{updateMessage}</span><span>目前累積：{cases.length} 案例 / {cases.reduce((sum, item) => sum + item.deficiencies.length, 0)} 項滯留 / {activeSources(sources).length} 個有效網址</span></div>
        <FilterBar query={query} region={region} shipType={shipType} category={category} timeRange={timeRange} detainedOnly={detainedOnly} regions={regions} shipTypes={shipTypes} categories={categories} onQueryChange={setQuery} onRegionChange={setRegion} onShipTypeChange={setShipType} onCategoryChange={setCategory} onTimeRangeChange={setTimeRange} onDetainedOnlyChange={setDetainedOnly} onReset={resetFilters} />

        {activePage === 'overview' ? <Overview trend={trend} cases={filteredCases} onSelect={selectCase} /> : null}
        {activePage === 'cases' ? <CasesPage cases={filteredCases} selected={selected} onSelect={selectCase} onAddManualCase={saveManualCase} /> : null}
        {activePage === 'findings' ? <FindingsPage cases={filteredCases} selected={selected} onSelect={selectCase} query={deferredQuery} categories={categories} canEdit={hasWriteIdentity} onRequestEdit={(targetTitle, proceed) => requestOperator('edit_finding', targetTitle, proceed)} onUpdateFinding={saveFindingEdit} onAddManualFinding={saveManualFinding} /> : null}
        {activePage === 'priority' ? <PriorityNovelPage cases={filteredCases} /> : null}
        {activePage === 'analysis' ? <AnalysisPage report={report} trend={trend} range={timeRange} onDownload={downloadReport} /> : null}
        {activePage === 'pdf' ? <PdfInsightPanel sources={sources} /> : null}
        {activePage === 'sources' ? <SourcesPage sources={sources} sourceGuides={officialSourceMap} manualUrl={manualUrl} manualTitle={manualTitle} manualNotes={manualNotes} loading={loading} updateMessage={updateMessage} cloudConfigured={cloudConfigured} cloudUserEmail={cloudUserEmail} cloudEmailInput={cloudEmailInput} cloudMessage={cloudMessage} cloudLoading={cloudLoading} serverRefreshToken={serverRefreshToken} serverRefreshMessage={serverRefreshMessage} serverRefreshLoading={serverRefreshLoading} onServerRefreshToken={setServerRefreshToken} onServerRefresh={refreshViaServer} onCloudEmail={setCloudEmailInput} onCloudSignIn={handleCloudSignIn} onCloudSignOut={handleCloudSignOut} onCloudSync={syncCurrentDatasetToCloud} onUrl={setManualUrl} onTitle={setManualTitle} onNotes={setManualNotes} onAdd={addManualSource} onRefresh={refreshLatest} onRequestOperator={requestOperator} onSaveSource={saveSourceEdit} onDeleteSource={softDeleteSource} onRestoreSource={restoreDeletedSource} canAddSources={true} canEditSources={hasWriteIdentity} editorProfile={editorProfile} /> : null}
        {activePage === 'permissions' ? <PermissionsPage cloudUserEmail={cloudUserEmail} editorProfile={editorProfile} currentOperator={currentOperator} operatorRoster={operatorRoster} operatorRoles={operatorRoles} auditLogs={auditLogs} canManageRoster={canManageOperatorRoster} onRequestAdminAccess={() => requestOperator('manage_roster', '進入權限管理頁', async () => {})} onClearOperator={() => setCurrentOperator(null)} onAddRosterName={addRosterName} onRemoveRosterName={removeRosterName} onUpdateRosterRole={updateRosterRole} /> : null}
      </main>
      {pendingOperatorAction ? <OperatorIdentityModal action={pendingOperatorAction.action} targetTitle={pendingOperatorAction.targetTitle} roster={operatorRoster} roles={operatorRoles} message={operatorIdentityMessage} onCancel={() => { setPendingOperatorAction(null); setOperatorIdentityMessage('') }} onConfirm={confirmOperatorIdentity} /> : null}
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
  return <section className="stat-grid"><article><span>案例數</span><strong>{trend.totalCases}</strong><small>{trend.region} · {timeRangeLabels[trend.range]}</small></article><article><span>滯留依據</span><strong>{trend.totalDetainableDeficiencies}</strong><small>逐項滯留累計</small></article><article><span>主要類別</span><strong>{trend.topCategories[0]?.category ?? '暫無'}</strong><small>{trend.topCategories[0]?.count ?? 0} 項</small></article><article><span>典型案例</span><strong>{trend.typicalCases[0]?.vessel ?? '暫無'}</strong><small>可點案例庫查看詳情</small></article></section>
}

function CasesPage(props: { cases: InspectionCase[]; selected: InspectionCase | null; onSelect: (item: InspectionCase) => void; onAddManualCase: (draft: ManualCaseDraft) => void }) {
  return (
    <div className="dossier-workbench">
      <ManualCaseForm onSubmit={props.onAddManualCase} />
      <section className="case-list evidence-card" aria-label="PSC 案例總清單">
        <header className="section-header"><div><h2>案例總清單</h2><p>點擊任一船舶，會跳到「滯留詳情」分頁中該船對應的滯留位置。</p></div></header>
        <CaseTable cases={props.cases} selectedId={props.selected?.id ?? null} onSelect={props.onSelect} />
      </section>
    </div>
  )
}

function ManualCaseForm({ onSubmit }: { onSubmit: (draft: ManualCaseDraft) => void }) {
  const [open, setOpen] = useState(false)
  const [vessel, setVessel] = useState('')
  const [imo, setImo] = useState('')
  const [flag, setFlag] = useState('')
  const [shipType, setShipType] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [port, setPort] = useState('')
  const [region, setRegion] = useState('')
  const [authority, setAuthority] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [summary, setSummary] = useState('')
  const [detentionItemsText, setDetentionItemsText] = useState('')
  const [message, setMessage] = useState('')

  function submit() {
    if (!vessel.trim()) { setMessage('請先輸入船名。'); return }
    if (!detentionItemsText.trim()) { setMessage('請至少輸入一條滯留內容。'); return }
    onSubmit({ vessel, imo, flag, shipType, date, port, region, authority, sourceUrl, sourceTitle: sourceUrl ? '手動輸入來源' : '手動輸入', summary, detentionItemsText })
    setMessage(`已提交「${vessel}」手動案例，請完成身份確認後保存。`)
    setOpen(false)
  }

  return <section className="panel manual-entry-panel">
    <header className="manual-entry-header"><div><p className="eyebrow">MANUAL CASE ENTRY</p><h2>手動增加案例</h2><p>可批量輸入同一案例中的多條滯留；每行格式：代碼 | 類別 | 滯留原文。</p></div><button className="primary-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? '收起' : '手動增加案例'}</button></header>
    {open ? <div className="manual-entry-grid">
      <label>船名<input value={vessel} onChange={(event) => setVessel(event.target.value)} placeholder="例如 MANUAL VESSEL" /></label>
      <label>IMO<input value={imo} onChange={(event) => setImo(event.target.value)} placeholder="可留空" /></label>
      <label>船旗<input value={flag} onChange={(event) => setFlag(event.target.value)} placeholder="Panama / Liberia..." /></label>
      <label>船型<input value={shipType} onChange={(event) => setShipType(event.target.value)} placeholder="Bulk carrier" /></label>
      <label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>港口<input value={port} onChange={(event) => setPort(event.target.value)} placeholder="Port" /></label>
      <label>地區<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="例如 Taiwan / PSC" /></label>
      <label>來源機關<input value={authority} onChange={(event) => setAuthority(event.target.value)} placeholder="手動輸入 / 官方機關" /></label>
      <label className="wide">來源網址<input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://... 可留空" /></label>
      <label className="wide">案例摘要<textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="簡述本次滯留案例" /></label>
      <label className="wide">批量滯留內容<textarea value={detentionItemsText} onChange={(event) => setDetentionItemsText(event.target.value)} placeholder={'07105 | 消防安全 | Fire door failed to close.\n10111 | ISM／安全管理 | SMS did not ensure maintenance.'} /></label>
      <div className="manual-entry-actions"><button className="primary-button" type="button" onClick={submit}>保存手動案例</button><button className="text-button" type="button" onClick={() => setOpen(false)}>取消</button></div>
    </div> : null}
    {message ? <p className="permission-note">{message}</p> : null}
  </section>
}

function FindingsPage(props: { cases: InspectionCase[]; selected: InspectionCase | null; onSelect: (item: InspectionCase) => void; query: string; categories: string[]; canEdit: boolean; onRequestEdit: (targetTitle: string, proceed: () => void) => void; onUpdateFinding: (caseId: string, findingIndex: number, draft: FindingDraft) => void; onAddManualFinding: (caseId: string, draft: FindingDraft) => void }) {
  return (
    <div className="dossier-workbench">
      <ManualFindingForm cases={props.cases} selected={props.selected} categories={props.categories} onSubmit={props.onAddManualFinding} />
      <section className="case-list evidence-card" aria-label="PSC 滯留詳情清單">
        <header className="section-header"><div><h2>滯留詳情清單</h2><p>這是獨立分頁；上方搜尋、時間段、地區、船型、滯留類別會同步篩選這張表。登入的操作員可修改分類、備註、關注度與新穎標記。</p></div></header>
        <FindingTable cases={props.cases} onSelect={props.onSelect} focusCaseId={props.selected?.id ?? null} globalQuery={props.query} categories={props.categories} canEdit={props.canEdit} onRequestEdit={props.onRequestEdit} onUpdateFinding={props.onUpdateFinding} />
      </section>
    </div>
  )
}

function ManualFindingForm({ cases, selected, categories, onSubmit }: { cases: InspectionCase[]; selected: InspectionCase | null; categories: string[]; onSubmit: (caseId: string, draft: FindingDraft) => void }) {
  const [open, setOpen] = useState(false)
  const [caseId, setCaseId] = useState(selected?.id ?? cases[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [category, setCategory] = useState(categories[0] ?? '操作／設備滯留')
  const [original, setOriginal] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<FindingPriority>('low')
  const [novel, setNovel] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (selected?.id) setCaseId(selected.id) }, [selected?.id])

  function submit() {
    if (!caseId) { setMessage('請先選擇案例。'); return }
    if (!original.trim()) { setMessage('請輸入滯留原文或說明。'); return }
    onSubmit(caseId, { code, category, original, notes, priority, novel, detentionGround: true })
    setMessage('已提交手動滯留，請完成身份確認後保存。')
    setOriginal(''); setNotes(''); setCode(''); setNovel(false); setOpen(false)
  }

  return <section className="panel manual-entry-panel">
    <header className="manual-entry-header"><div><p className="eyebrow">MANUAL DETENTION ENTRY</p><h2>手動輸入滯留</h2><p>給現有案例追加一條滯留，不需要進入完整修改表單。</p></div><button className="primary-button" type="button" onClick={() => setOpen((value) => !value)}>{open ? '收起' : '手動輸入滯留'}</button></header>
    {open ? <div className="manual-entry-grid compact">
      <label className="wide">選擇案例<select value={caseId} onChange={(event) => setCaseId(event.target.value)}>{cases.map((item) => <option key={item.id} value={item.id}>{item.date}｜{item.vessel}｜IMO {item.imo}</option>)}</select></label>
      <label>滯留代碼<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="07105 / 可留空" /></label>
      <label>類別<select value={category} onChange={(event) => setCategory(event.target.value)}>{Array.from(new Set([category, ...categories])).filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>關注度<select value={priority} onChange={(event) => setPriority(event.target.value as FindingPriority)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
      <label className="inline-check manual-inline-check"><input type="checkbox" checked={novel} onChange={(event) => setNovel(event.target.checked)} /> 新穎案例</label>
      <label className="wide">滯留原文 / 說明<textarea value={original} onChange={(event) => setOriginal(event.target.value)} placeholder="輸入官方原文或內部整理的滯留描述" /></label>
      <label className="wide">備註<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="預防措施、需跟蹤設備或內部備註" /></label>
      <div className="manual-entry-actions"><button className="primary-button" type="button" onClick={submit}>保存手動滯留</button><button className="text-button" type="button" onClick={() => setOpen(false)}>取消</button></div>
    </div> : null}
    {message ? <p className="permission-note">{message}</p> : null}
  </section>
}

function PriorityNovelPage({ cases }: { cases: InspectionCase[] }) {
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [novelFilter, setNovelFilter] = useState<'all' | 'novel' | 'not-novel'>('all')
  const rows = getPriorityNovelFindings(cases).filter(({ finding }) => {
    const priority = finding.priority ?? 'low'
    const matchesPriority = priorityFilter === 'all' || priority === priorityFilter
    const matchesNovel = novelFilter === 'all' || (novelFilter === 'novel' ? Boolean(finding.novel) : !finding.novel)
    return matchesPriority && matchesNovel
  })
  return (
    <div className="dossier-workbench">
      <section className="case-list evidence-card" aria-label="重點與新穎滯留">
        <header className="section-header"><div><h2>重點 + 新穎滯留</h2><p>只展示關注度為中/高或已勾選「新穎」的具體滯留原文；上方時間段和其他篩選同樣生效。</p></div></header>
        <div className="priority-filter-row">
          <label>關注程度
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}>
              <option value="all">全部關注程度</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
          <label>新穎案例
            <select value={novelFilter} onChange={(event) => setNovelFilter(event.target.value as typeof novelFilter)}>
              <option value="all">全部</option>
              <option value="novel">只看新穎案例</option>
              <option value="not-novel">不看新穎案例</option>
            </select>
          </label>
          <span>目前顯示 {rows.length} 項</span>
        </div>
        <div className="priority-finding-list">
          {rows.map(({ caseItem, finding, index }) => (
            <article key={`${caseItem.id}-${index}`}>
              <div className="priority-card-meta">
                <strong>地區：{caseItem.region}</strong>
                <span className={`priority-pill priority-${finding.priority ?? 'low'}`}>關注程度：{priorityLabel(finding.priority)}</span>
                <span className={`novel-toggle-pill ${finding.novel ? 'checked' : ''}`}>{finding.novel ? '☑' : '☐'} 新穎案例</span>
              </div>
              <p lang="en">{finding.original}</p>
              <small>{caseItem.vessel}｜{caseItem.date}｜{finding.code}｜{finding.category}</small>
            </article>
          ))}
        </div>
        {rows.length === 0 ? <div className="empty-state"><strong>目前沒有標記為中/高或新穎的滯留</strong><span>可到「滯留詳情」修改滯留關注度或勾選新穎。</span></div> : null}
      </section>
    </div>
  )
}

function buildPreventionActions(trend: ReturnType<typeof calculateTrendSummary>) {
  const actions = trend.topCategories.slice(0, 5).map((item) => `把「${item.category}」納入本週船舶預檢：按滯留原文逐項核對，至少抽查 ${Math.min(item.count, 10)} 個對應設備/文件/演習記錄。`)
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
          <p>所有圖表都受上方地區、期間、船型、類別篩選控制。索引-only 案例只作「最新跟蹤」，不混入可分析滯留結論。</p>
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
      <section className="panel"><h2>{timeRangeLabels[range]}主要滯留面向</h2><div className="category-bars">{trend.topCategories.map((item) => <div key={item.category}><span>{item.category}</span><strong>{item.count}</strong><progress max={trend.topCategories[0]?.count || 1} value={item.count} /></div>)}</div></section>
      <section className="panel"><h2>地區案件與趨勢</h2><div className="region-breakdown">{trend.regionBreakdown.map((item) => <article key={item.region}><strong>{item.region}</strong><span>{item.cases} 案 / {item.detainable} 項依據</span><small>分析可用 {item.analysisReady}｜索引待補 {item.indexOnly}</small></article>)}</div></section>
      <section className="panel"><h2>證據深度與狀態</h2><div className="mix-grid"><div>{trend.evidenceMix.map((item) => <p key={item.level}><b>{item.level}</b><span>{item.count} 案</span></p>)}</div><div>{trend.statusBreakdown.map((item) => <p key={item.status}><b>{item.status}</b><span>{item.count} 案</span></p>)}</div></div></section>
      <section className="panel"><h2>月份走勢（最近12個月份）</h2><div className="month-trend">{trend.monthlyTrend.map((item) => <div key={item.month}><span>{item.month}</span><progress max={maxMonthly} value={item.detainable} /><strong>{item.detainable}</strong></div>)}</div></section>
      <section className="panel matrix-panel"><h2>地區 × 滯留面向矩陣</h2><div className="matrix-list">{trend.categoryRegionMatrix.map((item) => <span key={`${item.category}-${item.region}`}>{item.region}<b>{item.category}</b><strong>{item.count}</strong></span>)}</div></section>
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
  onRequestOperator: (action: OperatorAction, targetTitle: string, run: (actor: OperatorIdentity) => void | Promise<void>) => void
  onSaveSource: (id: string, draft: SourceBookmarkDraft) => void | Promise<void>
  onDeleteSource: (id: string, reason?: string) => void | Promise<void>
  onRestoreSource: (id: string) => void | Promise<void>
}

function SourcesPage(props: SourcesPageProps) {
  const [sourceTab, setSourceTab] = useState<'guides' | 'collected' | 'deleted' | 'refresh'>('guides')
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
        <button className="primary-button" type="button" onClick={props.onRefresh} disabled={props.loading}><RefreshCw size={17} className={props.loading ? 'spin' : ''} />獲取最新滯留</button>
        <small>{props.updateMessage}</small>
      </section>
      <section className="panel cloud-panel full-span">
        <div>
          <p className="eyebrow">CLOUD DATABASE</p>
          <h2>雲端資料庫同步</h2>
          <p>{props.cloudMessage}</p>
          <small>{props.cloudConfigured ? (props.cloudUserEmail ? `已登入：${props.cloudUserEmail}｜角色：${props.editorProfile?.role ?? '未在白名單'}｜整批同步仍需 Owner/Admin；一般來源/滯留操作會用部門+姓名確認。` : 'Supabase 已設定；目前未登入。一般來源/滯留操作會用部門+姓名確認，雲端整批同步需 Owner/Admin。') : '尚未設定 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY；操作會保存在本機並記錄 LOG。'}</small>
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
            <h2>手動添加網址備忘</h2>
            <label>網址<input value={props.manualUrl} onChange={(event) => props.onUrl(event.target.value)} placeholder="https://..." /></label>
            <label>標題<input value={props.manualTitle} onChange={(event) => props.onTitle(event.target.value)} placeholder="例如：某港口 PSC detention notice" /></label>
            <label>備註<textarea value={props.manualNotes} onChange={(event) => props.onNotes(event.target.value)} placeholder="用途、需要回頭查的頁碼或重點" /></label>
            <button className="primary-button" type="button" onClick={props.onAdd} disabled={false}><Plus size={17} />加入網址清單</button>
            <small className="permission-note">新增/修改前會要求選擇部門和姓名；Owner/Admin 登入後可把資料同步到雲端。</small>
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
                    <label>登記/抓取時間<input value={sourceDraft.fetchedAt ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, fetchedAt: event.target.value }))} placeholder="YYYY-MM-DD 或 ISO 時間" /></label>
                    <label>證據層級<select value={sourceDraft.evidenceLevel ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, evidenceLevel: event.target.value as SourceBookmarkDraft['evidenceLevel'] || undefined }))}><option value="">未標記</option><option value="index-only">index-only</option><option value="official-summary">official-summary</option><option value="narrative">narrative</option><option value="full-dossier">full-dossier</option></select></label>
                    <label>自動抓取<select value={sourceDraft.autoFetch ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, autoFetch: event.target.value as SourceBookmarkDraft['autoFetch'] || undefined }))}><option value="">未標記</option><option value="enabled">enabled</option><option value="partial">partial</option><option value="manual">manual</option><option value="restricted">restricted</option></select></label>
                    <label>狀態<select value={sourceDraft.status ?? 'new'} onChange={(event) => setSourceDraft((draft) => ({ ...draft, status: event.target.value as SourceBookmarkDraft['status'] }))}><option value="new">new</option><option value="queued">queued</option><option value="downloaded">downloaded</option><option value="analysis-ready">analysis-ready</option><option value="failed">failed</option><option value="archived">archived</option></select></label>
                    <label>標籤<input value={typeof sourceDraft.tags === 'string' ? sourceDraft.tags : sourceDraft.tags?.join(', ') ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, tags: event.target.value }))} placeholder="pdf, uscg, fire" /></label>
                    <label>備用歸檔地址（可選）<input value={sourceDraft.storageUrl ?? ''} onChange={(event) => setSourceDraft((draft) => ({ ...draft, storageUrl: event.target.value }))} placeholder="可留空；若日後備份到網盤再填" /></label>
                  </div> : null}
                </div>
                <div className="source-row-actions">
                  <a href={item.url} target="_blank" rel="noreferrer">打開網址</a>
                  {editing && props.canEditSources ? <>
                    <button className="text-button compact" type="button" onClick={() => { props.onSaveSource(item.id, sourceDraft); setEditingSourceId('') }}>保存</button>
                    <button className="text-button compact" type="button" onClick={() => setEditingSourceId('')}>取消</button>
                  </> : <>
                    <button className="text-button compact" type="button" onClick={() => { const beginEdit = () => { setSourcePermissionMessage(''); setEditingSourceId(item.id); setSourceDraft({ title: item.title, url: item.url, sourceType: item.sourceType, authority: item.authority ?? '', notes: item.notes ?? '', publishedAt: item.publishedAt ?? '', fetchedAt: item.fetchedAt ?? '', evidenceLevel: item.evidenceLevel, autoFetch: item.autoFetch, status: item.status ?? 'new', tags: item.tags?.join(', ') ?? '', storageUrl: item.storageUrl ?? '', pdfArchivedAt: item.pdfArchivedAt ?? '' }) }; if (!props.canEditSources) { props.onRequestOperator('edit_source', item.title, beginEdit); return } beginEdit() }}>修改</button>
                    <button className="danger-button compact" type="button" onClick={() => { const runDelete = () => { setSourcePermissionMessage(''); props.onDeleteSource(item.id, deleteReason) }; if (!props.canEditSources) { props.onRequestOperator('delete_source', item.title, runDelete); return } runDelete() }}>刪除</button>
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
            <button className="text-button compact" type="button" onClick={() => { const runRestore = () => props.onRestoreSource(item.id); if (!props.canEditSources) { props.onRequestOperator('restore_source', item.title, runRestore); return } runRestore() }}>還原</button>
          </article>)}</div>
          {deletedSourceList.length === 0 ? <div className="empty-state"><strong>暫無已刪除來源</strong><span>刪除來源後會先出現在這裡。</span></div> : null}
        </section>
      ) : null}


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
            <button className="primary-button" type="button" onClick={props.onServerRefresh} disabled={props.serverRefreshLoading || !props.serverRefreshToken.trim()}>{props.serverRefreshLoading ? '後端抓取中…' : '由後端獲取最新滯留'}</button>
          </div>
          <div className="refresh-plan-grid">
            {props.sourceGuides.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.autoFetch}</span><p>{item.refreshScope}</p><small>{item.nextAction}</small></article>)}
          </div>
        </section>
      ) : null}
    </div>
  )
}


function OperatorIdentityModal({ action, targetTitle, roster, roles, message, onCancel, onConfirm }: {
  action: OperatorAction
  targetTitle: string
  roster: OperatorRoster
  roles: OperatorRoleMap
  message: string
  onCancel: () => void
  onConfirm: (identity: OperatorIdentity) => void | Promise<void>
}) {
  const [department, setDepartment] = useState<string>(OPERATOR_DEPARTMENTS[0])
  const [name, setName] = useState('')
  const names = roster[department as keyof OperatorRoster] ?? []
  useEffect(() => {
    setName((current) => names.includes(current) ? current : (names[0] ?? ''))
  }, [department, names])
  return (
    <div className="operator-modal-backdrop" role="dialog" aria-modal="true" aria-label="確認操作身份">
      <section className="operator-modal">
        <p className="eyebrow">OPERATOR CHECK</p>
        <h2>確認操作身份</h2>
        <p>本次操作：<strong>{OPERATOR_ACTION_LABELS[action]}</strong></p>
        <p className="operator-target">目標：{targetTitle}</p>
        <div className="operator-modal-grid">
          <label>部門
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {OPERATOR_DEPARTMENTS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>姓名
            <select value={name} onChange={(event) => setName(event.target.value)}>
              {names.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
        {message ? <div className="permission-note">{message}</div> : null}
        <p className="panel-hint">操作員只需選擇部門與姓名；Owner/Admin 若已用 Supabase 登入，會自動使用管理身份，不會跳此窗口。</p>
        <div className="operator-modal-actions">
          <button className="text-button compact" type="button" onClick={onCancel}>取消</button>
          <button className="primary-button" type="button" onClick={() => onConfirm(identityFromRosterSelection(department, name, roles))} disabled={!department || !name}>確認並執行</button>
        </div>
      </section>
    </div>
  )
}

function PermissionsPage({ cloudUserEmail, editorProfile, currentOperator, operatorRoster, operatorRoles, auditLogs, canManageRoster, onRequestAdminAccess, onClearOperator, onAddRosterName, onRemoveRosterName, onUpdateRosterRole }: {
  cloudUserEmail: string | null
  editorProfile: EditorProfile | null
  currentOperator: OperatorIdentity | null
  operatorRoster: OperatorRoster
  operatorRoles: OperatorRoleMap
  auditLogs: OperatorAuditLog[]
  canManageRoster: boolean
  onRequestAdminAccess: () => void
  onClearOperator: () => void
  onAddRosterName: (department: string, name: string, role?: RosterManagedRole) => void | Promise<void>
  onRemoveRosterName: (department: string, name: string) => void | Promise<void>
  onUpdateRosterRole: (department: string, name: string, role: RosterManagedRole) => void | Promise<void>
}) {
  const [department, setDepartment] = useState<string>(OPERATOR_DEPARTMENTS[0])
  const [name, setName] = useState('')
  const [newRole, setNewRole] = useState<RosterManagedRole>('operator')
  const totalNames = Object.values(operatorRoster).reduce((sum, names) => sum + names.length, 0)
  if (!canManageRoster) {
    return <div className="permissions-page"><section className="panel permissions-denied full-span"><p className="eyebrow">ACCESS CONTROL</p><h2>權限管理</h2><p>此頁只限 Owner 或管理員進入。普通操作員不能查看或修改人員名單與操作 LOG。</p><button className="primary-button" type="button" onClick={onRequestAdminAccess}>確認管理員 / Owner 身份</button><small>{cloudUserEmail ? `目前 Supabase 登入：${cloudUserEmail}｜角色：${editorProfile?.role ?? '未在管理白名單'}` : '目前未用 Owner/Admin 登入，也未確認管理員身份。'}</small></section></div>
  }
  return (
    <div className="permissions-page">
      <section className="panel permissions-hero full-span">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h2>權限管理</h2>
          <p>沿用「法規追蹤」規則：Owner 由 Supabase 設定；管理員可由 Supabase 或本頁人員名單指定；普通操作員使用預設部門/姓名名單，操作時才確認身份並寫入 LOG。</p>
        </div>
        <div className="permission-status-grid">
          <article><span>Supabase 身份</span><strong>{cloudUserEmail ?? '未登入'}</strong><small>{editorProfile?.role ?? '未在管理白名單'}</small></article>
          <article><span>本次操作員</span><strong>{currentOperator ? `${currentOperator.department}/${currentOperator.name}` : '未選擇'}</strong><small>{currentOperator?.role ?? '操作時彈窗確認'}</small>{currentOperator ? <button className="text-button compact" type="button" onClick={onClearOperator}>切換操作員</button> : null}</article>
          <article><span>操作員名單</span><strong>{totalNames}</strong><small>{OPERATOR_DEPARTMENTS.length} 個部門</small></article>
          <article><span>管理名單權限</span><strong>{canManageRoster ? '可維護' : '不可維護'}</strong><small>需要 Owner 或管理員身份</small></article>
        </div>
      </section>

      <section className="panel roster-panel">
        <h2>操作員預設名單</h2>
        <p className="panel-hint">一般操作員不需要 email 登入；修改來源/滯留時會從這裡選部門和姓名。名單維護只限 Owner 或管理員；可在每個人旁邊直接切換「操作員/管理員」。</p>
        <div className="roster-add-form">
          <label>部門<select value={department} onChange={(event) => setDepartment(event.target.value)}>{OPERATOR_DEPARTMENTS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} placeholder="輸入姓名" /></label>
          <label>權限<select value={newRole} onChange={(event) => setNewRole(event.target.value as RosterManagedRole)}><option value="operator">操作員</option><option value="admin">管理員</option></select></label>
          <button className="primary-button" type="button" disabled={!canManageRoster || !name.trim()} onClick={() => { onAddRosterName(department, name, newRole); setName('') }}>新增人員</button>
        </div>
        {!canManageRoster ? <div className="permission-note">目前不能維護名單；請用 Owner/Admin 帳號登入 Supabase。</div> : null}
        <div className="roster-list">
          {OPERATOR_DEPARTMENTS.map((dept) => <article key={dept}>
            <h3>{dept}<span>{operatorRoster[dept].length}</span></h3>
            <div>{operatorRoster[dept].map((person) => { const role = operatorRoles[dept]?.[person] ?? 'operator'; return <span key={person} className={`roster-person roster-role-${role}`}>{person}<select value={role} onChange={(event) => onUpdateRosterRole(dept, person, event.target.value as RosterManagedRole)} aria-label={`${person} 權限`}><option value="operator">操作員</option><option value="admin">管理員</option></select><button type="button" aria-label={`移除 ${person}`} onClick={() => onRemoveRosterName(dept, person)}>×</button></span> })}</div>
          </article>)}
        </div>
      </section>

      <section className="panel audit-panel">
        <h2>操作 LOG</h2>
        <p className="panel-hint">記錄來源、滯留與名單維護操作。若 Supabase 已建立 LOG 表，會嘗試同步到雲端；否則保存在本瀏覽器。</p>
        <div className="audit-log-list">
          {auditLogs.slice(0, 80).map((log) => <article key={log.id}>
            <div><strong>{OPERATOR_ACTION_LABELS[log.action]}</strong><span>{log.actorDepartment}/{log.actorName} · {log.actorRole}</span></div>
            <p>{log.targetTitle}</p>
            <small>{log.createdAt.replace('T', ' ').slice(0, 19)} · {log.targetType} · {log.targetId}</small>
          </article>)}
        </div>
        {auditLogs.length === 0 ? <div className="empty-state"><strong>暫無操作 LOG</strong><span>修改來源或滯留後會出現在這裡。</span></div> : null}
      </section>
    </div>
  )
}

export default App
