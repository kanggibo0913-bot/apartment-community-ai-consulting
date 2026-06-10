# HOMEBASE AI 운영 QA 체크리스트

> 본 문서는 HOMEBASE AI / 아파트 커뮤니티 AI 컨설팅 솔루션의 운영 배포본을 점검하기 위한 체크리스트입니다.
> 운영자가 그대로 복사하여 점검 결과를 채워 넣을 수 있도록 체크박스 형식으로 구성되어 있습니다.
> NG 발생 시 즉시 코드를 수정하지 말고 **재현 조건과 기대값/실제값을 기록**한 뒤 별도 작업으로 분리합니다.

---

## 0. QA 기본 원칙

- [ ] 운영 URL / 브라우저 / 점검 일시 / origin/main HEAD / 단지명 기록
- [ ] localStorage 초기화 금지 (사용자 운영 데이터 보존)
- [ ] 기존 저장 데이터 삭제 금지
- [ ] A/B 단지 데이터 분리 우선 확인
- [ ] 화면값 / CSV / 인쇄 / 저장본 값 일치 확인
- [ ] NG 발견 시 즉시 수정 금지 → 재현 조건 기록 후 별도 fix 작업으로 분리
- [ ] AI 호출 결과는 OpenAI 응답 그대로 사용 (수기 보정 금지)
- [ ] Supabase 동기화는 white-list 키만 대상임을 인지

---

## 1. 공통 QA 환경

```
- 운영 URL:
- origin/main HEAD:
- Netlify 최신 배포 상태:
- 브라우저 / 버전:
- 테스트 단지 A (이름/코드):
- 테스트 단지 B (이름/코드):
- 접근코드 / 관리자 코드:
- 데이터 초기화 여부 (반드시 "초기화 안 함"):
- 점검자:
- 점검 일시:
```

---

## 2. 단지 관리 / 프로젝트 전환

- [ ] 단지 생성 정상 (이름, 코드, 기본 정보 저장)
- [ ] 단지 선택 시 사이드바/헤더에 선택 단지명 표시
- [ ] A → B 단지 전환 시 화면 데이터가 즉시 B 단지 기준으로 갱신
- [ ] B → A 단지 전환 시 A 단지 기존 데이터 유지
- [ ] A단지 데이터가 B단지 화면에 보이지 않음
- [ ] B단지 데이터가 A단지 화면에 보이지 않음
- [ ] 새로고침 후 마지막 선택 단지/데이터 유지
- [ ] legacy 전역 저장본이 단지 선택 후에도 두 번째 단지에 그대로 노출되지 않음 (1회 흡수 정책 확인)
- [ ] 단지 삭제/수정 시 다른 단지 데이터에 영향 없음

---

## 3. 공고문 분석 / 입찰 기능 (`tender`, BidNoticeAIAnalysis)

- [ ] 공고문 텍스트/파일 입력 정상
- [ ] AI 공고문 분석 결과 생성 (taskType: bidNoticeAnalysis)
- [ ] 주요 일정(개찰/PT/서류제출) 추출 표시
- [ ] 리스크(A~D 등급) 추출 표시
- [ ] 공고 등록 / 일정 등록 흐름이 산출표/달력과 연결됨
- [ ] 입찰 전역 데이터는 단지별 데이터(`projectId` scope)와 명확히 구분됨
- [ ] AI 결과가 `aiResultHistory`에 저장됨 (taskType, 시각, 입력 메타 포함)
- [ ] AI 함수 60초 타임아웃 시 UI가 에러 분류 메시지로 복구됨
- [ ] 동일 공고를 재분석할 때 이전 결과를 덮어쓰지 않음 (이력 누적)

---

## 4. 입찰 스케줄러 / 일정 관리

