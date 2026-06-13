import { describe, it, expect } from 'vitest'
import {
  decideAutoSync,
  computeSyncFingerprint,
  stableStringify,
  AUTO_SYNC_STATE_LABEL,
  type AutoSyncInput,
} from '../autoSyncDecision'

// Phase D-0: 자동 동기화 "판정 엔진"의 계약을 고정한다(실제 자동 동기화는 아직 없음).

// 공통 베이스: enabled + cloud available + 기준선 있음 + 로컬 변경 없음(= idle).
const FP_BASE = 'aaa-111'
const baseInput = (over: Partial<AutoSyncInput> = {}): AutoSyncInput => ({
  autoSyncEnabled: true,
  baseline: {
    lastSyncedAt: '2026-06-10T00:00:00Z',
    lastCloudUpdatedAt: '2026-06-10T00:00:00Z',
    lastLocalFingerprint: FP_BASE,
  },
  cloud: { available: true, latestUpdatedAt: '2026-06-10T00:00:00Z' },
  currentLocalFingerprint: FP_BASE,
  ...over,
})

describe('decideAutoSync — 상태 판정', () => {
  it('자동 동기화 꺼짐 → disabled', () => {
    const d = decideAutoSync(baseInput({ autoSyncEnabled: false }))
    expect(d.state).toBe('disabled')
  })

  it('토글 OFF면 cloud 오류여도 disabled가 우선', () => {
    const d = decideAutoSync(baseInput({ autoSyncEnabled: false, cloud: null }))
    expect(d.state).toBe('disabled')
  })

  it('메타 없음 + cloud 있음 → needsInitialSync', () => {
    const d = decideAutoSync(
      baseInput({ baseline: {}, cloud: { available: true, latestUpdatedAt: '2026-06-10T00:00:00Z' } }),
    )
    expect(d.state).toBe('needsInitialSync')
  })

  it('기준선이 부분만 있어도(지문 없음) needsInitialSync', () => {
    const d = decideAutoSync(baseInput({ baseline: { lastSyncedAt: '2026-06-10T00:00:00Z' } }))
    expect(d.state).toBe('needsInitialSync')
  })

  it('local fingerprint만 변경 → canPush', () => {
    const d = decideAutoSync(baseInput({ currentLocalFingerprint: 'bbb-222' }))
    expect(d.state).toBe('canPush')
    expect(d.localChanged).toBe(true)
    expect(d.cloudChanged).toBe(false)
  })

  it('cloud updatedAt만 변경 → canPullMerge', () => {
    const d = decideAutoSync(
      baseInput({ cloud: { available: true, latestUpdatedAt: '2026-06-12T00:00:00Z' } }),
    )
    expect(d.state).toBe('canPullMerge')
    expect(d.localChanged).toBe(false)
    expect(d.cloudChanged).toBe(true)
  })

  it('local/cloud 둘 다 변경 → needsManualMerge', () => {
    const d = decideAutoSync(
      baseInput({
        currentLocalFingerprint: 'bbb-222',
        cloud: { available: true, latestUpdatedAt: '2026-06-12T00:00:00Z' },
      }),
    )
    expect(d.state).toBe('needsManualMerge')
    expect(d.localChanged).toBe(true)
    expect(d.cloudChanged).toBe(true)
  })

  it('local/cloud 모두 동일 → idle', () => {
    const d = decideAutoSync(baseInput())
    expect(d.state).toBe('idle')
    expect(d.localChanged).toBe(false)
    expect(d.cloudChanged).toBe(false)
  })

  it('cloud 상태 오류(available=false) → error', () => {
    const d = decideAutoSync(baseInput({ cloud: { available: false, latestUpdatedAt: null } }))
    expect(d.state).toBe('error')
  })

  it('cloud=null(미조회) → error', () => {
    const d = decideAutoSync(baseInput({ cloud: null }))
    expect(d.state).toBe('error')
  })

  it('알 수 없는/깨진 입력에도 throw하지 않고 error/disabled로 안전 처리', () => {
    // @ts-expect-error 의도적으로 깨진 입력
    expect(() => decideAutoSync(null)).not.toThrow()
    // @ts-expect-error
    expect(decideAutoSync(null).state).toBe('error')
    // @ts-expect-error
    expect(() => decideAutoSync(undefined)).not.toThrow()
    // @ts-expect-error 부분 입력(enabled 누락) → falsy → disabled
    expect(decideAutoSync({}).state).toBe('disabled')
  })

  it('모든 state에 한글 라벨이 존재한다', () => {
    ;(['disabled', 'idle', 'canPush', 'canPullMerge', 'needsManualMerge', 'needsInitialSync', 'error'] as const).forEach(
      (s) => {
        expect(typeof AUTO_SYNC_STATE_LABEL[s]).toBe('string')
        expect(AUTO_SYNC_STATE_LABEL[s].length).toBeGreaterThan(0)
      },
    )
  })
})

describe('computeSyncFingerprint / stableStringify — 안정성', () => {
  it('key 순서가 달라도 같은 지문이 나온다', () => {
    const a = { communityAiProjects: { x: 1, y: 2 }, tenderNotices: [1, 2, 3] }
    const b = { tenderNotices: [1, 2, 3], communityAiProjects: { y: 2, x: 1 } }
    expect(computeSyncFingerprint(a)).toBe(computeSyncFingerprint(b))
  })

  it('중첩 객체의 key 순서도 흔들리지 않는다', () => {
    const a = { k: { p: { a: 1, b: { c: 3, d: 4 } } } }
    const b = { k: { p: { b: { d: 4, c: 3 }, a: 1 } } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('내용이 바뀌면 지문이 바뀐다', () => {
    expect(computeSyncFingerprint({ a: [1] })).not.toBe(computeSyncFingerprint({ a: [2] }))
  })

  it('배열 순서는 데이터의 일부 — 순서가 다르면 지문이 다르다', () => {
    expect(computeSyncFingerprint({ a: [1, 2] })).not.toBe(computeSyncFingerprint({ a: [2, 1] }))
  })

  it('같은 입력은 항상 같은 지문(결정적)', () => {
    const v = { communityAiProjects: { projects: [{ id: 'A' }], activeProjectId: 'A' } }
    expect(computeSyncFingerprint(v)).toBe(computeSyncFingerprint(v))
  })

  it('null/빈 입력에도 안전하게 동작', () => {
    // @ts-expect-error 깨진 입력
    expect(() => computeSyncFingerprint(null)).not.toThrow()
    expect(typeof computeSyncFingerprint({})).toBe('string')
  })
})
