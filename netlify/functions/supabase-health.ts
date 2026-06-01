import { Handler } from '@netlify/functions'

// Supabase 연결 헬스 체크 — Netlify Function 내에서만 service role 키를 다룬다.
// ⚠️ 키 값 자체 / 키 일부 / 응답 본문 어디에도 절대 노출하지 않는다.
// ⚠️ console.log에도 키 값을 찍지 않는다 (Netlify 로그에 남기 때문).
//
// 응답 스키마 (브라우저 호출자 기준):
//   200 { ok: true,  configured: true,  message: "Supabase connection ready" }
//   200 { ok: false, configured: false, message: "Supabase environment variables are not configured" }
//   200 { ok: false, configured: true,  message: "Supabase connection failed (status N)" }
//
// 의도적으로 HTTP status는 200으로 통일하고, 결과는 ok 플래그로 구분한다.
// (브라우저에서 try/catch + ok 분기 한 번으로 처리하기 쉽도록)

const handler: Handler = async () => {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  // 1) 환경변수 미설정
  if (!url || !key) {
    return jsonResponse({
      ok: false,
      configured: false,
      message: 'Supabase environment variables are not configured',
    })
  }

  // 2) URL 형식 빠른 검증 (https://*.supabase.co 기대). 잘못된 형식이면 외부 호출 없이 즉시 실패.
  let restEndpoint: string
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') throw new Error('protocol')
    // Supabase REST 루트: GET /rest/v1/  → 200 + 헤더만 반환 (테이블 호출 X)
    restEndpoint = `${u.origin.replace(/\/$/, '')}/rest/v1/`
  } catch {
    return jsonResponse({
      ok: false,
      configured: true,
      message: 'Supabase URL format is invalid',
    })
  }

  // 3) REST 루트 호출. 5초 타임아웃.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(restEndpoint, {
      method: 'GET',
      headers: {
        // service role 키를 apikey + Authorization 양쪽에 동일하게 사용 (Supabase REST 관행).
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      return jsonResponse({
        ok: true,
        configured: true,
        message: 'Supabase connection ready',
      })
    }

    // 응답 본문은 노출하지 않는다 (DB 구조/오류 메시지 보호). status 숫자만 사용.
    return jsonResponse({
      ok: false,
      configured: true,
      message: `Supabase connection failed (status ${res.status})`,
    })
  } catch (err) {
    clearTimeout(timeout)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    return jsonResponse({
      ok: false,
      configured: true,
      message: isAbort
        ? 'Supabase connection timed out'
        : 'Supabase connection error',
    })
  }
}

const jsonResponse = (body: Record<string, unknown>) => ({
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    // 헬스 체크는 캐시하지 않는다.
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
})

export { handler }
