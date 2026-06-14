import type { Handler } from '@netlify/functions'
import { createHash } from 'node:crypto'
import { SYNC_KEY_SET } from '../../src/utils/syncKeys'

// HOMEBASE AI 앱 state 수동 동기화 함수.
// 브라우저는 GET으로 클라우드 값을 받아 localStorage에 복원하고, POST로 현재
// localStorage 값을 클라우드에 업서트한다. 자동 동기화는 하지 않는다 — 수동 버튼만.
//
// 라우팅:
//   GET  /.netlify/functions/app-state
//     → { ok: true, items: { state_key: payload, ... }, updatedAt: { state_key: iso }, workspaceId, usedDefault, fallbackAllowed }
//   POST /.netlify/functions/app-state
//     body: { items: Record<state_key, any> }
//     → { ok: true, saved: number, savedKeys: string[], usedDefault, fallbackAllowed }
//
// 워크스페이스 접근 게이트 (Phase C-1/C-2):
//   - 요청 헤더 x-workspace-access-code 로 "워크스페이스 접근코드"를 받는다(GET/POST 동일).
//   - ⚠️ 이것은 "현장(단지)별 격리"가 아니라 "워크스페이스 접근 게이트"다. 외부인이 함수 URL만으로
//     데이터를 읽거나 덮어쓰는 것을 1차 차단하는 용도. 현장별(projectId) 접근 제한은 추후 단계.
//   - 코드의 sha256 해시는 "서버에서만" 계산한다. 코드 평문/해시는 응답·로그에 절대 싣지 않는다.
//   - 코드가 있으면 그 해시로 workspace를 조회한다. 매칭이 없으면 403(잘못된 접근코드, invalid_access_code).
//   - 코드가 없으면 전환기 동안 기존 기본 workspace로 동작한다(아래 DEFAULT_WORKSPACE_CODE_HASH).
//
// 전환기 fallback 폐기 준비 (Phase C-3):
//   - "코드 없음 → 기본 workspace" 전환기 fallback을 환경변수로 끌 수 있다(resolveFallbackPolicy).
//   - fallback이 꺼져 있고 코드도 없으면 403(access_code_required) — GET/POST 모두 차단.
//   - 기본값(환경변수 미설정)은 현재 동작과 동일한 "fallback 허용"이라 배포가 깨지지 않는다.
//   - 응답 메타 usedDefault(전환기 기본 사용 여부) + fallbackAllowed(서버 정책상 fallback 허용 여부)로 상태를 가시화.
//
// 응답 정책:
//   - HTTP status는 거의 항상 200으로 통일하고 ok 플래그로 분기한다(브라우저 단순화).
//     단 "잘못된 접근코드"만 예외적으로 403을 반환한다.
//   - service role key는 응답·로그·에러 메시지에 절대 노출하지 않는다.
//   - Supabase 외부 응답 본문도 그대로 노출하지 않고 status 숫자만 사용한다.

// 동기화 대상 — 기존 localStorage key와 동일 식별자.
// 화이트리스트로 두어 외부 입력이 임의 key를 만들지 못하게 차단한다.
// ⚠️ 단일 출처: 목록 정의는 src/utils/syncKeys.ts 한 곳에만 둔다.
//    프론트(SystemDataSyncPage)와 이 함수가 같은 모듈을 import해 드리프트를 막는다.
//    key 추가/변경 시 src/utils/syncKeys.ts만 수정하면 양쪽에 동시 반영된다.
//    (이 파일은 Netlify esbuild 번들 시 syncKeys.ts를 함께 인라인하므로 별도 복제가 불필요.)
const ALLOWED_KEYS = SYNC_KEY_SET

// 전환기 기본 작업공간 — schema.sql에서 시드한 행과 동일.
// 접근코드가 없을 때만 fallback으로 사용한다(코드가 있으면 sha256 해시로 별도 조회).
const DEFAULT_WORKSPACE_CODE_HASH = 'default-placeholder-hash'

// 접근코드를 받는 요청 헤더 이름.
// ⚠️ src/utils/accessCode.ts 의 ACCESS_CODE_HEADER 와 반드시 동일해야 한다.
const ACCESS_CODE_HEADER = 'x-workspace-access-code'

// 접근코드 → sha256 hex. ⚠️ 해시는 서버에서만 계산한다(브라우저로 내려보내지 않는다).
// Postgres 쪽 운영 INSERT는 encode(digest('코드','sha256'),'hex') 와 동일한 값이 되어야 매칭된다.
const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex')

