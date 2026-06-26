import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPERATOR_ROSTER,
  buildAuditLog,
  canOperatorPerform,
  normalizeOperatorRoster,
  verifyOperatorIdentity,
  type OperatorIdentity,
} from './operatorAccess'

describe('operator access workflow', () => {
  it('normalizes the default roster and validates department/name identity', () => {
    const roster = normalizeOperatorRoster({ 海技組: [' 朱世毅 ', '朱世毅', '', '陳思樺'], 不存在: ['測試'] })

    expect(roster['海技組']).toEqual(['朱世毅', '陳思樺'])
    expect(roster['管理組']).toEqual([])
    expect(verifyOperatorIdentity({ department: '海技組', name: '朱世毅', role: 'operator' }, roster).valid).toBe(true)
    expect(verifyOperatorIdentity({ department: '海技組', name: '不在名單', role: 'operator' }, roster).valid).toBe(false)
  })

  it('allows operator identity to edit sources and findings but blocks admin-only actions', () => {
    const operator: OperatorIdentity = { department: '海技組', name: DEFAULT_OPERATOR_ROSTER['海技組'][0], role: 'operator' }

    expect(canOperatorPerform(operator, 'edit_source')).toBe(true)
    expect(canOperatorPerform(operator, 'delete_source')).toBe(true)
    expect(canOperatorPerform(operator, 'edit_finding')).toBe(true)
    expect(canOperatorPerform(operator, 'add_source')).toBe(true)
    expect(canOperatorPerform(operator, 'sync_dataset')).toBe(false)
    expect(canOperatorPerform(operator, 'manage_roster')).toBe(false)
    expect(canOperatorPerform(operator, 'purge_deleted')).toBe(false)
  })

  it('lets owner/admin identities perform every privileged action', () => {
    const admin: OperatorIdentity = { department: '海技組', name: '管理員', role: 'admin' }
    const owner: OperatorIdentity = { department: '管理層', name: 'Owner', role: 'owner' }

    expect(canOperatorPerform(admin, 'sync_dataset')).toBe(true)
    expect(canOperatorPerform(admin, 'manage_roster')).toBe(true)
    expect(canOperatorPerform(owner, 'purge_deleted')).toBe(true)
  })

  it('builds an audit log with actor and target details', () => {
    const log = buildAuditLog({
      actor: { department: '海技組', name: '朱世毅', role: 'operator' },
      action: 'edit_finding',
      targetType: 'finding',
      targetId: 'case-1#2',
      targetTitle: 'Fire damper failed',
      before: { priority: 'low' },
      after: { priority: 'high' },
      now: '2026-06-26T00:00:00.000Z',
    })

    expect(log.actorDepartment).toBe('海技組')
    expect(log.actorName).toBe('朱世毅')
    expect(log.action).toBe('edit_finding')
    expect(log.targetTitle).toBe('Fire damper failed')
    expect(log.after).toEqual({ priority: 'high' })
  })
})
