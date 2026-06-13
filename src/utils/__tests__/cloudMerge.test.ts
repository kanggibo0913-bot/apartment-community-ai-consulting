import { describe, it, expect } from 'vitest'
import {
  mergeCommunityAiProjects,
  mergeByProjectMap,
  mergeAiResultHistory,
  mergeGlobalLocalPriority,
  mergeSyncValue,
  BY_PROJECT_SYNC_KEYS,
  AI_HISTORY_LIMIT,
} from '../cloudMerge'
import { SYNC_KEYS } from '../syncKeys'

// Phase B: 클라우드 "불러오기" 병합의 안전 계약을 고정한다.
// 핵심 보장: 로컬 데이터는 cloud가 "엄격히 더 최신"임이 증명될 때만 교체된다(그 외 local 보존).

// 작은 단지 객체 헬퍼 — data.openingChecklist.seedVersion까지 들고 다니는지 확인용.
const proj = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `단지-${id}`,
  updatedAt,
  data: { openingChecklist: { items: [], seedVersion: 3 } },
  ...extra,
})

describe('mergeCommunityAiProjects — 단지 단위 병합', () => {
  it('local이 최신이면 local 유지 (local-new / cloud-old)', () => {
    const local = { projects: [proj('a', '2026-06-10T00:00:00Z', { name: 'LOCAL_A' })], activeProjectId: 'a' }
    const cloud = { projects: [proj('a', '2026-01-01T00:00:00Z', { name: 'CLOUD_A' })], activeProjectId: 'a' }
    const merged = mergeCommunityAiProjects(local, cloud)
    expect(merged.projects).toHaveLength(1)
    expect(merged.projects[0].name).toBe('LOCAL_A')
  })

  it('cloud가 최신이면 cloud 채택 (local-old / cloud-new)', () => {
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z', { name: 'LOCAL_A' })], activeProjectId: 'a' }
    const cloud = { projects: [proj('a', '2026-06-10T00:00:00Z', { name: 'CLOUD_A' })], activeProjectId: 'a' }
    const merged = mergeCommunityAiProjects(local, cloud)
    expect(merged.projects[0].name).toBe('CLOUD_A')
  })

  it('동률이면 local 우선(데이터 손실 방지)', () => {
    const t = '2026-06-10T00:00:00Z'
    const local = { projects: [proj('a', t, { name: 'LOCAL_A' })], activeProjectId: 'a' }
    const cloud = { projects: [proj('a', t, { name: 'CLOUD_A' })], activeProjectId: 'a' }
    expect(mergeCommunityAiProjects(local, cloud).projects[0].name).toBe('LOCAL_A')
  })

  it('local에만 있는 단지는 보존된다', () => {
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'a' }
    const cloud = { projects: [], activeProjectId: '' }
    const merged = mergeCommunityAiProjects(local, cloud)
    expect(merged.projects.map((p) => p.id)).toEqual(['a'])
  })

  it('cloud에만 있는 단지는 추가된다(합집합)', () => {
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'a' }
    const cloud = { projects: [proj('b', '2026-02-01T00:00:00Z')], activeProjectId: 'b' }
    const merged = mergeCommunityAiProjects(local, cloud)
    expect(merged.projects.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('activeProjectId 안전 보정: local active가 결과에 없으면 cloud → 첫 단지', () => {
    // local active 'z'는 어디에도 없음 → cloud active 'b'가 결과에 있으므로 채택.
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'z' }
    const cloud = { projects: [proj('b', '2026-02-01T00:00:00Z')], activeProjectId: 'b' }
    expect(mergeCommunityAiProjects(local, cloud).activeProjectId).toBe('b')

    // local/cloud active 모두 결과에 없으면 첫 단지로.
    const local2 = { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'z' }
    const cloud2 = { projects: [proj('a', '2025-01-01T00:00:00Z')], activeProjectId: 'y' }
    expect(mergeCommunityAiProjects(local2, cloud2).activeProjectId).toBe('a')
  })

  it('local active가 결과에 존재하면 local 우선', () => {
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z'), proj('b', '2026-01-01T00:00:00Z')], activeProjectId: 'b' }
    const cloud = { projects: [proj('a', '2026-09-01T00:00:00Z')], activeProjectId: 'a' }
    expect(mergeCommunityAiProjects(local, cloud).activeProjectId).toBe('b')
  })

  it('채택된 단지의 openingChecklist.seedVersion이 보존된다(이중 마이그레이션 방지)', () => {
    const local = { projects: [{ ...proj('a', '2026-06-10T00:00:00Z'), data: { openingChecklist: { items: [{ id: 'x' }], seedVersion: 7 } } }], activeProjectId: 'a' }
    const cloud = { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'a' }
    const merged = mergeCommunityAiProjects(local, cloud)
    const data = merged.projects[0].data as { openingChecklist: { seedVersion: number } }
    expect(data.openingChecklist.seedVersion).toBe(7)
  })

  it('updatedAt이 없는 cloud는 local을 못 이긴다(모호 → local)', () => {
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z', { name: 'LOCAL_A' })], activeProjectId: 'a' }
    const cloud = { projects: [{ id: 'a', name: 'CLOUD_A', data: {} }], activeProjectId: 'a' }
    expect(mergeCommunityAiProjects(local, cloud).projects[0].name).toBe('LOCAL_A')
  })
})

