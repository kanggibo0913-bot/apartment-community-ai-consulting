# Supabase 연동 설정 가이드

이 문서는 HOMEBASE AI(아파트 커뮤니티 위탁운영 컨설팅) 프로젝트에서 Supabase 연결을
준비하고 헬스 체크하는 절차를 정리한다.

## 이번 단계 범위

- Supabase 프로젝트 생성 + 초기 테이블 1세트(`homebase_workspaces`, `homebase_app_state`) 준비
- Netlify Function(`/.netlify/functions/supabase-health`)을 통해 연결 가능 여부 확인
- **기존 localStorage 데이터는 아직 자동 동기화되지 않는다.** 마이그레이션은 후속 단계에서 별도 진행.

## 아키텍처 의도

```
브라우저  →  Netlify Function  →  Supabase REST API (service role)  →  Supabase Postgres
```

- 브라우저는 Supabase anon/service 키를 직접 보유하지 않는다.
- 모든 정상 접근은 Netlify Function을 통과한 service role 호출이다.
- 따라서 Postgres 테이블은 RLS를 활성화하고 **정책 없음(deny by default)** 로 둔다.

## 1. Supabase 프로젝트 생성

1. https://supabase.com/dashboard 에서 새 프로젝트 생성
2. 프로젝트 이름 / DB 비밀번호 / 리전 선택 (한국 사용자라면 `Northeast Asia (Tokyo/Seoul)`)
3. 프로젝트가 준비되면 좌측 메뉴 **SQL Editor** 진입

## 2. 초기 스키마 적용

1. SQL Editor에서 새 쿼리 생성
2. 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 전체 복사해 붙여넣고 실행
3. 다음 두 테이블이 보이면 성공
   - `public.homebase_workspaces`
   - `public.homebase_app_state`
4. RLS는 schema.sql에서 자동 활성화되며 별도 정책은 생성하지 않는다 (의도된 차단)

## 3. Netlify 환경변수 추가

Netlify 대시보드 → 사이트 → **Site settings → Environment variables**

| 키 이름                       | 값                                                                | 비고                                                  |
| ---------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `SUPABASE_URL`               | `https://xxxxxxxxxx.supabase.co`                                  | Supabase 프로젝트 Settings → API → Project URL        |
| `SUPABASE_SERVICE_ROLE_KEY`  | `eyJhbGciOi...` (service_role, 매우 긴 JWT)                       | Supabase Settings → API → Project API keys → service_role |

- ⚠️ **`VITE_` prefix를 절대 붙이지 마세요.** 붙이면 브라우저 번들에 노출됩니다.
- ⚠️ service role key는 절대 git, Slack, 채팅창에 붙여넣지 마세요.
- ⚠️ 로컬 개발 시에는 프로젝트 루트 `.env` 파일에 같은 이름으로 설정합니다. `.env`는 `.gitignore`로 차단됩니다.

## 4. Netlify 재배포

환경변수 변경은 기존 빌드 캐시를 사용해도 함수 런타임에 반영되지만, 확실하게 적용되도록
다음 push 또는 **Deploys → Trigger deploy → Deploy site** 로 재배포 권장.

## 5. 앱에서 Supabase 연결 확인

배포 후 브라우저에서 다음 URL에 직접 접근:

```
https://<your-netlify-site>/.netlify/functions/supabase-health
```

응답 예시 (성공):

```json
{ "ok": true, "configured": true, "message": "Supabase connection ready" }
```

기타 응답:

| 응답                                                                         | 의미                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| `{ ok: false, configured: false, message: "...not configured" }`            | Netlify 환경변수 미설정                                   |
| `{ ok: false, configured: true,  message: "...URL format is invalid" }`     | `SUPABASE_URL` 값이 올바른 https URL이 아님              |
| `{ ok: false, configured: true,  message: "...failed (status 401)" }`       | service role 키가 잘못되었거나 만료                       |
| `{ ok: false, configured: true,  message: "...timed out" }`                 | 5초 내 응답 없음 (네트워크/Supabase 장애)                 |
| `{ ok: false, configured: true,  message: "...connection error" }`          | DNS/네트워크 오류 등                                      |

브라우저 UI 버튼은 후속 단계에서 추가 예정. 이번 단계에서는 위 URL 직접 호출로만 확인.

## 6. 주의사항

- **service role key는 브라우저에 노출 금지.** 코드/환경변수/응답/로그 어디에도 절대 노출하지 않는다.
- **`.env` 커밋 금지.** `.gitignore`로 차단되어 있으므로 우회하지 말 것.
- **기존 localStorage 데이터는 아직 자동 동기화되지 않는다.** 이번 단계는 연결 기반만 준비.
- **기존 기능(AI 분석/입찰 스케줄러/공고 등록·관리/현장 인건비 산출/근무 달력 등)은 손대지 않는다.**
- RLS는 schema.sql에서 활성화되며 정책 없이 둔다. 브라우저가 anon 키로 직접 접근하려고 해도 차단된다.
- service role 키가 유출된 것 같으면 즉시 Supabase Settings → API → **Rotate service_role** 로 키 교체.

## 7. 향후 마이그레이션 계획 (참고)

1. `state_key`별 sync 어댑터 추가 (예: tenderNotices, siteLaborCalendarInputs)
2. Netlify Function `app-state-sync` 1개에서 GET/PUT 처리 (workspace_code 헤더 기반)
3. 브라우저는 작업공간 접근 코드만 입력 → 함수가 sha256 해시 후 workspace 찾기
4. 첫 GET 시 localStorage가 비어 있으면 서버 값으로 채움, 아니면 사용자에게 충돌 선택지 제공
5. 단계별로 한 key씩 옮기고 회귀 점검

이번 커밋은 1~4단계의 토대만 마련한다.