- [ ] 일정 추가 (PT / 개찰 / 서류제출 등)
- [ ] 일정 수정/삭제
- [ ] 달력 뷰에 일정 표시
- [ ] 마감 임박 일정 강조 표시 (있다면)
- [ ] 새로고침 후 일정 유지
- [ ] 전역 입찰 일정 정책 명확 (특정 단지에 종속되지 않음)
- [ ] 알림/리마인더 정책 확인 (구현 시)

---

## 5. 산출표 / 견적 계산 (`estimate`, EstimateCalculator)

- [ ] 입력값 변경 시 총액 자동 재계산
- [ ] 항목 추가/삭제 정상
- [ ] 단가 × 수량 = 소계 검증
- [ ] 모바일 / PC 화면 깨짐 없음 (표 가로 스크롤 확인)
- [ ] 저장본 생성/불러오기
- [ ] CSV / 출력 필요 시 화면값과 일치
- [ ] 공고별 양식 이관은 수동 전제임을 인지 (자동 매핑 없음)
- [ ] 음수/0/공란 입력에 대한 동작 확인

---

## 6. 현장 인건비 산출 (`labor-cost`, SiteLaborCostPage)

> ⚠️ 최근 (커밋 `59ba6d2`) 단지 전환 시 다른 단지 슬롯에 데이터가 덮어쓰여지는 race condition을 수정했습니다.
> 본 섹션의 모든 항목을 통과해야 회귀가 없다고 판단합니다.

### 6-1. 직원 / 설정 입력

- [ ] 직원 추가 / 수정 / 삭제
- [ ] 시급제 / 월급제 구분 동작
- [ ] 직원별 기본급 / 시급 입력 저장
- [ ] 4대보험·세금 기본 옵션 정상 동작

### 6-2. 적용 기준 (source) — 시급제 / 월급제

- [ ] **시급제(calendar source)**: 월별 달력 월간합계 값이 직원별 계산결과로 반영됨
- [ ] **월급제(calc source)**: 직원별 계산결과(기본 월급) 기준이 화면에 반영됨
- [ ] 적용 기준 라디오/배지가 현재 source(`calendar` / `calc`)와 일치
- [ ] 적용 기준 변경 시 화면 즉시 갱신 (저장본은 변하지 않음)

### 6-3. 월별 달력 (SiteLaborCalendar)

- [ ] 달력 셀에 레슨수당/실비 입력 정상
- [ ] 월간 합계 자동 계산
- [ ] 레슨수당 100,000원 입력 → 화면 100,000원 반영 (회귀 점검)
- [ ] 레슨수당 0원 입력 → 화면 0원 반영
- [ ] 0원 입력 후 재로딩 / 탭 전환 시 350,000원 등 이전 값으로 되살아나지 않음 (회귀 점검)

### 6-4. 월급제 예외 조정 (calc + adjustment)

> 공식
> - 공제액 = 월급 × (결근일수 + 무급휴가일수) ÷ 당월일수
> - 최종 세전급여 = 기본 월급 - 공제액 - 기타공제 + 추가수당

- [ ] 결근일수 입력 시 공제액 = 월급 × 결근일 ÷ 당월일수 일치
- [ ] 무급휴가일수 추가 시 합산 공식 일치
- [ ] 추가수당 입력 → 최종 세전급여 + 추가수당
- [ ] 기타공제 입력 → 최종 세전급여 - 기타공제
- [ ] 조정 사유 입력 / 저장
- [ ] 조정값 0 (또는 미입력) 시 기본 월급과 동일

### 6-5. CSV / 인쇄 / 화면 일치

- [ ] CSV 컬럼: 적용 기준 / 공제금액 / 추가수당 / 기타공제 / 최종세전급여 / 조정 사유 모두 포함
- [ ] CSV 값 = 화면 값 일치
- [ ] 인쇄 미리보기 값 = 화면 값 일치
- [ ] 인쇄 레이아웃 깨짐 없음 (A4 기준)

### 6-6. 저장본 (snapshot) freeze