// ── 전환기 기본 작업공간(default fallback) 폐기 준비 (Phase C-3) ──────────────
// "코드가 없으면 기본 workspace로 동작"하는 전환기 fallback을 환경변수로 끄고 켤 수 있게 한다.
// ⚠️ 기본값(둘 다 미설정)은 현재 production 동작과 동일한 "fallback 허용"이다 — 설정을 바꾸지 않는 한
//    배포가 깨지지 않는다. 실제 폐기는 운영 workspace 생성·코드 검증 후 환경변수로 명시적으로 한다.
//
//   - HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK
//       'false' → fallback 차단(코드 없으면 403). 'true' → 강제 허용(마감일 무시). 그 외/미설정 → 미지정.
//   - HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL = 'YYYY-MM-DD'
//       위 플래그가 미지정일 때만 사용한다. 이 날짜(UTC 기준 그 날의 끝 23:59:59.999Z)가 지나면 차단.
//       형식이 잘못되면 배포를 깨지 않도록 안전하게 "허용"으로 두되 reason=invalid_until로 표시한다.
//
// ⚠️ 순수 함수다 — process.env/Date를 직접 읽지 않고 인자로 받는다. 그래야 테스트에서 결정적으로 검증된다.
type FallbackPolicyReason =
  | 'explicitly_disabled'
  | 'explicitly_enabled'
  | 'deadline_passed'
  | 'within_deadline'
  | 'invalid_until'
  | 'default_allowed'

interface FallbackPolicy {
  allowed: boolean
  reason: FallbackPolicyReason
}

// ⚠️ 테스트에서 직접 검증하므로 export 한다(Netlify는 handler만 쓰지만 추가 export는 무해).
export const resolveFallbackPolicy = (
  env: {
    HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK?: string
    HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL?: string
  },
  nowMs: number,
): FallbackPolicy => {
  const flag = (env.HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK || '').trim().toLowerCase()
  if (flag === 'false') return { allowed: false, reason: 'explicitly_disabled' }
  if (flag === 'true') return { allowed: true, reason: 'explicitly_enabled' }

  const until = (env.HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL || '').trim()
  if (until) {
    // 'YYYY-MM-DD'만 허용. 그 날의 끝(UTC 23:59:59.999)까지 허용, 이후 차단.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { allowed: true, reason: 'invalid_until' }
    const cutoff = Date.parse(`${until}T23:59:59.999Z`)
    if (Number.isNaN(cutoff)) return { allowed: true, reason: 'invalid_until' }
    return nowMs > cutoff
      ? { allowed: false, reason: 'deadline_passed' }
      : { allowed: true, reason: 'within_deadline' }
  }

  return { allowed: true, reason: 'default_allowed' }
}

// 요청 헤더에서 접근코드를 읽는다(트림). 없으면 빈 문자열.
// Netlify는 헤더 key를 소문자로 정규화하지만, 방어적으로 몇 가지 변형도 확인한다.
const readAccessCode = (event: { headers?: Record<string, string | undefined> }): string => {
  const h = event.headers || {}
  const raw = h[ACCESS_CODE_HEADER] ?? h[ACCESS_CODE_HEADER.toUpperCase()] ?? ''
  return typeof raw === 'string' ? raw.trim() : ''
}

// 워크스페이스 해석 결과.
type WorkspaceResolution =
  | { kind: 'ok'; workspaceId: string; usedDefault: boolean }
  | { kind: 'invalid_code' } // 코드는 왔지만 매칭 workspace 없음 → 403
  | { kind: 'fallback_disabled' } // 코드 없음 + 전환기 fallback 비활성화 → 403(접근코드 필수)
  | { kind: 'not_found' } // 기본 workspace 자체가 없음(schema 미적용)
  | { kind: 'error' } // 조회 쿼리 실패

// 접근코드 유무에 따라 workspace를 해석한다.
// fallbackAllowed=false면 코드가 없을 때 기본 workspace로 넘어가지 않고 fallback_disabled를 돌려준다.
const resolveWorkspace = async (
  origin: string,
  headers: Record<string, string>,
  accessCode: string,
  fallbackAllowed: boolean,
): Promise<WorkspaceResolution> => {
  const code = (accessCode || '').trim()
  if (code) {
    // 코드가 있으면 서버에서만 sha256 해시 후 그 해시로 workspace를 찾는다.
    let id: string | null
    try {
      id = await fetchWorkspaceIdByHash(origin, headers, sha256Hex(code))
    } catch {
      return { kind: 'error' }
    }
    if (!id) return { kind: 'invalid_code' } // 코드가 틀림 → 403, 어떤 읽기/쓰기도 하지 않음
    return { kind: 'ok', workspaceId: id, usedDefault: false }
  }
  // 코드가 없을 때: 전환기 fallback이 꺼져 있으면 접근코드를 요구한다(읽기/쓰기 0).
  if (!fallbackAllowed) return { kind: 'fallback_disabled' }
  // fallback 허용 시에만 전환기 기본 workspace로 동작한다.
  let id: string | null
  try {
    id = await fetchWorkspaceIdByHash(origin, headers, DEFAULT_WORKSPACE_CODE_HASH)
  } catch {
    return { kind: 'error' }
  }
  if (!id) return { kind: 'not_found' }
  return { kind: 'ok', workspaceId: id, usedDefault: true }
}

