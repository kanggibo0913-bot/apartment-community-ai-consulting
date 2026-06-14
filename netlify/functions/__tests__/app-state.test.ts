import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { handler, resolveFallbackPolicy } from '../app-state'

// Phase C-1/C-2: app-state 함수의 워크스페이스 접근코드 게이트 계약을 고정한다.
// 실제 Supabase 없이 globalThis.fetch를 stub해 모든 분기를 검증한다.

const DEFAULT_HASH = 'default-placeholder-hash'
const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

type Row = { id: string }

interface FetchSetup {
  // 주어진 요청 URL(workspaces 조회)에서 매칭 행을 돌려준다. []면 매칭 없음.
  workspaceRows?: (url: string) => Row[]
  stateGetRows?: () => unknown[]
  statePostOk?: boolean
}

interface RecordedCall {
  url: string
  method: string
  headers: Record<string, unknown>
}

const mkResponse = (status: number, jsonBody: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  }) as unknown as Response

const setupFetch = (opts: FetchSetup = {}) => {
  const calls: RecordedCall[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase()
    calls.push({ url, method, headers: (init?.headers as Record<string, unknown>) || {} })
    if (url.includes('/homebase_workspaces')) {
      const rows = opts.workspaceRows ? opts.workspaceRows(url) : [{ id: 'ws-1' }]
      return mkResponse(200, rows)
    }
    if (url.includes('/homebase_app_state')) {
      if (method === 'POST') {
        return opts.statePostOk === false ? mkResponse(400, { message: 'fail' }) : mkResponse(201, null)
      }
      return mkResponse(200, opts.stateGetRows ? opts.stateGetRows() : [])
    }
    throw new Error('unexpected fetch url: ' + url)
  })
  ;(globalThis as { fetch?: typeof fetch }).fetch = fn as unknown as typeof fetch
  return { fn, calls }
}

// 최소 event 객체. Handler 타입은 더 많은 필드를 요구하지만 핸들러는 일부만 읽으므로 캐스팅한다.
const makeEvent = (over: Record<string, unknown> = {}) =>
  ({ httpMethod: 'GET', headers: {}, body: null, ...over }) as unknown as Parameters<typeof handler>[0]

const callHandler = async (event: Parameters<typeof handler>[0]) => {
  const res = (await handler(event, {} as never, () => {})) as { statusCode: number; body: string }
  return { statusCode: res.statusCode, body: res.body, data: JSON.parse(res.body) }
}

