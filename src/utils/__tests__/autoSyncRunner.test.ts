import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  runAutoSyncOnce,
  type AutoSyncRunArgs,
  type AutoSyncRunDeps,
  type PushOutcome,
  type PullPayload,
  type ApplyMergeOutcome,
} from '../autoSyncRunner'
import { SYNC_KEY_SET } from '../syncKeys'

// Phase D-1: 자동 동기화 "실행 코어"의 계약을 고정한다.
// 실제 네트워크/스토리지 없이 deps stub만으로 모든 분기를 검증한다.

const NOW = '2026-06-14T00:00:00Z'

// 기본: enabled + 기준선 있음. (현재 cloud='C0', 현재 지문='FP0' = 기준선과 동일 → idle 기본값)
const baseArgs = (over: Partial<AutoSyncRunArgs> = {}): AutoSyncRunArgs => ({
  autoSyncEnabled: true,
  baseline: { lastSyncedAt: 'S0', lastCloudUpdatedAt: 'C0', lastLocalFingerprint: 'FP0' },
  ...over,
})

const makeDeps = (over: Partial<AutoSyncRunDeps> = {}) => {
  const deps: AutoSyncRunDeps = {
    now: vi.fn(() => NOW),
    getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C0' })),
    getLocalFingerprint: vi.fn(() => 'FP0'),
    confirmPush: vi.fn(() => true), // 기본: 사용자 승인
    push: vi.fn(async (): Promise<PushOutcome> => ({ ok: true, saved: 5 })),
    backup: vi.fn(() => 'homebase-local-backup-x.json'),
    pull: vi.fn(
      async (): Promise<PullPayload> => ({ ok: true, items: { tenderNotices: [1] }, updatedAt: { tenderNotices: 'C1' } }),
    ),
    applyMerge: vi.fn(
      (_pull): ApplyMergeOutcome => ({ applied: 3, mergedFingerprint: 'FPmerged', cloudLatest: 'C1' }),
    ),
    ...over,
  }
  return deps
}