const handler: Handler = async (event) => {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return json(200, {
      ok: false,
      message: 'Supabase environment variables are not configured',
    })
  }

  let restOrigin: string
  try {
    const u = new URL(supabaseUrl)
    if (u.protocol !== 'https:') throw new Error('protocol')
    restOrigin = u.origin.replace(/\/$/, '')
  } catch {
    return json(200, { ok: false, message: 'Supabase URL format is invalid' })
  }

  const authHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  }

  // 0) 전환기 기본 작업공간 fallback 허용 여부(환경변수 기반, 기본 허용 → 현재 동작 유지).
  const fallback = resolveFallbackPolicy(process.env, Date.now())

  // 1) 접근코드(있으면) → 워크스페이스 해석. 없으면 fallback 허용 시에만 기본 workspace 사용.
  const resolution = await resolveWorkspace(
    restOrigin,
    authHeaders,
    readAccessCode(event),
    fallback.allowed,
  )
  if (resolution.kind === 'invalid_code') {
    // ⚠️ 코드/해시는 응답에 싣지 않는다. 틀린 코드는 어떤 데이터도 읽거나 쓰지 않고 즉시 거부한다.
    return json(403, {
      ok: false,
      error: 'invalid_access_code',
      message:
        '워크스페이스 접근코드가 올바르지 않습니다. 코드를 다시 확인하거나, 코드를 비우고 전환기 기본 작업공간으로 시도하세요.',
    })
  }
  if (resolution.kind === 'fallback_disabled') {
    // 코드 없음 + 전환기 fallback 비활성화 → 접근코드 필수. GET/POST 모두 여기서 차단(읽기/쓰기 0).
    return json(403, {
      ok: false,
      error: 'access_code_required',
      message:
        '전환기 기본 작업공간이 비활성화되어 있습니다. 워크스페이스 접근코드를 입력해주세요.',
    })
  }
  if (resolution.kind === 'error') {
    return json(200, { ok: false, message: '작업공간 조회 중 오류가 발생했습니다.' })
  }
  if (resolution.kind === 'not_found') {
    return json(200, {
      ok: false,
      message:
        'Default workspace not found. supabase/schema.sql 을 먼저 실행했는지 확인해주세요.',
    })
  }
  const { workspaceId, usedDefault } = resolution

  if (event.httpMethod === 'GET') {
    return await handleGet(restOrigin, authHeaders, workspaceId, usedDefault, fallback.allowed)
  }
  if (event.httpMethod === 'POST') {
    return await handlePost(
      restOrigin,
      authHeaders,
      workspaceId,
      event.body,
      usedDefault,
      fallback.allowed,
    )
  }
  return json(405, { ok: false, message: `Method ${event.httpMethod} not allowed` })
}

const handleGet = async (
  origin: string,
  headers: Record<string, string>,
  workspaceId: string,
  usedDefault: boolean,
  fallbackAllowed: boolean,
) => {
  const url = `${origin}/rest/v1/homebase_app_state?workspace_id=eq.${workspaceId}&select=state_key,payload,version,updated_at`
  try {
    const res = await timedFetch(url, { headers })
    if (!res.ok) {
      return json(200, {
        ok: false,
        message: `Supabase GET failed (status ${res.status})`,
      })
    }
    const rows = (await res.json()) as Array<{
      state_key: string
      payload: unknown
      version: number
      updated_at: string
    }>
    // 화이트리스트 외 key는 무시. 같은 key가 여러 번 들어와도 마지막 값만 사용.
    const items: Record<string, unknown> = {}
    const updatedAt: Record<string, string> = {}
    rows.forEach((r) => {
      if (!ALLOWED_KEYS.has(r.state_key)) return
      items[r.state_key] = r.payload
      updatedAt[r.state_key] = r.updated_at
    })
    return json(200, { ok: true, items, updatedAt, workspaceId, usedDefault, fallbackAllowed })
  } catch (e) {
    return json(200, {
      ok: false,
      message: errorMessage(e, 'Supabase GET error'),
    })
  }
}