describe('app-state 접근코드 게이트', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as { fetch?: typeof fetch }).fetch
    // Phase C-3 fallback 환경변수가 다른 테스트로 새지 않도록 정리한다.
    delete process.env.HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK
    delete process.env.HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL
  })

  it('접근코드 없음 → 전환기 기본 workspace로 조회(default fallback)', async () => {
    const { calls } = setupFetch()
    const { statusCode, data } = await callHandler(makeEvent({ httpMethod: 'GET' }))
    expect(statusCode).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.usedDefault).toBe(true)
    // 환경변수 미설정 → fallback 허용이 응답 메타에 보인다(Phase C-3).
    expect(data.fallbackAllowed).toBe(true)
    // workspace 조회는 기본 해시로 이뤄진다.
    const wsCall = calls.find((c) => c.url.includes('/homebase_workspaces'))
    expect(wsCall?.url).toContain(`eq.${DEFAULT_HASH}`)
  })

  it('접근코드 있음 → sha256 해시로 workspace 조회(평문 미사용)', async () => {
    const code = 'MyCompanyCode-2026'
    const { calls } = setupFetch()
    const { data } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': code } }),
    )
    expect(data.ok).toBe(true)
    expect(data.usedDefault).toBe(false)
    const wsCall = calls.find((c) => c.url.includes('/homebase_workspaces'))
    // URL에는 sha256 해시가 들어가고, 평문/기본해시는 들어가지 않는다.
    expect(wsCall?.url).toContain(sha256Hex(code))
    expect(wsCall?.url).not.toContain(code)
    expect(wsCall?.url).not.toContain(DEFAULT_HASH)
  })

  it('틀린 접근코드 → 403, 어떤 app_state 읽기/쓰기도 하지 않음 (GET)', async () => {
    const { calls } = setupFetch({ workspaceRows: () => [] }) // 매칭 workspace 없음
    const { statusCode, data } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': 'wrong' } }),
    )
    expect(statusCode).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('invalid_access_code')
    // app_state 호출이 전혀 없어야 한다.
    expect(calls.some((c) => c.url.includes('/homebase_app_state'))).toBe(false)
  })

  it('틀린 접근코드 → 403, POST 업서트도 발생하지 않음 (쓰기 차단)', async () => {
    const { calls } = setupFetch({ workspaceRows: () => [] })
    const { statusCode } = await callHandler(
      makeEvent({
        httpMethod: 'POST',
        headers: { 'x-workspace-access-code': 'wrong' },
        body: JSON.stringify({ items: { tenderNotices: [1, 2] } }),
      }),
    )
    expect(statusCode).toBe(403)
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/homebase_app_state'))).toBe(false)
  })

  it('GET/POST 모두 접근코드를 해석한다 (POST도 코드 해시로 workspace 조회 후 저장)', async () => {
    const code = 'shared-code'
    const { calls } = setupFetch({ statePostOk: true })
    const { data } = await callHandler(
      makeEvent({
        httpMethod: 'POST',
        headers: { 'x-workspace-access-code': code },
        body: JSON.stringify({ items: { tenderNotices: [1, 2] } }),
      }),
    )
    expect(data.ok).toBe(true)
    expect(data.saved).toBe(1)
    expect(data.usedDefault).toBe(false)
    const wsCall = calls.find((c) => c.url.includes('/homebase_workspaces'))
    expect(wsCall?.url).toContain(sha256Hex(code))
  })

  it('응답에는 접근코드 평문/해시가 절대 노출되지 않는다 (성공 GET)', async () => {
    const code = 'super-secret-code'
    setupFetch({ stateGetRows: () => [{ state_key: 'tenderNotices', payload: [1], version: 1, updated_at: '2026-01-01T00:00:00Z' }] })
    const { body } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': code } }),
    )
    expect(body).not.toContain(code)
    expect(body).not.toContain(sha256Hex(code))
  })

  it('응답에는 접근코드 평문/해시가 절대 노출되지 않는다 (403)', async () => {
    const code = 'another-secret'
    setupFetch({ workspaceRows: () => [] })
    const { body } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': code } }),
    )
    expect(body).not.toContain(code)
    expect(body).not.toContain(sha256Hex(code))
  })

  it('service role key는 응답에 노출되지 않는다', async () => {
    setupFetch()
    const { body } = await callHandler(makeEvent({ httpMethod: 'GET' }))
    expect(body).not.toContain('test-service-role-key')
  })

  // ── Phase C-3: 전환기 fallback 비활성화 시 동작 ──
  it('fallback 비허용(false) + 코드 없음 → 403 access_code_required, 어떤 조회도 안 함 (GET)', async () => {
    process.env.HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK = 'false'
    const { calls } = setupFetch()
    const { statusCode, data } = await callHandler(makeEvent({ httpMethod: 'GET' }))
    expect(statusCode).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('access_code_required')
    // 코드가 없으면 fetch(워크스페이스/app_state)를 단 한 번도 하지 않는다.
    expect(calls.length).toBe(0)
  })

  it('fallback 비허용(false) + 코드 없음 → 403, POST 업서트도 발생하지 않음 (쓰기 차단)', async () => {
    process.env.HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK = 'false'
    const { calls } = setupFetch()
    const { statusCode } = await callHandler(
      makeEvent({ httpMethod: 'POST', body: JSON.stringify({ items: { tenderNotices: [1, 2] } }) }),
    )
    expect(statusCode).toBe(403)
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('fallback 비허용이어도 유효 코드 → 정상 동작(usedDefault=false, 평문 미사용)', async () => {
    process.env.HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK = 'false'
    const code = 'MyCompanyCode-2026'
    const { calls } = setupFetch()
    const { statusCode, data } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': code } }),
    )
    expect(statusCode).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.usedDefault).toBe(false)
    expect(data.fallbackAllowed).toBe(false)
    const wsCall = calls.find((c) => c.url.includes('/homebase_workspaces'))
    expect(wsCall?.url).toContain(sha256Hex(code))
    expect(wsCall?.url).not.toContain(code)
  })

  it('fallback 비허용 + 잘못된 코드 → 여전히 invalid_access_code 403 (access_code_required 아님)', async () => {
    process.env.HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK = 'false'
    setupFetch({ workspaceRows: () => [] })
    const { statusCode, data } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': 'wrong' } }),
    )
    expect(statusCode).toBe(403)
    expect(data.error).toBe('invalid_access_code')
  })

  it('Supabase 미설정이면 ok:false 안내 (코드 유무와 무관)', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const { statusCode, data } = await callHandler(
      makeEvent({ httpMethod: 'GET', headers: { 'x-workspace-access-code': 'x' } }),
    )
    expect(statusCode).toBe(200)
    expect(data.ok).toBe(false)
  })
})