- [ ] 저장본 생성 시 현재 source / 적용 기준이 freeze 됨
- [ ] 저장본 행에 source 배지 표시 (`월별 달력` / `직원별 계산결과` 등)
- [ ] 저장본 인쇄 → 저장 당시 값 그대로 출력 (현재 설정과 무관)
- [ ] 저장본 생성 후 달력/조정값을 바꿔도 저장본 인쇄 변동 없음
- [ ] 저장본 삭제 정상 (다른 저장본/단지 영향 없음)

### 6-7. legacy 저장본 처리

- [ ] 기준 정보 없는 legacy 저장본에 "기준 정보 없음" 또는 동등 안내 표시
- [ ] legacy 저장본이 자동 변형되거나 덮어쓰여지지 않음
- [ ] legacy 저장본이 자동 삭제되지 않음

### 6-8. A/B 단지 분리 (race condition 회귀 점검)

- [ ] A 단지에서 저장 → B 단지로 전환 → B 단지 슬롯에 A 데이터 없음
- [ ] B 단지 작업 중 페이지 이동/복귀 후 A 단지 데이터 정상 유지
- [ ] 단지 전환 직후 첫 변경이 잘못된 단지 슬롯에 기록되지 않음 (`loadedForProjectIdRef` 가드)
- [ ] 저장본 목록이 단지별로 분리됨
- [ ] settings / employees / calendar / payrollDraft 모두 단지별 byProject 슬롯에 분리 저장

---

## 7. 시설 보수 / 유지관리 기록 (`maintenance`, MaintenanceRecordsPage)

- [ ] 보수 기록 추가 (제목, 일자, 상태, 비용, 메모)
- [ ] 상태 변경 (예정/진행중/완료 등) 정상
- [ ] 비용/메모 저장 및 재로딩 후 유지
- [ ] 단지별 분리 (A 단지 보수 기록이 B 단지에 보이지 않음)
- [ ] CSV / 출력 기능이 있다면 화면값과 일치
- [ ] 첨부 파일/이미지가 있다면 다른 단지로 노출되지 않음

---

## 8. 입주민 안내 보고서 (`resident-notice`, ResidentNoticeReportPage)

- [ ] 보고서 생성 (월간 요약 / 운영 안내 등)
- [ ] 민감정보(개별 인건비, 계약가, 내부 결정) 자동 제외
- [ ] 공개용 문구 / 톤이 입주민용으로 적절
- [ ] 발행본(snapshot) 저장 정상
- [ ] 발행본 단지별 분리
- [ ] 공개 URL (`#/report/:slug`) 발급 시 슬러그 충돌 없음
- [ ] 발행본이 다른 단지 페이지에 보이지 않음
- [ ] 이미 발행된 공개 URL은 후속 작업으로 변경되지 않음

---

## 9. 월간 리포트 (`monthly-report`, MonthlyReport)

- [ ] 월간 리포트 AI 생성 (taskType: monthlyReport, 9섹션)
- [ ] 비용 / 수익 / 민원 / 운영 데이터가 입력으로 반영됨
- [ ] AI 결과 `aiResultHistory`에 저장 + `projectId` 메타 포함
- [ ] 다른 단지에서 보이지 않음
- [ ] 결과 복사 / 다운로드 / 출력 가능
- [ ] Netlify 함수 타임아웃 발생 시 UI 복구 (60초 클라이언트 타임아웃)
- [ ] `MAX_OUTPUT_TOKENS.monthlyReport=1600` 한도 내에서 출력 잘림이 비정상적이지 않은지 확인

---

## 10. 문서센터 / 공문 / 계약서 (`document`, `contract`, `review`, `contract-manage`)

- [ ] 공문 생성 (taskType: document)
- [ ] 계약서 초안 생성 (taskType: contractGenerate)
- [ ] 계약서 검토 (taskType: contractReview)
- [ ] 단지 기본정보 / 운영정보가 입력으로 반영됨
- [ ] AI 결과 `aiResultHistory` 저장 + `projectId` 메타 포함
- [ ] 출력 / 복사 / 다운로드 기능 정상
- [ ] 계약 관리 화면에서 단지별 계약 목록 분리

