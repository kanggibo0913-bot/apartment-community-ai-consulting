// 오픈 체크리스트 seed/migration 회귀 테스트 (v3 — '시설 체크'를 시설별 category로 분리).
//
// 검증 목표:
//   - 신규 seed에 '시설 체크' category가 없고, 공통 시설/헬스/골프/수영/체육관/샤워 / 탈의가 category로 분리됨
//   - 수영 category에 염도계/pH 측정기/수온계/순환펌프/수압펌프/여과기/배관/배수 관련 항목 포함
//   - seed 내 (카테고리, 제목) 중복 없음, id 유일, subCategory는 비품에만 존재
//   - v2 데이터(category '시설 체크' + subCategory)가 v3 시설별 category로 재분류됨
//     · 수영장→수영, 헬스장→헬스, 골프장→골프, 체육관→체육관, 샤워 / 탈의→샤워 / 탈의, 공통/안전 방재/설비 전기→공통 시설
//   - 기존 title/status/memo/assignee/dueDate/completedAt/quantityReady 등 사용자 입력값 보존(덮어쓰기 없음)
//   - 동일 (category, 접두어 제거 title) 중복 없음, append id 충돌 없음
//   - normalizeOpeningChecklistData: 신규 초기화 / items:[] 보존 / seedVersion 게이트(>=3 재migration 안 함)

import { describe, expect, it } from 'vitest'
import { OpeningChecklistItem } from '../../types/CommunityData'
import {
  OPENING_CHECKLIST_SEED_VERSION,
  createDefaultChecklistItems,
  migrateOpeningChecklistItems,
  normalizeOpeningChecklistData,
} from '../openingChecklistDefaults'

const baseTitle = (title: string) => title.replace(/^\s*\[[^\]]*\]\s*/, '').trim()
const key = (i: OpeningChecklistItem) => `${i.category} ${baseTitle(i.title)}`

// 구버전(v2, category '시설 체크' + subCategory) 저장 데이터를 흉내 낸 표본 + 사용자 입력값.
const mk = (over: Partial<OpeningChecklistItem>): OpeningChecklistItem => ({
  id: 'x',
  category: '시설 체크',
  subCategory: '',
  title: '제목',
  description: '',
  status: '미확인',
  assignee: '',
  dueDate: '',
  completedAt: '',
  priority: '보통',
  memo: '',
  ...over,
})

const v2Saved: OpeningChecklistItem[] = [
  // 수영장 + 사용자 완료/메모/담당자/목표일 입력
  mk({
    id: 'oc-fac-50',
    category: '시설 체크',
    subCategory: '수영장',
    title: '수영장 수질 관리 상태 확인',
    status: '완료',
    memo: '주 2회 점검',
    assignee: '박관리',
    dueDate: '2026-06-20',
    completedAt: '2026-06-10T08:00:00.000Z',
  }),
  // 헬스장
  mk({ id: 'oc-fac-13', category: '시설 체크', subCategory: '헬스장', title: '거울 파손 / 들뜸 확인', status: '진행중' }),
  // 골프장
  mk({ id: 'oc-fac-21', category: '시설 체크', subCategory: '골프장', title: '골프 타석 상태 확인' }),
  // 체육관
  mk({ id: 'oc-fac-70', category: '시설 체크', subCategory: '체육관', title: '체육관 바닥 상태 확인' }),
  // 샤워 / 탈의
  mk({ id: 'oc-fac-60', category: '시설 체크', subCategory: '샤워 / 탈의', title: '샤워실 온수 확인' }),
  // 공통 / 안전·방재 / 설비·전기 → 공통 시설
  mk({ id: 'oc-fac-1', category: '시설 체크', subCategory: '공통', title: '안내데스크 상태 확인' }),
  mk({ id: 'oc-fac-10', category: '시설 체크', subCategory: '안전 / 방재', title: '소방시설 위치 확인' }),
  mk({ id: 'oc-fac-6', category: '시설 체크', subCategory: '설비 / 전기', title: '조명 상태 확인' }),
  // 비품 (사용자 수량/구매상태 입력) — subCategory 보존
  mk({
    id: 'oc-sup-1',
    category: '비품',
    subCategory: '인포 / 사무',
    title: '인포 PC',
    quantityNeeded: 2,
    quantityReady: 2,
    unit: '대',
    purchaseStatus: '입고완료',
    assignee: '이대리',
  }),
  // v1-style: subCategory 없는 접두어 제목 (제목 접두어 fallback 검증)
  mk({ id: 'oc-fac-99', category: '시설 체크', subCategory: '', title: '[골프] 그물망 상태 확인', status: '보류' }),
]