// Phase C-3: 전환기 fallback 정책 순수 함수. process.env/Date 의존이 없어 결정적으로 검증한다.
describe('resolveFallbackPolicy — 전환기 fallback 정책', () => {
  const T = Date.parse('2026-06-14T00:00:00.000Z') // 주입할 고정 기준 시각

  it('환경변수 미설정 → 허용(default_allowed)', () => {
    expect(resolveFallbackPolicy({}, T)).toEqual({ allowed: true, reason: 'default_allowed' })
  })

  it("ALLOW='false' → 차단(explicitly_disabled), UNTIL이 미래여도 차단(플래그 우선)", () => {
    expect(
      resolveFallbackPolicy(
        {
          HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK: 'false',
          HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL: '2099-01-01',
        },
        T,
      ),
    ).toEqual({ allowed: false, reason: 'explicitly_disabled' })
  })

  it("ALLOW='true' → 허용(explicitly_enabled), UNTIL이 과거여도 허용(플래그 우선)", () => {
    expect(
      resolveFallbackPolicy(
        {
          HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK: 'true',
          HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL: '2000-01-01',
        },
        T,
      ),
    ).toEqual({ allowed: true, reason: 'explicitly_enabled' })
  })

  it("ALLOW 값은 트림/소문자화한다(' FALSE ' → 차단)", () => {
    expect(
      resolveFallbackPolicy({ HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK: ' FALSE ' }, T).allowed,
    ).toBe(false)
  })

  it('UNTIL이 미래 날짜 → 허용(within_deadline)', () => {
    expect(
      resolveFallbackPolicy({ HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL: '2026-06-30' }, T),
    ).toEqual({ allowed: true, reason: 'within_deadline' })
  })

  it('UNTIL이 과거 날짜 → 차단(deadline_passed)', () => {
    expect(
      resolveFallbackPolicy({ HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL: '2026-06-01' }, T),
    ).toEqual({ allowed: false, reason: 'deadline_passed' })
  })

  it('UNTIL 당일(그 날의 끝까지)은 허용 — 경계 확인', () => {
    // 2026-06-14T00:00:00Z 는 2026-06-14T23:59:59.999Z 이전이므로 허용.
    expect(
      resolveFallbackPolicy({ HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL: '2026-06-14' }, T).allowed,
    ).toBe(true)
  })

  it('UNTIL 형식 오류 → 허용(invalid_until, 배포 안 깨짐)', () => {
    expect(
      resolveFallbackPolicy({ HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL: '2026/06/14' }, T),
    ).toEqual({ allowed: true, reason: 'invalid_until' })
  })
})