const handlePost = async (
  origin: string,
  headers: Record<string, string>,
  workspaceId: string,
  bodyRaw: string | null | undefined,
  usedDefault: boolean,
  fallbackAllowed: boolean,
) => {
  let parsed: { items?: Record<string, unknown> }
  try {
    parsed = JSON.parse(bodyRaw || '{}') as { items?: Record<string, unknown> }
  } catch {
    return json(400, { ok: false, message: 'Body must be valid JSON' })
  }
  const items = parsed.items
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    return json(400, {
      ok: false,
      message: 'Body must include items object: { items: { state_key: payload, ... } }',
    })
  }

  // 화이트리스트 통과 + payload 유효성 검사.
  // homebase_app_state.payload는 jsonb NOT NULL이라 null을 보내면 status 400이 발생한다.
  // 따라서 null/undefined/직렬화 불가 항목은 upsert 대상에서 제외하고 skippedKeys에 모은다.
  // 빈 객체({})·빈 배열([])·빈 문자열("")·0·false 같은 "의미 있는 빈 값"은 정상 저장 대상.
  const rows: { workspace_id: string; state_key: string; payload: unknown }[] = []
  const skippedKeys: string[] = []
  for (const [k, v] of Object.entries(items)) {
    if (!ALLOWED_KEYS.has(k)) continue
    if (v === null || v === undefined) {
      skippedKeys.push(k)
      continue
    }
    // JSON 직렬화가 깨지는 값(순환참조 등)은 안전하게 건너뛴다.
    try {
      JSON.stringify(v)
    } catch {
      skippedKeys.push(k)
      continue
    }
    rows.push({ workspace_id: workspaceId, state_key: k, payload: v })
  }

  // 저장할 행이 없으면 Supabase 호출 자체를 생략해 status 400을 회피한다.
  if (rows.length === 0) {
    return json(200, {
      ok: true,
      saved: 0,
      savedKeys: [],
      skippedKeys,
      usedDefault,
      fallbackAllowed,
      message: '저장할 데이터가 없어 빈 항목은 건너뛰었습니다.',
    })
  }

  // PostgREST upsert: on_conflict + Prefer: resolution=merge-duplicates.
  // unique(workspace_id, state_key) 제약을 사용하므로 같은 (workspace_id, state_key)는 update.
  const url = `${origin}/rest/v1/homebase_app_state?on_conflict=workspace_id,state_key`
  try {
    const res = await timedFetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    })
    if (!res.ok) {
      // ⚠️ 서버 로그에만 진단 정보를 남긴다(브라우저 응답에는 절대 노출 X).
      // service role key/페이로드 원문/공고문 텍스트는 절대 로그에 남기지 않는다.
      // Supabase의 error body 첫 200자만 잘라 짧은 진단으로 사용한다.
      try {
        const errBody = await res.text()
        const safeSnippet = (errBody || '')
          .replace(/[\r\n\t]+/g, ' ')
          .slice(0, 200)
        console.error('[app-state] Supabase upsert failed', {
          status: res.status,
          attemptedKeys: rows.map((r) => r.state_key),
          // body snippet은 노출 위험을 줄이기 위해 200자로 제한.
          errorSnippet: safeSnippet,
        })
      } catch {
        console.error('[app-state] Supabase upsert failed', {
          status: res.status,
          attemptedKeys: rows.map((r) => r.state_key),
        })
      }
      return json(200, {
        ok: false,
        message: `Supabase upsert failed (status ${res.status})`,
        skippedKeys,
      })
    }
    const savedKeys = rows.map((r) => r.state_key)
    const message =
      skippedKeys.length > 0
        ? `${savedKeys.length}개 항목을 저장했고, 빈 항목 ${skippedKeys.length}개는 건너뛰었습니다.`
        : `${savedKeys.length}개 항목을 저장했습니다.`
    return json(200, {
      ok: true,
      saved: savedKeys.length,
      savedKeys,
      skippedKeys,
      usedDefault,
      fallbackAllowed,
      message,
    })
  } catch (e) {
    console.error('[app-state] Supabase upsert error', {
      name: e instanceof Error ? e.name : 'Unknown',
      attemptedKeys: rows.map((r) => r.state_key),
    })
    return json(200, {
      ok: false,
      message: errorMessage(e, 'Supabase upsert error'),
      skippedKeys,
    })
  }
}

// workspace_code_hash로 workspace id를 조회한다. 매칭이 없으면 null.
// codeHash는 호출부에서 sha256(접근코드) 또는 DEFAULT_WORKSPACE_CODE_HASH 로 넘긴다.
const fetchWorkspaceIdByHash = async (
  origin: string,
  headers: Record<string, string>,
  codeHash: string,
): Promise<string | null> => {
  const url = `${origin}/rest/v1/homebase_workspaces?workspace_code_hash=eq.${encodeURIComponent(
    codeHash,
  )}&select=id&limit=1`
  const res = await timedFetch(url, { headers })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

// 8초 타임아웃 fetch 래퍼.
const timedFetch = async (
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> => {
  const { timeoutMs = 8000, ...rest } = init
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

const errorMessage = (e: unknown, fallback: string) => {
  if (e instanceof Error && e.name === 'AbortError') return 'Supabase request timed out'
  return fallback
}

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
})

export { handler }
