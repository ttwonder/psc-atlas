export type OperatorRole = 'owner' | 'admin' | 'operator'
export type RosterManagedRole = 'admin' | 'operator'
export type AdminPasswordMap = Record<string, string>
export const DEFAULT_OWNER_PASSWORD = 'PSC-OWNER-2026'

export type OperatorAction =
  | 'add_source'
  | 'edit_source'
  | 'delete_source'
  | 'restore_source'
  | 'edit_finding'
  | 'sync_dataset'
  | 'server_refresh'
  | 'manage_roster'
  | 'purge_deleted'

export interface OperatorIdentity {
  department: string
  name: string
  role: OperatorRole
}

export interface OperatorAuditLog {
  id: string
  createdAt: string
  actorDepartment: string
  actorName: string
  actorRole: OperatorRole
  action: OperatorAction
  targetType: 'source' | 'finding' | 'dataset' | 'roster' | 'refresh'
  targetId: string
  targetTitle: string
  before?: unknown
  after?: unknown
}

export const OPERATOR_DEPARTMENTS = ['航運處', '督導', '航運組', '海技組'] as const

export type OperatorDepartment = typeof OPERATOR_DEPARTMENTS[number]

export type OperatorRoster = Record<OperatorDepartment, string[]>
export type OperatorRoleMap = Record<OperatorDepartment, Record<string, RosterManagedRole>>

export const DEFAULT_OPERATOR_ROSTER: OperatorRoster = {
  航運處: ['吳建泰處長'],
  督導: ['尹德垿', '蔡繼來', '翁振傑', '黃傑治', '陳寰頤', '李幸龍', '廖麗蓁', '張議榮', '林滄龍', '蔡明哲', '陳昱宏', '陳思慧', '張雅琪', '張和中', '張志林', '餘雙', '唐洪新', '秦冰', '黃燕華', '潘獻波', '毛剛'],
  航運組: ['陳秀玉', '黃駿達', '江嘉卿', '陳秋縈', '溫雅媛', '王聖傑', '楊治華', '謝侑糖', '劉彥輝', '陳芮蓁'],
  海技組: ['朱世毅', '陳宜斌', '柯香吟', '陳思樺', '林建志', '張嘉珈', '吳易安'],
}

export function normalizeOperatorRoster(value: unknown): OperatorRoster {
  const source = value && typeof value === 'object' ? value as Partial<Record<string, unknown>> : {}
  return OPERATOR_DEPARTMENTS.reduce((acc, department) => {
    const entries = Array.isArray(source[department]) ? source[department] as unknown[] : []
    acc[department] = Array.from(new Set(entries.map((name) => String(name ?? '').trim()).filter(Boolean)))
    return acc
  }, {} as OperatorRoster)
}


export function normalizeOperatorRoles(value: unknown, roster: OperatorRoster = DEFAULT_OPERATOR_ROSTER): OperatorRoleMap {
  const source = value && typeof value === 'object' ? value as Partial<Record<string, unknown>> : {}
  const normalizedRoster = normalizeOperatorRoster(roster)
  return OPERATOR_DEPARTMENTS.reduce((acc, department) => {
    const rawDepartmentRoles = source[department]
    const roleRecord = rawDepartmentRoles && typeof rawDepartmentRoles === 'object' && !Array.isArray(rawDepartmentRoles)
      ? rawDepartmentRoles as Record<string, unknown>
      : {}
    acc[department] = normalizedRoster[department].reduce((deptAcc, name) => {
      const rawRole = roleRecord[name]
      const defaultRole = department === '航運處' && name === '吳建泰處長' ? 'admin' : 'operator'
      deptAcc[name] = rawRole === 'admin' ? 'admin' : rawRole === 'operator' ? 'operator' : defaultRole
      return deptAcc
    }, {} as Record<string, RosterManagedRole>)
    return acc
  }, {} as OperatorRoleMap)
}

