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
4. (준비됨, Phase C-3 — 아래 9장) 전환기 기본 workspace fallback을 환경변수로 끌 수 있게 준비. 켜면 코드 미입력 시 403
5. rate limit · 낙관적 version 잠금 · 감사 로그 · CORS 등 인프라 보강(추후)

## 9. 운영 workspace 전환 & 전환기 fallback 폐기 절차 (Phase C-3)

> 이 장은 **"코드 없이도 기본 작업공간으로 접근되는 전환기 상태"**를 안전하게 끝내는 운영 절차다.
> ⚠️ **fallback을 갑자기 끄지 말 것.** 아래 순서대로 운영 workspace를 먼저 만들고 검증한 뒤,
> 마지막에 환경변수로 fallback을 끈다. 순서를 지키면 서비스가 한순간도 끊기지 않는다.

### 9-1. fallback 정책 — 환경변수 (`app-state` 함수)

`app-state` 함수는 **두 환경변수**로 전환기 기본 작업공간(`default-placeholder-hash`) 사용 여부를 결정한다.
**둘 다 미설정이면 "허용"**(현재 동작과 동일) — 설정을 바꾸지 않는 한 배포가 깨지지 않는다.

| 환경변수 | 값 | 동작 |
| --- | --- | --- |
| `HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK` | `false` | fallback **차단** — 코드 없으면 403(`access_code_required`) |
| | `true` | fallback **강제 허용** (아래 마감일 무시) |
| | 미설정/기타 | 미지정 → 마감일 규칙으로 넘어감 |
| `HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL` | `YYYY-MM-DD` | 위 플래그가 미지정일 때만 사용. 이 날짜(UTC 그 날의 끝)가 지나면 자동 차단 |
| | 미설정/잘못된 형식 | 허용(안전 기본값) |

- 우선순위: `ALLOW...=false/true`가 가장 강함 → 그 다음 `..._UNTIL` 마감일 → 둘 다 없으면 허용.
- 응답 메타로 상태가 보인다: 성공 응답의 `usedDefault`(전환기 기본 사용 여부)·`fallbackAllowed`(정책상 허용 여부).
- ⚠️ 환경변수 이름은 정확히 `HOMEBASE_`로 시작한다(오타 `HOMEBBASE_` 주의).

### 9-2. 운영 workspace 만들기 (Supabase SQL Editor에서 1회) — 위 2·7장과 동일

```sql
-- 아래 'YOUR_LONG_RANDOM_ACCESS_CODE'는 placeholder입니다.
-- 실제 운영 코드로 직접 바꿔 실행하세요 (앞뒤 공백 없이, 대소문자 정확히).
-- ⚠️ 실제 코드는 이 문서/커밋/로그/채팅에 절대 남기지 마세요.
insert into public.homebase_workspaces (workspace_code_hash, label)
values (encode(digest('YOUR_LONG_RANDOM_ACCESS_CODE', 'sha256'), 'hex'), '회사 작업공간')
on conflict (workspace_code_hash) do nothing;
```

**운영 접근코드 생성 원칙:**

- **길고 무작위한 문자열**을 쓴다(예: 32자 이상 랜덤). 짧거나 추측 가능한 코드 금지(sha256은 짧은 코드에 약함).
- 실제 코드는 **문서/커밋/채팅/로그/스크린샷에 절대 남기지 않는다.** 비밀번호 관리자 등 **별도 안전 채널**에만 보관한다.
- 위 SQL의 따옴표 안 텍스트는 **항상 `YOUR_LONG_RANDOM_ACCESS_CODE` placeholder**만 커밋한다(실값으로 바꾼 SQL은 저장/공유하지 않는다).

### 9-3. fallback 폐기 전 필수 체크리스트

아래가 **모두** 충족되기 전에는 fallback을 끄지 않는다.

- [ ] 운영 workspace row 생성 완료(9-2 SQL 실행).
- [ ] 운영 접근코드를 별도 안전 채널에 보관.
- [ ] 데이터 동기화 페이지에서 코드 입력 → "상태 새로고침"이 **성공(403 아님)** 하고 "접근코드 기반 작업공간 사용 중"으로 표시됨.
- [ ] 기존 전환기 기본 작업공간에서 보이던 **19개 key가 새 workspace에서도 정상**인지 확인. (보통 새 workspace는 비어 있으므로, 한 번 "클라우드에 저장"으로 새 workspace에 데이터를 올린 뒤 다른 기기에서 코드 입력 후 불러오기로 확인.)
- [ ] 실제 사용하는 모든 브라우저/사용자에게 **접근코드 적용 안내 완료**(코드 미입력자는 폐기 후 접근 불가).

### 9-4. fallback 끄기(폐기) 절차 — Netlify 환경변수

1. (위 9-3 체크리스트 전부 완료 확인)
2. Netlify → Site settings → Environment variables 에서
   `HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK = false` 설정
   (또는 점진 전환을 원하면 `HOMEBASE_DEFAULT_WORKSPACE_FALLBACK_UNTIL = YYYY-MM-DD` 로 마감일 지정).
3. 재배포(Deploys → Trigger deploy) 또는 다음 push로 함수 런타임에 반영.
4. 확인:
   - **코드 미입력** 상태에서 데이터 동기화 페이지 진입 → 상태 카드에 403/"접근코드 필수" 표시.
   - **운영 코드 입력** 후 → "접근코드 기반 작업공간 사용 중", 데이터 정상 로드.

### 9-5. rollback(되돌리기) 절차

문제가 생기면 즉시 전환기 상태로 복구한다.

1. Netlify 환경변수에서 `HOMEBASE_ALLOW_DEFAULT_WORKSPACE_FALLBACK = true` 로 변경
   (또는 `false`/`..._UNTIL` 값을 제거).
2. 재배포 → 코드 미입력 GET/POST가 다시 전환기 기본 작업공간(`default-placeholder-hash`)으로 동작.
3. Supabase 데이터/스키마는 건드리지 않으므로 데이터 손실 없이 즉시 복구된다.

> 폐기 단계는 **환경변수만으로** 켜고 끈다. 코드/스키마 변경 없이 되돌릴 수 있어 안전하다.
> 더 강한 보호(코드별 bcrypt·전용 `access_codes` 테이블·rate limit·감사 로그)는 이후 단계(C-3+)에서 별도로 다룬다.
