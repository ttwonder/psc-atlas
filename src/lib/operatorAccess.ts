export type OperatorRole = 'owner' | 'admin' | 'operator'

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

export const OPERATOR_DEPARTMENTS = ['管理層', '管理組', '資材組', '營業處', '船工處', '安衛處', '航運處', '督導', '船員組', '航運組', '海技組'] as const

export type OperatorDepartment = typeof OPERATOR_DEPARTMENTS[number]

export type OperatorRoster = Record<OperatorDepartment, string[]>

export const DEFAULT_OPERATOR_ROSTER: OperatorRoster = {
  管理層: ['呂學修副總', '蔡宏仁協理', '李勻寧協理'],
  管理組: ['陳治先', '王昱民', '方憲鵬組長', '陳韋自', '紀煒邦', '李雅雯', '曾湘柔', '周麗如'],
  資材組: ['林建瑋', '鄧兆修', '鄧浚宏', '徐永兆', '王梓名', '林大詠', '周瑞廉組長', '楊延興', '許政子', '楊絜崴'],
  營業處: ['王慈芬', '劉小萍', '翁敏芳', '李純瑛', '魏利育', '賴思妤', '陳建中', '粘家萍', '邱義泰', '倪嘉', '李耿志'],
  船工處: ['廖晥妤', '吳燕桂', '楊弘羽', '王威譯', '李曜均', '劉煥章處長', '林冠辰', '盧玉玫', '林儀婷', '王昱斌', '賴朝瑜', '陳思翰', '顏仲楷'],
  安衛處: ['楊順婷', '施品帆', '紀芳琪', '蘇上銘', '韓竹雅', '劉定淮', '江佳勳', '張鼎東'],
  航運處: ['吳建泰處長'],
  督導: ['尹德垿', '蔡繼來', '翁振傑', '黃傑治', '陳寰頤', '李幸龍', '廖麗蓁', '張議榮', '林滄龍', '蔡明哲', '陳昱宏', '陳思慧', '張雅琪', '張和中', '張志林', '餘雙', '唐洪新', '秦冰', '黃燕華', '潘獻波', '毛剛'],
  船員組: ['徐意倫', '古美雪', '薛英林', '張育菁', '謝嘉穎', '王鈺婷', '湯雅帆', '陳必恆', '林竺諼', '鄭詩璇', '陳昱勳', '胡峻瑋', '吳思葦'],
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
  return ['add_source', 'edit_source', 'delete_source', 'restore_source', 'edit_finding'].includes(action)
}

export function cloudProfileToIdentity(profile: { email?: string | null, role?: string | null } | null | undefined): OperatorIdentity | null {
  if (!profile?.role) return null
  if (profile.role === 'owner') return { department: '管理層', name: profile.email || 'Owner', role: 'owner' }
  if (profile.role === 'editor' || profile.role === 'source_editor') return { department: '管理組', name: profile.email || '管理員', role: 'admin' }
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

export const OPERATOR_ACTION_LABELS: Record<OperatorAction, string> = {
  add_source: '新增來源',
  edit_source: '修改來源',
  delete_source: '刪除來源',
  restore_source: '還原來源',
  edit_finding: '修改缺陷',
  sync_dataset: '同步資料集',
  server_refresh: '後端刷新',
  manage_roster: '維護操作員名單',
  purge_deleted: '清理已刪除資料',
}
