import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { InspectionCase, OfficialSourceGuide, SourceBookmark } from '../types'
import { mergeCases, mergeSources, sourceFromCase, sourceFromGuide } from './storage'

export interface CloudCaseRow {
  id: string
  vessel: string
  imo: string
  region: string
  port: string
  inspection_date: string
  status: string
  evidence_level: string
  deficiency_count: number
  detention_ground_count: number
  source_url: string
  payload: InspectionCase
}

export interface CloudSourceRow {
  id: string
  title: string
  url: string
  source_type: string
  authority: string | null
  manual: boolean
  added_at: string
  payload: SourceBookmark
}

export interface CloudDataset {
  cases: InspectionCase[]
  sources: SourceBookmark[]
  cloudCaseCount: number
  cloudSourceCount: number
}

export interface EditorProfile {
  email: string
  role: 'owner' | 'editor' | 'source_editor'
  active: boolean
  can_add_sources: boolean
  can_sync_dataset: boolean
  can_refresh: boolean
}

export function canEditDataset(profile: EditorProfile | null) {
  return Boolean(profile?.active && (profile.role === 'owner' || profile.role === 'editor' || profile.can_sync_dataset))
}

export function canEditSources(profile: EditorProfile | null) {
  return Boolean(profile?.active && (profile.role === 'owner' || profile.role === 'editor' || profile.role === 'source_editor' || profile.can_add_sources))
}

export function canAddSources(profile: EditorProfile | null) {
  return Boolean(profile?.active && profile.can_add_sources)
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

export function isCloudConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient() {
  if (!isCloudConfigured()) return null
  if (!client) client = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return client
}

export function toCloudCaseRow(item: InspectionCase): CloudCaseRow {
  return {
    id: item.id,
    vessel: item.vessel,
    imo: item.imo,
    region: item.region,
    port: item.port,
    inspection_date: item.date,
    status: item.status,
    evidence_level: item.evidenceLevel,
    deficiency_count: item.deficiencies.length,
    detention_ground_count: item.deficiencies.filter((entry) => entry.detentionGround === true).length,
    source_url: item.source.url,
    payload: item,
  }
}

export function fromCloudCaseRow(row: CloudCaseRow | { payload: InspectionCase }) {
  return row.payload
}

export function toCloudSourceRow(item: SourceBookmark): CloudSourceRow {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    source_type: item.sourceType,
    authority: item.authority ?? null,
    manual: item.manual,
    added_at: normalizeSupabaseTimestamp(item.addedAt),
    payload: item,
  }
}

export function normalizeSupabaseTimestamp(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01T00:00:00.000Z`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`
  const parsed = Date.parse(raw)
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

export function fromCloudSourceRow(row: CloudSourceRow | { payload: SourceBookmark }) {
  return row.payload
}

export async function getCloudUser(): Promise<User | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

export async function getEditorProfile(): Promise<EditorProfile | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const user = await getCloudUser()
  const email = user?.email?.toLowerCase()
  if (!email) return null
  const { data, error } = await supabase
    .from('psc_editors')
    .select('email, role, active, can_add_sources, can_sync_dataset, can_refresh')
    .eq('email', email)
    .maybeSingle()
  if (error || !data) return null
  return data as EditorProfile
}

export async function signInWithEmail(email: string) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('尚未設定 Supabase URL / anon key')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  })
  if (error) throw error
}

export async function signOutCloud() {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function loadCloudDataset(fallbackCases: InspectionCase[], sourceGuides: OfficialSourceGuide[]): Promise<CloudDataset> {
  const fallbackSources = mergeSources(fallbackCases.map(sourceFromCase), sourceGuides.map(sourceFromGuide))
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { cases: mergeCases([], fallbackCases), sources: fallbackSources, cloudCaseCount: 0, cloudSourceCount: 0 }
  }

  const [caseResult, sourceResult] = await Promise.all([
    supabase.from('psc_cases').select('payload').order('inspection_date', { ascending: false }),
    supabase.from('psc_sources').select('payload').order('added_at', { ascending: false }),
  ])

  if (caseResult.error) throw caseResult.error
  if (sourceResult.error) throw sourceResult.error

  const cloudCases = (caseResult.data ?? []).map((row) => fromCloudCaseRow(row as { payload: InspectionCase }))
  const cloudSources = (sourceResult.data ?? []).map((row) => fromCloudSourceRow(row as { payload: SourceBookmark }))

  return {
    cases: mergeCases(fallbackCases, cloudCases),
    sources: mergeSources(fallbackSources, cloudSources),
    cloudCaseCount: cloudCases.length,
    cloudSourceCount: cloudSources.length,
  }
}

export function describeCloudError(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const primary = record.message || record.error_description || record.error || record.hint || record.details || record.code
    const extras = [record.details, record.hint, record.code].filter((item) => item && item !== primary).map(String)
    if (primary) return [String(primary), ...extras].join('；')
    try { return JSON.stringify(error) } catch { return String(error) }
  }
  return String(error)
}

export async function upsertCloudCases(cases: InspectionCase[]) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('尚未設定 Supabase URL / anon key')
  const rows = cases.map(toCloudCaseRow)
  const { error } = await supabase.from('psc_cases').upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertCloudSources(sources: SourceBookmark[]) {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('尚未設定 Supabase URL / anon key')
  const rows = sources.map(toCloudSourceRow)
  const { error } = await supabase.from('psc_sources').upsert(rows, { onConflict: 'url' })
  if (error) throw error
}

export async function upsertCloudDataset(cases: InspectionCase[], sources: SourceBookmark[]) {
  await upsertCloudCases(cases)
  await upsertCloudSources(sources)
}
