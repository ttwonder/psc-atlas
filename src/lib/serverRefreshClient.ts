export interface ServerRefreshResponse {
  ok: boolean
  messages?: string[]
  insertedOrUpdatedCases?: number
  insertedOrUpdatedSources?: number
  discoveredPdfSources?: number
  detainableDeficiencies?: number
  error?: string
}

const configuredApiUrl = import.meta.env.VITE_REFRESH_API_URL as string | undefined

export function getRefreshApiUrl() {
  return configuredApiUrl?.trim() || '/api/refresh'
}

export async function runServerRefresh(token: string, limit = 12): Promise<ServerRefreshResponse> {
  const apiUrl = getRefreshApiUrl()
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-psc-refresh-token': token,
    },
    body: JSON.stringify({ limit }),
  })
  const json = await response.json().catch(() => ({})) as ServerRefreshResponse
  if (!response.ok) throw new Error(json.error || `Server refresh failed: ${response.status}`)
  return json
}