describe('mergeByProjectMap — projectId 단위 병합 (충돌 시 항상 local 우선)', () => {
  it('cloud-only projectId 슬롯은 추가된다', () => {
    const merged = mergeByProjectMap({ p1: { v: 1 } }, { p2: { v: 2 } })
    expect(merged).toEqual({ p1: { v: 1 }, p2: { v: 2 } })
  })

  it('같은 projectId 충돌 시 항상 local 우선(배열 슬롯)', () => {
    const merged = mergeByProjectMap({ p1: [{ a: 1 }] }, { p1: [{ a: 2 }] })
    expect(merged.p1).toEqual([{ a: 1 }])
  })

  it('같은 projectId 충돌 시 cloud updatedAt이 더 최신이어도 local 우선(최신 선택 안 함)', () => {
    const local = { p1: { updatedAt: '2026-01-01T00:00:00Z', v: 'L' } }
    const cloud = { p1: { updatedAt: '2026-06-01T00:00:00Z', v: 'C' } }
    expect((mergeByProjectMap(local, cloud).p1 as { v: string }).v).toBe('L')
  })

  it('같은 projectId 슬롯 내부를 deep merge 하지 않는다(local 슬롯 그대로)', () => {
    const merged = mergeByProjectMap({ p1: { a: 1 } }, { p1: { b: 2 } })
    expect(merged.p1).toEqual({ a: 1 }) // cloud의 b는 합쳐지지 않음
  })

  it('깨진 입력이어도 죽지 않고 다른 쪽을 보존', () => {
    expect(mergeByProjectMap(null, { p1: 1 })).toEqual({ p1: 1 })
    expect(mergeByProjectMap({ p1: 1 }, 'broken')).toEqual({ p1: 1 })
  })
})

describe('mergeAiResultHistory — id 합집합 + 100개 제한', () => {
  it('id로 dedup하고 최신(createdAt) 먼저 정렬', () => {
    const local = [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }]
    const cloud = [
      { id: '1', createdAt: '2026-01-01T00:00:00Z' }, // 중복 → 1개로
      { id: '2', createdAt: '2026-06-01T00:00:00Z' },
    ]
    const merged = mergeAiResultHistory(local, cloud)
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('2') // 최신 먼저
    expect(merged[1].id).toBe('1')
  })

  it(`최대 ${AI_HISTORY_LIMIT}개로 제한된다`, () => {
    const mk = (n: number, side: string) =>
      Array.from({ length: n }, (_, i) => ({ id: `${side}-${i}`, createdAt: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` }))
    const merged = mergeAiResultHistory(mk(80, 'L'), mk(80, 'C'))
    expect(merged).toHaveLength(AI_HISTORY_LIMIT)
  })

  it('id 없는 항목도 보존(dedup 제외)', () => {
    const merged = mergeAiResultHistory([{ createdAt: '2026-01-01T00:00:00Z' }], [{ createdAt: '2026-02-01T00:00:00Z' }])
    expect(merged).toHaveLength(2)
  })

  it('깨진 입력이어도 빈 배열/보존으로 안전 처리', () => {
    expect(mergeAiResultHistory(null, null)).toEqual([])
    expect(mergeAiResultHistory('x', [{ id: '1', createdAt: '2026-01-01T00:00:00Z' }])).toHaveLength(1)
  })
})

describe('mergeGlobalLocalPriority — 전역 key local 우선 + 빈 값 채움', () => {
  it('local에 데이터가 있으면 cloud를 무시하고 local 유지', () => {
    expect(mergeGlobalLocalPriority([{ id: 1 }], [{ id: 2 }, { id: 3 }])).toEqual([{ id: 1 }])
  })

  it('local이 비어있으면(빈 배열/null) cloud로 채운다', () => {
    expect(mergeGlobalLocalPriority([], [{ id: 9 }])).toEqual([{ id: 9 }])
    expect(mergeGlobalLocalPriority(null, [{ id: 9 }])).toEqual([{ id: 9 }])
  })

  it('양쪽 다 비어있으면 local(빈 값) 유지', () => {
    expect(mergeGlobalLocalPriority([], [])).toEqual([])
  })
})

describe('mergeSyncValue — key별 디스패치 & 방어', () => {
  it('communityAiProjects는 단지 병합으로 라우팅', () => {
    const merged = mergeSyncValue(
      'communityAiProjects',
      { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'a' },
      { projects: [proj('b', '2026-02-01T00:00:00Z')], activeProjectId: 'b' },
    ) as { projects: Array<{ id: string }> }
    expect(merged.projects.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('알 수 없는/깨진 payload가 와도 throw하지 않고 local 보존', () => {
    expect(() => mergeSyncValue('communityAiProjects', { projects: 'broken' }, 12345)).not.toThrow()
    expect(() => mergeSyncValue('tenderNotices', undefined, undefined)).not.toThrow()
    // 깨진 cloud여도 local 그대로.
    const local = { projects: [proj('a', '2026-01-01T00:00:00Z')], activeProjectId: 'a' }
    const out = mergeSyncValue('communityAiProjects', local, 'totally-broken') as { projects: Array<{ id: string }> }
    expect(out.projects.map((p) => p.id)).toEqual(['a'])
  })

  it('전역 key는 local 우선 라우팅', () => {
    expect(mergeSyncValue('tenderNotices', [{ id: 1 }], [{ id: 2 }])).toEqual([{ id: 1 }])
  })
})

describe('BY_PROJECT_SYNC_KEYS 드리프트 가드', () => {
  it("syncKeys의 'ByProject' key 집합과 정확히 일치한다", () => {
    const fromSyncKeys = SYNC_KEYS.filter((k) => k.endsWith('ByProject')).sort()
    expect([...BY_PROJECT_SYNC_KEYS].sort()).toEqual(fromSyncKeys)
  })
})
