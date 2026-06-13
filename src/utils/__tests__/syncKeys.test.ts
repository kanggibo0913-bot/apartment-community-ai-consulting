import { describe, it, expect } from 'vitest'
import { SYNC_GROUPS, SYNC_KEY_DEFS, SYNC_KEYS, SYNC_KEY_SET } from '../syncKeys'

// 동기화 대상 key의 단일 출처(syncKeys.ts) 계약을 고정한다.
// 프론트(SystemDataSyncPage)와 Netlify 함수(app-state.ts)가 이 모듈을 함께 import하므로
// 이 목록이 곧 양쪽의 화이트리스트다. 의도치 않은 추가/누락을 이 테스트가 잡는다.

// 현재 동기화 대상 정확한 23개 key (기존 ALLOWED_KEYS / SYNC_GROUPS와 동일해야 함).
const EXPECTED_KEYS = [
  'communityAiProjects',
  'tenderNotices',
  'tenderScheduleEvents',
  'bidNoticeChecklist',
  'estimateSheets',
  'bidCalculationSnapshots',
  'siteLaborCalendarInputsByProject',
  'siteLaborCostDataByProject',
  'siteLaborCostSnapshotsByProject',
  'siteLaborPayrollDraftByProject',
  'siteLaborPayrollSourcePrefByProject',
  'maintenanceRecordsByProject',
  'residentNoticeReportsByProject',
  'publishedResidentReportsByProject',
  'siteLaborCalendarInputs',
  'siteLaborCostData',
  'siteLaborCostSnapshots',
  'siteLaborPayrollDraft',
  'siteLaborPayrollSourcePref',
  'maintenanceRecords',
  'residentNoticeReports',
  'publishedResidentReports',
  'aiResultHistory',
]

describe('syncKeys 단일 출처', () => {
  it('정확히 기대한 23개 key를 가진다 (집합 일치)', () => {
    expect([...SYNC_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort())
    expect(SYNC_KEYS).toHaveLength(23)
  })

  it('중복 key가 없다', () => {
    expect(new Set(SYNC_KEYS).size).toBe(SYNC_KEYS.length)
    expect(SYNC_KEY_SET.size).toBe(SYNC_KEYS.length)
  })

  it('핵심 데이터 key를 포함한다', () => {
    expect(SYNC_KEY_SET.has('communityAiProjects')).toBe(true)
    expect(SYNC_KEY_SET.has('aiResultHistory')).toBe(true)
    expect(SYNC_KEY_SET.has('tenderNotices')).toBe(true)
  })

  it('동기화 비대상(UI 메타/보안 메타/레거시 단일/미사용 키)은 제외한다', () => {
    // 임시 UI 메타 — 동기화하면 안 됨
    expect(SYNC_KEY_SET.has('systemDataSyncMeta')).toBe(false)
    // 로컬 전용 마이그레이션 표식 — 클라우드와 공유 불필요
    expect(SYNC_KEY_SET.has('projectScopedLegacyMigration')).toBe(false)
    // 구 단일 데이터 키 — 동기화 대상 아님
    expect(SYNC_KEY_SET.has('apartmentCommunityData')).toBe(false)
    // storage.ts가 실제로 쓰지 않는 미사용 잔재 키 — 동기화 목록에 들어오면 안 됨
    expect(SYNC_KEY_SET.has('aiResultHistoryByProject')).toBe(false)
  })

  it('SYNC_KEY_DEFS는 그룹 items를 평면화한 것과 같다', () => {
    const flat = SYNC_GROUPS.flatMap((g) => g.items)
    expect(SYNC_KEY_DEFS).toEqual(flat)
    expect(SYNC_KEYS).toEqual(flat.map((d) => d.key))
  })

  it('모든 정의는 비어있지 않은 key와 label을 가진다', () => {
    SYNC_KEY_DEFS.forEach((d) => {
      expect(typeof d.key).toBe('string')
      expect(d.key.length).toBeGreaterThan(0)
      expect(typeof d.label).toBe('string')
      expect(d.label.length).toBeGreaterThan(0)
    })
  })

  it('7개 그룹으로 구성된다', () => {
    expect(SYNC_GROUPS).toHaveLength(7)
    SYNC_GROUPS.forEach((g) => {
      expect(g.title.length).toBeGreaterThan(0)
      expect(g.items.length).toBeGreaterThan(0)
    })
  })
})
