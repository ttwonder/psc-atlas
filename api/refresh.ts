import { createClient } from '@supabase/supabase-js'
import { fetchLatestOfficialCases } from '../src/lib/officialRefresh'
import { isRefreshAuthorized } from '../src/lib/serverRefreshAuth'
import { normalizeSupabaseTimestamp } from '../src/lib/cloudStorage'
import { sourceFromCase } from '../src/lib/storage'
import type { InspectionCase, SourceBookmark } from '../src/types'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-psc-refresh-token',
}

export default async function handler(req: any, res: any) {
  for (const [key, value] of Object.entries(corsHeaders)) res.setHeader(key, value)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const headers = headersFromRequest(req)
  if (!isRefreshAuthorized(headers, process.env.PSC_REFRESH_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized refresh token' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
  }

  const limit = Number(req.query?.limit ?? req.body?.limit ?? 12)
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  try {
    const result = await fetchLatestOfficialCases(Number.isFinite(limit) ? limit : 12)
    const incoming = result.cases.map(keepDetentionOnly).filter((item): item is InspectionCase => Boolean(item))
    const sources = incoming.map(sourceFromCase)

    if (incoming.length) {
      const { error } = await supabase.from('psc_cases').upsert(incoming.map(toCaseRow), { onConflict: 'id' })
      if (error) throw error
    }
    if (sources.length) {
      const { error } = await supabase.from('psc_sources').upsert(sources.map(toSourceRow), { onConflict: 'url' })
      if (error) throw error
    }
    await supabase.from('psc_sync_events').insert({
      event_type: 'server-refresh',
      message: result.messages.join('；'),
      case_count: incoming.length,
      source_count: sources.length,
    })

    return res.status(200).json({
      ok: true,
      messages: result.messages,
      insertedOrUpdatedCases: incoming.length,
      insertedOrUpdatedSources: sources.length,
      detainableDeficiencies: incoming.reduce((sum, item) => sum + item.deficiencies.length, 0),
    })
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}

function headersFromRequest(req: any) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (Array.isArray(value)) headers.set(key, value.join(','))
    else if (typeof value === 'string') headers.set(key, value)
  }
  return headers
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

function toCaseRow(item: InspectionCase) {
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

function toSourceRow(item: SourceBookmark) {
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