describe('createDefaultChecklistItems (v3 seed)', () => {
  const seed = createDefaultChecklistItems()
  const cats = new Set<string>(seed.map((i) => i.category))

  it("'시설 체크' category가 더 이상 seed에 없다", () => {
    expect(cats.has('시설 체크')).toBe(false)
  })

  it('공통 시설/헬스/골프/수영/체육관/샤워 / 탈의가 category로 분리되어 있다', () => {
    for (const c of ['공통 시설', '헬스', '골프', '수영', '체육관', '샤워 / 탈의']) {
      expect(cats.has(c)).toBe(true)
    }
  })

  it('수영 category에 수질측정/펌프/여과/배관/배수 항목이 포함된다', () => {
    const swim = seed.filter((i) => i.category === '수영').map((i) => i.title)
    for (const t of [
      '염도계 비치 및 작동 확인',
      'pH 측정기 비치 및 작동 확인',
      '수온계 비치 및 작동 확인',
      '순환펌프 작동 확인',
      '수압펌프 작동 확인',
      '여과기 상태 확인',
      '배관 누수 확인',
      '배수구 막힘 확인',
      '잔류염소 확인',
    ]) {
      expect(swim).toContain(t)
    }
  })

  it('seed 내 (카테고리, 제목) 중복이 없다', () => {
    const keys = seed.map(key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('seed id가 유일하다', () => {
    const ids = seed.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('subCategory는 비품에만 채워져 있고 그 외 카테고리는 비어 있다', () => {
    for (const i of seed) {
      if (i.category === '비품') expect((i.subCategory ?? '').length > 0).toBe(true)
      else expect(i.subCategory ?? '').toBe('')
    }
  })
})

describe('migrateOpeningChecklistItems — v2→v3 재분류', () => {
  const result = migrateOpeningChecklistItems(v2Saved)
  const byId = (id: string) => result.items.find((i) => i.id === id)!

  it('레거시 시설 체크 항목이 모두 보존되고(삭제 없음) 재분류 카운트가 잡힌다', () => {
    for (const orig of v2Saved) expect(byId(orig.id)).toBeDefined()
    expect(result.reclassifiedCount).toBe(9) // 시설 체크 9건 (비품 1건 제외)
  })

  it('subCategory 기준으로 시설별 category로 옮긴다', () => {
    expect(byId('oc-fac-50').category).toBe('수영')
    expect(byId('oc-fac-13').category).toBe('헬스')
    expect(byId('oc-fac-21').category).toBe('골프')
    expect(byId('oc-fac-70').category).toBe('체육관')
    expect(byId('oc-fac-60').category).toBe('샤워 / 탈의')
    expect(byId('oc-fac-1').category).toBe('공통 시설')
    expect(byId('oc-fac-10').category).toBe('공통 시설')
    expect(byId('oc-fac-6').category).toBe('공통 시설')
  })

  it('subCategory 없는 v1 접두어 제목은 제목 접두어로 재분류된다([골프]→골프)', () => {
    expect(byId('oc-fac-99').category).toBe('골프')
  })

  it('재분류된 시설 항목의 subCategory는 비워진다(카드에서 category와 중복 표시 방지)', () => {
    expect(byId('oc-fac-50').subCategory ?? '').toBe('')
    expect(byId('oc-fac-13').subCategory ?? '').toBe('')
  })

  it('기존 사용자 입력값(상태/메모/담당자/목표일/완료시각/수량/구매상태/제목)을 덮어쓰지 않는다', () => {
    const swim = byId('oc-fac-50')
    expect(swim.status).toBe('완료')
    expect(swim.memo).toBe('주 2회 점검')
    expect(swim.assignee).toBe('박관리')
    expect(swim.dueDate).toBe('2026-06-20')
    expect(swim.completedAt).toBe('2026-06-10T08:00:00.000Z')
    expect(swim.title).toBe('수영장 수질 관리 상태 확인')

    const pc = byId('oc-sup-1')
    expect(pc.category).toBe('비품')
    expect(pc.quantityReady).toBe(2)
    expect(pc.purchaseStatus).toBe('입고완료')
    expect(pc.assignee).toBe('이대리')
    expect(pc.subCategory).toBe('인포 / 사무') // 비품 subCategory는 보존
  })

  it('신규 seed 항목을 append 한다(수영 신규 항목 등)', () => {
    const titles = result.items.map((i) => i.title)
    expect(titles).toContain('염도계 비치 및 작동 확인')
    expect(titles).toContain('순환펌프 작동 확인')
    expect(result.appendedCount).toBeGreaterThan(0)
  })

  it('재분류 후 동일 (category, 접두어 제거 제목) 중복이 없다', () => {
    const keys = result.items.map(key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('재분류된 기존 항목과 동일한 seed 항목은 중복 append 되지 않는다', () => {
    // '수영장 수질 관리 상태 확인'은 기존(재분류)·seed 양쪽에 있으나 1건만 존재해야 함
    expect(result.items.filter((i) => i.category === '수영' && baseTitle(i.title) === '수영장 수질 관리 상태 확인').length).toBe(1)
    // 헬스 '거울 파손 / 들뜸 확인'도 1건
    expect(result.items.filter((i) => i.category === '헬스' && baseTitle(i.title) === '거울 파손 / 들뜸 확인').length).toBe(1)
  })

  it('append 항목 id가 기존 id와 충돌하지 않는다', () => {
    const ids = result.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('migrateOpeningChecklistItems — id 충돌 보정', () => {
  it('기존 id가 신규 append 대상 seed id와 겹쳐도 유일성을 유지한다', () => {
    const seed = createDefaultChecklistItems()
    const collidingId = seed.find((s) => s.title === '체육관 이용 안내판')!.id
    const saved: OpeningChecklistItem[] = [mk({ id: collidingId, category: '계약/행정', subCategory: '', title: '사용자 임의 항목' })]
    const out = migrateOpeningChecklistItems(saved, seed)
    const ids = out.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(out.items.find((i) => i.title === '사용자 임의 항목')!.id).toBe(collidingId)
  })
})

describe('normalizeOpeningChecklistData', () => {
  it('openingChecklist가 없으면 최신 seed + 최신 버전으로 초기화한다', () => {
    const out = normalizeOpeningChecklistData(undefined)
    expect(out.items.length).toBe(createDefaultChecklistItems().length)
    expect(out.seedVersion).toBe(OPENING_CHECKLIST_SEED_VERSION)
  })

  it('items:[] (사용자가 모두 지움)는 재시드하지 않고 보존한다', () => {
    const out = normalizeOpeningChecklistData({ items: [] })
    expect(out.items.length).toBe(0)
    expect(out.seedVersion).toBe(OPENING_CHECKLIST_SEED_VERSION)
  })

  it('seedVersion이 최신이면 migration을 다시 실행하지 않는다(삭제/재분류 항목 부활 방지)', () => {
    const one = v2Saved.slice(0, 1)
    const out = normalizeOpeningChecklistData({ items: one, seedVersion: OPENING_CHECKLIST_SEED_VERSION })
    expect(out.items.length).toBe(1)
    expect(out.items[0].category).toBe('시설 체크') // 최신 버전이면 재분류도 하지 않음(보존)
  })

  it('seedVersion이 낮으면(또는 없으면) 1회 migration 후 최신 버전으로 stamp 한다', () => {
    const out = normalizeOpeningChecklistData({ items: v2Saved, seedVersion: 2 })
    expect(out.seedVersion).toBe(OPENING_CHECKLIST_SEED_VERSION)
    expect(out.items.length).toBeGreaterThan(v2Saved.length)
    // 재분류 확인: 더 이상 '시설 체크' category 항목이 없어야 함
    expect(out.items.some((i) => i.category === '시설 체크')).toBe(false)
  })
})