---

## 11. 안건 예측 (`agenda`, AgendaPredictor)

- [ ] 입력 데이터(민원, 비용, 운영) 반영
- [ ] 안건 예측 결과 생성 (taskType: agendaPredict)
- [ ] AI 결과 `aiResultHistory` 저장
- [ ] 단지별 필터 동작
- [ ] legacy AI 이력(projectId 없음) 표시 정책이 일관됨

---

## 12. AI 결과 이력 (`ai-history`, AiResultHistoryPage)

- [ ] 현재 선택 단지의 결과만 기본 표시
- [ ] projectId 없는 legacy 결과 표시 정책 일관 (전체 보기 / 단지 보기 구분)
- [ ] 입찰(전역) 결과 표시 정책 명확
- [ ] taskType별 필터 (monthlyReport / bidNoticeAnalysis / document / contractGenerate / contractReview / agendaPredict)
- [ ] 결과 삭제 / 관리 가능 여부 확인
- [ ] 현재 단지 배너 / 안내 문구가 화면 컨텍스트와 일치

---

## 13. 시스템 데이터 동기화 (`system-data-sync`, SystemDataSyncPage)

- [ ] Supabase 동기화 대상 key 목록 표시 (`SYNC_GROUPS`)
- [ ] byProject key 정상 포함 (siteLaborCostData / siteLaborCostSnapshots / siteLaborCalendarInputs / siteLaborPayrollDraft / siteLaborPayrollSourcePref / maintenanceRecords / residentNoticeReports / publishedResidentReports / aiResultHistory)
- [ ] legacy 전역 key가 동기화 대상과 명확히 구분
- [ ] 업로드 → 다운로드 왕복 후 데이터 손실 없음
- [ ] `projectScopedLegacyMigration` 메타는 동기화 대상이 아님 (로컬 전용)
- [ ] 동기화 실패 시 로컬 데이터 손상 없음
- [ ] 동기화 함수(`netlify/functions/app-state.ts`) `ALLOWED_KEYS` 변경 사항 반영 확인

---

## 14. 공개 보고서 / 외부 공유 (`PublicReportView`, `#/report/:slug`)

- [ ] 공개 링크 생성 정상
- [ ] 공개 페이지(로그인 없이) 접근 정상
- [ ] 민감정보(개별 인건비, 내부 결정, 계약가 등) 미노출
- [ ] 이미 발행된 URL이 후속 작업으로 깨지지 않음
- [ ] 단지별 발행본이 다른 단지 슬러그로 노출되지 않음
- [ ] 외부 접근 권한 정책 명확 (인증/캡차/만료 등 — 도입 시 별도 점검)
- [ ] 공개 페이지에 내부 메뉴/네비게이션이 노출되지 않음

---

## 15. 모바일 / 태블릿

- [ ] 대시보드 모바일 레이아웃 정상
- [ ] 현장 직원이 자주 쓰는 화면(인건비, 보수, 민원) 모바일 사용 가능
- [ ] 표 가로 스크롤 동작
- [ ] 버튼 터치 영역 충분 (44px 이상 권장)
- [ ] 인쇄 / CSV는 PC 중심으로 두는 항목 명확히 구분
- [ ] PWA 도입 전이라면 모바일 새로고침 시 데이터 유지 확인

---

## 16. 배포 / Netlify

- [ ] `main` push → Netlify webhook 자동 배포 트리거
- [ ] `npm run build` 성공 (Vite + tsc)
- [ ] 운영 URL 접속 정상
- [ ] 브라우저 캐시 vs 새 번들 충돌 없음 (Ctrl+Shift+R로 확인)
- [ ] 새 기능 / 수정 반영 확인
- [ ] 환경변수 변경 시 영향 범위 확인 (OpenAI 키, Supabase 키 등)
- [ ] `netlify/functions/ai.ts` 응답이 운영 환경에서 정상