describe('runAutoSyncOnce — 상태별 동작', () => {
  it('disabled: 토글 OFF면 어떤 deps도 호출하지 않고 즉시 중단', async () => {
    const deps = makeDeps()
    const res = await runAutoSyncOnce(baseArgs({ autoSyncEnabled: false }), deps)
    expect(res.outcome).toBe('disabled')
    expect(res.acted).toBe(false)
    // 네트워크/읽기/시각 등 어떤 deps도 부르지 않는다.
    expect(deps.now).not.toHaveBeenCalled()
    expect(deps.getCloudSignal).not.toHaveBeenCalled()
    expect(deps.getLocalFingerprint).not.toHaveBeenCalled()
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.backup).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
    expect(deps.applyMerge).not.toHaveBeenCalled()
    // 메타도 건드리지 않는다.
    expect(res.metaPatch).toEqual({})
  })

  it('needsInitialSync: 기준선 없으면 안내만 하고 쓰기 안 함', async () => {
    const deps = makeDeps()
    const res = await runAutoSyncOnce(baseArgs({ baseline: {} }), deps)
    expect(res.outcome).toBe('needsInitialSync')
    expect(res.acted).toBe(false)
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
    expect(deps.backup).not.toHaveBeenCalled()
    expect(deps.applyMerge).not.toHaveBeenCalled()
    expect(res.metaPatch.lastAutoSyncStatus).toBe('success')
    expect(res.metaPatch.lastAutoSyncAttemptAt).toBe(NOW)
  })

  it('idle: 변경 없음이면 네트워크 쓰기 없음', async () => {
    const deps = makeDeps() // 기본값이 idle(cloud=C0, fp=FP0, 기준선 동일)
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('idle')
    expect(res.acted).toBe(false)
    expect(deps.getCloudSignal).toHaveBeenCalledTimes(1) // 읽기는 허용(신선 판정용)
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.backup).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
    expect(deps.applyMerge).not.toHaveBeenCalled()
  })

  it('canPush: cloud가 기준선과 동일하면 push 1회 호출, 저장 후 기준선 갱신', async () => {
    // 로컬만 변경: 지문 FP1(≠FP0), cloud는 C0(기준선과 동일).
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C0' })),
      push: vi.fn(async () => ({ ok: true, saved: 7 })),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('pushed')
    expect(res.acted).toBe(true)
    expect(deps.push).toHaveBeenCalledTimes(1)
    expect(deps.backup).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
    // 저장 직후 cloud 재조회로 기준선(lastCloudUpdatedAt) 확보 → getCloudSignal 2회.
    expect(deps.getCloudSignal).toHaveBeenCalledTimes(2)
    expect(res.metaPatch.lastSyncedAt).toBe(NOW)
    expect(res.metaPatch.lastCloudUpdatedAt).toBe('C0')
    expect(res.metaPatch.lastLocalFingerprint).toBe('FP1')
    expect(res.metaPatch.lastAutoSyncStatus).toBe('success')
    expect(res.metaPatch.lastAutoSyncError).toBeUndefined()
    expect(res.shouldReload).toBe(false) // push는 새로고침 불필요
  })

  it('canPush + confirm 승인(true)이면 push 호출', async () => {
    const confirmPush = vi.fn(() => true)
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C0' })),
      confirmPush,
      push: vi.fn(async () => ({ ok: true, saved: 3 })),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(confirmPush).toHaveBeenCalledTimes(1)
    expect(res.outcome).toBe('pushed')
    expect(deps.push).toHaveBeenCalledTimes(1)
  })

  it('canPush + confirm 취소(false)면 push 호출 안 함, outcome=cancelled', async () => {
    const confirmPush = vi.fn(() => false)
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C0' })),
      confirmPush,
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(confirmPush).toHaveBeenCalledTimes(1)
    expect(res.outcome).toBe('cancelled')
    expect(res.acted).toBe(false)
    expect(deps.push).not.toHaveBeenCalled() // 핵심: 취소 시 POST 없음
    // 취소는 성공도 실패도 아니므로 기준선/status를 바꾸지 않는다(시도 시각만 기록).
    expect(res.metaPatch.lastSyncedAt).toBeUndefined()
    expect(res.metaPatch.lastAutoSyncStatus).toBeUndefined()
  })

  it('confirm은 canPush에서만 — idle/needsManualMerge 등에서는 confirmPush를 부르지 않는다', async () => {
    const confirmPush = vi.fn(() => true)
    const idle = await runAutoSyncOnce(baseArgs(), makeDeps({ confirmPush }))
    expect(idle.outcome).toBe('idle')
    expect(confirmPush).not.toHaveBeenCalled()
  })

  it('canPush 직전 cloud가 바뀌면 save 호출하지 않고 needsManualMerge로 전환', async () => {
    // 로컬도 변경(FP1)인데 실행 직전 cloud도 바뀜(C1≠기준선 C0) → 신선 재판정 = needsManualMerge.
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C1' })),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('needsManualMerge')
    expect(res.acted).toBe(false)
    expect(deps.push).not.toHaveBeenCalled() // 핵심: stale push 차단
    expect(deps.backup).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
  })

  it('canPullMerge: backup → pull → applyMerge 순서 보장 + 기준선 갱신 + 새로고침 요청', async () => {
    // cloud만 변경(C1), 로컬 그대로(FP0) → canPullMerge.
    const backup = vi.fn(() => 'backup-1.json')
    const pull = vi.fn(
      async (): Promise<PullPayload> => ({ ok: true, items: { tenderNotices: [1] }, updatedAt: { tenderNotices: 'C1' } }),
    )
    const applyMerge = vi.fn(
      (): ApplyMergeOutcome => ({ applied: 4, mergedFingerprint: 'FPm', cloudLatest: 'C1' }),
    )
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP0'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C1' })),
      backup,
      pull,
      applyMerge,
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('pulledMerged')
    expect(res.acted).toBe(true)
    expect(res.shouldReload).toBe(true)
    // 호출 순서: backup이 pull보다, pull이 applyMerge보다 먼저.
    expect(backup).toHaveBeenCalledTimes(1)
    expect(applyMerge).toHaveBeenCalledTimes(1)
    expect(backup.mock.invocationCallOrder[0]).toBeLessThan(pull.mock.invocationCallOrder[0])
    expect(pull.mock.invocationCallOrder[0]).toBeLessThan(applyMerge.mock.invocationCallOrder[0])
    // 기준선 갱신: 병합 후 지문 + cloud 최신값.
    expect(res.metaPatch.lastSyncedAt).toBe(NOW)
    expect(res.metaPatch.lastLocalFingerprint).toBe('FPm')
    expect(res.metaPatch.lastCloudUpdatedAt).toBe('C1')
    expect(res.metaPatch.lastAutoSyncStatus).toBe('success')
    // push는 절대 호출 안 함.
    expect(deps.push).not.toHaveBeenCalled()
  })

  it('needsManualMerge: 양쪽 변경이면 save/load 둘 다 호출 안 함', async () => {
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'), // 로컬 변경
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C1' })), // cloud 변경
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('needsManualMerge')
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
    expect(deps.backup).not.toHaveBeenCalled()
    expect(deps.applyMerge).not.toHaveBeenCalled()
  })

  it('canPush인데 push 실패: lastAutoSyncStatus=error + 에러 메시지 기록', async () => {
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C0' })),
      push: vi.fn(async () => ({ ok: false, saved: 0, message: '업서트 실패' })),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('error')
    expect(res.metaPatch.lastAutoSyncStatus).toBe('error')
    expect(res.metaPatch.lastAutoSyncError).toBe('업서트 실패')
    // 실패 시 기준선(lastSyncedAt)은 갱신하지 않는다.
    expect(res.metaPatch.lastSyncedAt).toBeUndefined()
  })

  it('cloud 상태 조회가 throw해도 throw하지 않고 error로 안전 처리', async () => {
    const deps = makeDeps({
      getCloudSignal: vi.fn(async () => {
        throw new Error('네트워크 끊김')
      }),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('error')
    expect(res.metaPatch.lastAutoSyncStatus).toBe('error')
    expect(res.metaPatch.lastAutoSyncError).toContain('네트워크 끊김')
  })

  it('canPullMerge에서 백업 생성 실패 시 pull/applyMerge 하지 않고 중단(error)', async () => {
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP0'),
      getCloudSignal: vi.fn(async () => ({ available: true, latestUpdatedAt: 'C1' })),
      backup: vi.fn(() => {
        throw new Error('백업 실패')
      }),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('error')
    expect(deps.pull).not.toHaveBeenCalled()
    expect(deps.applyMerge).not.toHaveBeenCalled()
    expect(res.metaPatch.lastAutoSyncStatus).toBe('error')
  })

  it('cloud=null/available=false면 error로 중단(쓰기 없음)', async () => {
    const deps = makeDeps({
      getLocalFingerprint: vi.fn(() => 'FP1'),
      getCloudSignal: vi.fn(async () => ({ available: false, latestUpdatedAt: null })),
    })
    const res = await runAutoSyncOnce(baseArgs(), deps)
    expect(res.outcome).toBe('error')
    expect(deps.push).not.toHaveBeenCalled()
    expect(deps.pull).not.toHaveBeenCalled()
  })

  it('깨진 입력에도 throw하지 않는다', async () => {
    const deps = makeDeps()
    // @ts-expect-error 의도적 깨진 입력
    await expect(runAutoSyncOnce(null, deps)).resolves.toBeTruthy()
    // @ts-expect-error
    const res = await runAutoSyncOnce(null, deps)
    expect(res.outcome).toBe('disabled')
  })
})

