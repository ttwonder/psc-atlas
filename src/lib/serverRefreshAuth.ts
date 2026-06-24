export function isRefreshAuthorized(headers: Headers, configuredToken?: string) {
  if (!configuredToken) return false
  const token = configuredToken.trim()
  if (!token) return false
  const customHeader = headers.get('x-psc-refresh-token')?.trim()
  if (customHeader && safeEqual(customHeader, token)) return true

  const authorization = headers.get('authorization') ?? ''
  const prefix = ['Bear', 'er '].join('')
  if (authorization.startsWith(prefix)) return safeEqual(authorization.slice(prefix.length).trim(), token)
  return false
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}
