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

## 7. 워크스페이스 접근코드 게이트 (Phase C-1/C-2)

데이터 동기화 페이지에 **워크스페이스 접근코드** 입력이 추가되었습니다.

> ⚠️ **이것은 "현장(단지)별 격리"가 아니라 "워크스페이스 접근 게이트"입니다.**
> 함수 주소만 아는 외부인이 클라우드 데이터를 읽거나 덮어쓰는 것을 1차로 막는 용도입니다.
> 현장별(projectId 단위) 접근 제한은 이후 단계(서버 필터링)에서 별도로 추가될 예정입니다.

### 동작 방식

- 브라우저는 접근코드를 `x-workspace-access-code` 헤더에 실어 GET/POST 모두에 전달합니다.
- 코드 평문은 `sessionStorage`에만 보관되며(탭을 닫으면 사라짐), 동기화 대상이 아닙니다.
- **해시(sha256)는 서버(Netlify Function)에서만 계산**합니다. 코드 평문/해시는 응답·로그에 노출되지 않습니다.
- 코드가 있으면 그 해시로 workspace를 찾고, 매칭이 없으면 **403(잘못된 접근코드)**를 돌려줍니다(읽기/쓰기 모두 차단).
- 코드가 없으면 **전환기 동안** 기존 기본 작업공간(`default-placeholder-hash`)으로 동작합니다.

### 운영 작업공간(접근코드) 만들기 — Supabase SQL Editor에서 1회 실행

코드 평문은 저장하지 않고, `pgcrypto`의 `digest`로 sha256 해시만 저장합니다.
아래 해시 계산식은 함수의 `sha256(코드)`와 동일한 값이 되도록 맞춘 것입니다.

```sql
-- 아래 'YOUR_LONG_RANDOM_ACCESS_CODE'는 placeholder입니다.
-- 실제 운영 코드로 직접 바꿔 실행하세요 (앞뒤 공백 없이, 대소문자 정확히).
-- ⚠️ 실제 코드는 이 문서/커밋/로그/채팅에 절대 남기지 마세요.
insert into public.homebase_workspaces (workspace_code_hash, label)
values (encode(digest('YOUR_LONG_RANDOM_ACCESS_CODE', 'sha256'), 'hex'), '회사 작업공간')
on conflict (workspace_code_hash) do nothing;
```

- 이후 데이터 동기화 페이지에서 같은 코드를 입력하면 이 작업공간으로 연결됩니다.
- ⚠️ 짧고 추측하기 쉬운 코드 대신 **길고 무작위한 코드**를 사용하세요(sha256은 짧은 코드에 약함).
  더 강한 보호(코드별 bcrypt·전용 access_codes 테이블·요청 rate limit·감사 로그)는 이후 단계 과제입니다.
- 기존 기본 작업공간(`default-placeholder-hash`)은 전환기 호환을 위해 그대로 둡니다. 모든 사용자가
  코드로 전환한 뒤 별도 단계에서 정리(폐기 deadline 적용)할 예정입니다.

## 8. 향후 마이그레이션 계획 (참고)

1. (완료) 접근코드 헤더 + 서버 sha256 해시로 workspace 선택, 코드 없으면 기본 fallback
2. 현장별(projectId) 서버 필터링 — `byProject` key를 단지 단위로 분리(추후)
3. 권한 모델(내부관리자 / 현장관리자 / 읽기전용)과 코드별 허용 단지 목록(추후)
4. 전환기 기본 workspace 폐기 deadline 적용 후 코드 미입력 시 403(추후)
5. rate limit · 낙관적 version 잠금 · 감사 로그 · CORS 등 인프라 보강(추후)