describe('systemDataSyncMeta 격리 / 자동 트리거 부재 회귀', () => {
  it('systemDataSyncMeta는 동기화 대상(SYNC_KEYS)이 아니다', () => {
    expect(SYNC_KEY_SET.has('systemDataSyncMeta')).toBe(false)
  })

  const here = dirname(fileURLToPath(import.meta.url))
  // 주석/설명 문구에는 "이 모듈은 setInterval/window 등을 쓰지 않는다" 같은 금지어가 의도적으로 등장한다.
  // 회귀 검사는 "실제 코드"에 트리거/부수효과가 있는지를 봐야 하므로, 검사 전에 주석을 제거한다.
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const pageCode = stripComments(readFileSync(resolve(here, '../../pages/SystemDataSyncPage.tsx'), 'utf8'))
  const runnerCode = stripComments(readFileSync(resolve(here, '../autoSyncRunner.ts'), 'utf8'))

  it('페이지/실행 코어 코드에 자동 트리거(setInterval/visibilitychange/beforeunload)가 없다', () => {
    ;[pageCode, runnerCode].forEach((code) => {
      expect(code).not.toMatch(/setInterval/)
      expect(code).not.toMatch(/visibilitychange/)
      expect(code).not.toMatch(/beforeunload/)
    })
  })

  it('실행 코어 코드는 순수하다 — window/localStorage/fetch/new Date 직접 사용 없음', () => {
    expect(runnerCode).not.toMatch(/\bwindow\b/)
    expect(runnerCode).not.toMatch(/\blocalStorage\b/)
    expect(runnerCode).not.toMatch(/\bfetch\s*\(/)
    expect(runnerCode).not.toMatch(/new Date\s*\(/)
  })
})