---

## 17. 심각도 기준

### High (즉시 fix 필요)
- A/B 단지 데이터 섞임
- 화면값 ↔ CSV / 인쇄 / 저장본 값 불일치
- 저장본 인쇄가 저장 당시 기준을 유지하지 않고 현재 설정을 따라감
- 데이터 손실 (저장됐던 값이 사라짐)
- 공개 보고서에 민감정보 노출 (개별 인건비, 계약가, 내부 결정 등)
- AI 결과가 다른 단지에 잘못 노출
- Supabase 동기화 후 로컬 데이터 손상

### Medium
- 배지 / 라벨 / 안내문 오류
- 일부 필터 오작동 (다른 단지 데이터가 보이진 않으나 필터가 안 먹음 등)
- 저장은 되지만 화면 갱신이 늦음
- 계산식 설명 부족 / 사용자 혼란

### Low
- 문구 어색함 / 오타
- 스타일 깨짐 (기능에는 지장 없음)
- chunk size 경고
- legacy 안내 부족

---

## 18. QA 결과 입력 양식 (기능별 반복 사용)

> 항목 하나씩 아래 양식을 복사해서 채워주세요. NG 발생 시 이 양식이 그대로 버그 수정 프롬프트로 변환됩니다.

```
- 기능명:
- 화면 위치(메뉴/페이지):
- 테스트 단지:
- 테스트 일시:
- 입력값:
- 기대값:
- 실제값:
- 결과: OK / NG / N/A
- 심각도: High / Medium / Low / -
- 스크린샷 경로:
- 재현 조건 (NG일 때 필수):
- 비고:
```

---

## 19. 작업 완료 후 루틴

- [ ] QA 완료 (본 체크리스트 채움)
- [ ] NG 정리 (심각도별 정렬)
- [ ] High 우선 수정 (별도 fix 작업으로 분리)
- [ ] `npm run build`
- [ ] smoke test (주요 화면 1회 클릭)
- [ ] 변경 파일 명시적 stage (`git add .` 금지)
- [ ] commit (작업 단위별 단일 커밋)
- [ ] push (사용자 명시 승인 후에만)
- [ ] Netlify 배포 / 운영 URL 확인
- [ ] `/compact` 후 다음 작업으로 전환

---

## 부록 A. 단지별 분리 저장 키 (참고)

`src/utils/projectScopedStorage.ts` 기준 byProject 저장 대상:

- `siteLaborCostData`
- `siteLaborCostSnapshots`
- `siteLaborCalendarInputs`
- `siteLaborPayrollDraft`
- `siteLaborPayrollSourcePref`
- `maintenanceRecords`
- `residentNoticeReports`
- `publishedResidentReports`
- `aiResultHistory`

> `LEGACY_MIGRATION_META_KEY = 'projectScopedLegacyMigration'` 는 1회 흡수 마커로 **로컬 전용**입니다.
> Supabase 동기화 대상 white-list(`SystemDataSyncPage`의 `SYNC_GROUPS`, `netlify/functions/app-state.ts`의 `ALLOWED_KEYS`)에 포함되지 않아야 합니다.

## 부록 B. AI taskType (참고)

`netlify/functions/ai.ts`:

- `monthlyReport` — 월간 리포트 9섹션 (`MAX_OUTPUT_TOKENS=1600`)
- `bidNoticeAnalysis` — 공고문 분석 A~D 등급
- `document` — 공문 / 질의서
- `contractGenerate` — 계약서 초안
- `contractReview` — 계약서 검토
- `agendaPredict` — 안건 예측

클라이언트 호출은 `src/utils/aiClient.ts`의 `callAI(taskType, payload)` 사용 (60초 AbortController 타임아웃).