export function roleForRosterMember(department: string, name: string, roles: OperatorRoleMap = normalizeOperatorRoles(null)) {
  if (department === '航運處' && name === '吳建泰處長') return 'admin' as RosterManagedRole
  if (!OPERATOR_DEPARTMENTS.includes(department as OperatorDepartment)) return 'operator' as RosterManagedRole
  return roles[department as OperatorDepartment]?.[name] === 'admin' ? 'admin' : 'operator'
}

export function identityFromRosterSelection(department: string, name: string, roles: OperatorRoleMap = normalizeOperatorRoles(null)): OperatorIdentity {
  return { department, name, role: roleForRosterMember(department, name, roles) }
}

export function verifyOperatorIdentity(identity: OperatorIdentity | null | undefined, roster: OperatorRoster = DEFAULT_OPERATOR_ROSTER) {
  if (!identity) return { valid: false, message: '請先選擇部門和姓名。' }
  const department = identity.department.trim()
  const name = identity.name.trim()
  if (identity.role === 'owner' || identity.role === 'admin') {
    if (!department || !name) return { valid: false, message: '管理身份缺少部門或姓名。' }
    return { valid: true, message: '管理身份已確認。' }
  }
  const normalized = normalizeOperatorRoster(roster)
  if (!OPERATOR_DEPARTMENTS.includes(department as OperatorDepartment)) return { valid: false, message: '部門不在操作員名單內。' }
  if (!normalized[department as OperatorDepartment].includes(name)) return { valid: false, message: '姓名不在該部門操作員名單內。' }
  return { valid: true, message: '操作員身份已確認。' }
}

export function canOperatorPerform(identity: OperatorIdentity | null | undefined, action: OperatorAction) {
  if (!identity) return false
  if (identity.role === 'owner' || identity.role === 'admin') return true
  return ['add_source', 'edit_source', 'delete_source', 'restore_source', 'edit_finding', 'server_refresh'].includes(action)
}

export function cloudProfileToIdentity(profile: { email?: string | null, role?: string | null } | null | undefined): OperatorIdentity | null {
  if (!profile?.role) return null
  if (profile.role === 'owner') return { department: '海技組', name: profile.email || 'Owner', role: 'owner' }
  if (profile.role === 'admin' || profile.role === 'editor' || profile.role === 'source_editor') return { department: '海技組', name: profile.email || '管理員', role: 'admin' }
  return null
}

export function buildAuditLog({ actor, action, targetType, targetId, targetTitle, before, after, now = new Date().toISOString() }: {
  actor: OperatorIdentity
  action: OperatorAction
  targetType: OperatorAuditLog['targetType']
  targetId: string
  targetTitle: string
  before?: unknown
  after?: unknown
  now?: string
}): OperatorAuditLog {
  return {
    id: `${now}-${action}-${targetType}-${targetId}`.replace(/[^a-zA-Z0-9_-]+/g, '-'),
    createdAt: now,
    actorDepartment: actor.department,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    targetTitle,
    before,
    after,
  }
}

export function normalizeAdminPasswordMap(value: unknown): AdminPasswordMap {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return Object.entries(source).reduce((acc, [key, rawPassword]) => {
    const normalizedKey = key.trim()
    const password = typeof rawPassword === 'string' ? rawPassword.trim() : ''
    if (normalizedKey && password) acc[normalizedKey] = password
    return acc
  }, {} as AdminPasswordMap)
}

export function verifyOwnerPassword(input: string, storedPassword = DEFAULT_OWNER_PASSWORD) {
  return input.trim().length > 0 && input.trim() === storedPassword.trim()
}

export function adminPasswordKey(department: string, name: string) {
  return `${department.trim()}/${name.trim()}`
}

export const OPERATOR_ACTION_LABELS: Record<OperatorAction, string> = {
  add_source: '新增來源',
  edit_source: '修改來源',
  delete_source: '刪除來源',
  restore_source: '還原來源',
  edit_finding: '修改滯留',
  sync_dataset: '同步資料集',
  server_refresh: '後端刷新',
  manage_roster: '維護操作員名單',
  purge_deleted: '清理已刪除資料',
}
