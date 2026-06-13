import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ACCESS_CODE_STORAGE_KEY,
  ACCESS_CODE_HEADER,
  getAccessCode,
  hasAccessCode,
  setAccessCode,
  clearAccessCode,
  maskAccessCode,
  buildAccessCodeHeaders,
} from '../accessCode'
import { SYNC_KEY_SET, SYNC_KEYS } from '../syncKeys'
import { computeSyncFingerprint } from '../autoSyncDecision'

// Phase C-1/C-2: 접근코드 클라이언트 유틸의 계약을 고정한다.
// vitest는 node 환경이라 sessionStorage가 없으므로, 호출 시점에 읽히는 globalThis.sessionStorage를
// 메모리 구현으로 주입한다.

class MemoryStorage {
  private store = new Map<string, string>()
  get length(): number {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

describe('accessCode 유틸 — sessionStorage 보관/마스킹/헤더', () => {
  beforeEach(() => {
    ;(globalThis as { sessionStorage?: Storage }).sessionStorage = new MemoryStorage() as unknown as Storage
  })
  afterEach(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage
  })

  it('기본 상태: 코드 없음', () => {
    expect(getAccessCode()).toBe('')
    expect(hasAccessCode()).toBe(false)
    expect(buildAccessCodeHeaders()).toEqual({})
  })

  it('set → get/has, 그리고 헤더에 코드가 실린다', () => {
    setAccessCode('  MyCode2026  ') // 트림 확인
    expect(getAccessCode()).toBe('MyCode2026')
    expect(hasAccessCode()).toBe(true)
    expect(buildAccessCodeHeaders()).toEqual({ [ACCESS_CODE_HEADER]: 'MyCode2026' })
  })

  it('빈/공백 코드 set은 삭제와 동일', () => {
    setAccessCode('abc')
    setAccessCode('   ')
    expect(getAccessCode()).toBe('')
    expect(hasAccessCode()).toBe(false)
  })

  it('clear 후에는 코드/헤더가 사라진다', () => {
    setAccessCode('secret-token')
    clearAccessCode()
    expect(getAccessCode()).toBe('')
    expect(buildAccessCodeHeaders()).toEqual({})
  })

  it('maskAccessCode: 평문을 그대로 노출하지 않는다', () => {
    expect(maskAccessCode('')).toBe('')
    expect(maskAccessCode('ab')).toBe('•••') // 짧은 코드는 길이도 가린다
    expect(maskAccessCode('MyCode2026')).toBe('M••••6')
    // 마스킹 결과에 중간 평문이 남지 않는다.
    expect(maskAccessCode('MyCode2026')).not.toContain('yCode202')
  })

  it('sessionStorage가 없어도 throw하지 않고 안전하게 동작', () => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage
    expect(() => setAccessCode('x')).not.toThrow()
    expect(getAccessCode()).toBe('')
    expect(buildAccessCodeHeaders()).toEqual({})
    expect(() => clearAccessCode()).not.toThrow()
  })
})

describe('접근코드 격리 — 동기화 대상/지문에 절대 포함되지 않음', () => {
  beforeEach(() => {
    ;(globalThis as { sessionStorage?: Storage }).sessionStorage = new MemoryStorage() as unknown as Storage
  })
  afterEach(() => {
    delete (globalThis as { sessionStorage?: Storage }).sessionStorage
  })

  it('접근코드 보관 key는 SYNC_KEYS(화이트리스트)에 없다', () => {
    expect(SYNC_KEY_SET.has(ACCESS_CODE_STORAGE_KEY)).toBe(false)
    // access code 와 비슷한 이름의 동기화 key도 없어야 한다.
    expect(SYNC_KEYS.some((k) => /access ?code/i.test(k))).toBe(false)
  })

  it('fingerprint는 접근코드 변경에 영향받지 않는다', () => {
    // 동기화 대상 payload 맵(접근코드는 포함되지 않음)으로 지문을 만든다.
    const payload: Record<string, unknown> = {}
    SYNC_KEYS.forEach((k) => (payload[k] = null))
    const before = computeSyncFingerprint(payload)

    // 접근코드를 적용/변경/삭제해도 동기화 payload는 그대로이므로 지문이 동일해야 한다.
    setAccessCode('code-A')
    const afterApply = computeSyncFingerprint(payload)
    setAccessCode('code-B-different')
    const afterChange = computeSyncFingerprint(payload)
    clearAccessCode()
    const afterClear = computeSyncFingerprint(payload)

    expect(afterApply).toBe(before)
    expect(afterChange).toBe(before)
    expect(afterClear).toBe(before)
  })
})
