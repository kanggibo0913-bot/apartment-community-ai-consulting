# 아파트 커뮤니티 AI 컨설팅 솔루션 MVP

아파트 커뮤니티센터 운영 데이터를 입력하고 AI 분석을 통해 인건비·운영비·수익·민원을 분석할 수 있는 내부용 웹앱입니다.

## 🎯 프로젝트 목표

- React + TypeScript + Vite 기반의 실행 가능한 MVP 구축
- 9개 주요 화면 구성
- B2B 관리툴 느낌의 깔끔한 UI (네이비/화이트)
- 확장 가능한 코드 구조

## 📋 구현된 화면

1. **📊 대시보드** - 전체 운영 현황 대시보드
2. **🏢 단지 기본정보** - 아파트 기본 정보 입력/수정
3. **🏛️ 시설 정보** - 커뮤니티 시설 관리
4. **⚙️ 운영 정보** - 운영 관련 정보 관리
5. **💰 비용 정보** - 운영 비용 기록
6. **📈 수익 정보** - 운영 수익 기록
7. **📞 민원 정보** - 주민 민원 관리
8. **🤖 AI 분석 결과** - AI 분석 결과 표시 공간
9. **📄 보고서 초안** - 보고서 생성 및 미리보기

## 🚀 빠른 시작

### 사전 요구사항
- Node.js 18.0 이상
- npm 또는 yarn

### 설치 및 실행

```bash
# 프로젝트 클론
git clone https://github.com/kanggibo0913-bot/apartment-community-ai-consulting.git
cd apartment-community-ai-consulting

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 브라우저에서 http://localhost:5173 접속
```

### 빌드

```bash
# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview
```

## 📁 프로젝트 구조

```
apartment-community-ai-consulting/
├── src/
│   ├── components/           # 공통 컴포넌트
│   │   ├── Sidebar.tsx      # 좌측 네비게이션
│   │   ├── PageHeader.tsx   # 페이지 제목
│   │   ├── Card.tsx         # 카드 컴포넌트
│   │   ├── FormGroup.tsx    # 폼 그룹
│   │   ├── Button.tsx       # 버튼
│   │   └── StatBox.tsx      # 통계 박스
│   ├── pages/               # 페이지 컴포넌트
│   │   ├── Dashboard.tsx
│   │   ├── ApartmentInfo.tsx
│   │   ├── FacilityInfo.tsx
│   │   ├── OperationInfo.tsx
│   │   ├── CostInfo.tsx
│   │   ├── RevenueInfo.tsx
│   │   ├── ComplaintInfo.tsx
│   │   ├── AIAnalysis.tsx
│   │   └── ReportDraft.tsx
│   ├── App.tsx              # 메인 앱 컴포넌트
│   ├── App.css
│   ├── index.css            # 글로벌 스타일
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── README.md
```

## ✨ 주요 특징

- ✅ **React 18.2** + **TypeScript** 으로 타입 안전성 확보
- ✅ **Vite** 기반 빠른 개발 환경
- ✅ **CSS 기반** 깔끔한 스타일링 (Tailwind 미사용으로 의존성 최소화)
- ✅ **좌측 사이드 메뉴** 기반 직관적 네비게이션
- ✅ **네이비/화이트** 색상 스키마로 신뢰감 있는 B2B UI
- ✅ **반응형 디자인** - 다양한 해상도 대응
- ✅ **확장 가능한 구조** - 새로운 기능 추가 용이

## 🔄 상태 관리

현재는 각 페이지에서 `useState`를 사용하여 로컬 상태 관리합니다.

**다음 단계에서 추가될 예정:**
- localStorage를 활용한 데이터 영속성
- Context API 또는 Redux를 활용한 전역 상태 관리

## 📝 현재 구현된 기능

### ✅ 완료된 항목
- [x] 프로젝트 초기 설정 (React, TypeScript, Vite)
- [x] 9개 페이지 레이아웃 및 네비게이션
- [x] 공통 컴포넌트 (Card, Button, FormGroup, StatBox 등)
- [x] 각 페이지별 기본 폼 구조
- [x] 각 페이지별 샘플 데이터
- [x] 네이비/화이트 B2B UI 디자인
- [x] 반응형 레이아웃
- [x] 오류 없는 실행 상태

### ⏳ 다음 단계에서 구현할 기능

#### Phase 2: 데이터 관리
- [ ] localStorage를 활용한 데이터 영속성
- [ ] Context API를 활용한 전역 상태 관리
- [ ] 데이터 초기화 및 리셋 기능

#### Phase 3: AI 분석 및 보고서
- [ ] 비용 분석 로직 (인건비, 운영비 효율성)
- [ ] 수익성 분석 로직
- [ ] 민원 분석 및 트렌드
- [ ] AI 분석 결과 시각화 (차트, 그래프)
- [ ] 보고서 자동 생성
- [ ] PDF 내보내기 기능

#### Phase 4: 고급 기능
- [ ] 데이터 검증 및 에러 처리
- [ ] 사용자 인증 (로그인)
- [ ] 백엔드 API 연동
- [ ] 데이터베이스 연동
- [ ] 다중 아파트 관리 기능
- [ ] 권한 관리 (역할별 접근 제어)
- [ ] 감사 로그 (Audit Log)

#### Phase 5: UX/UI 개선
- [ ] 다크 모드 지원
- [ ] 고급 차트 및 시각화 라이브러리 (Chart.js, ApexCharts 등)
- [ ] 페이지네이션 및 필터링
- [ ] 검색 기능
- [ ] 데이터 테이블 정렬 및 필터

## 🛠 기술 스택

| 항목 | 버전 | 설명 |
|------|------|------|
| React | ^18.2.0 | UI 라이브러리 |
| TypeScript | ^5.3.3 | 타입 안전 언어 |
| Vite | ^5.0.8 | 빌드 도구 |
| Node.js | 18+ | 런타임 환경 |

## 📖 사용 방법

### 1. 데이터 입력
- 좌측 메뉴에서 원하는 섹션 선택
- 각 페이지에서 필요한 정보 입력
- "저장" 버튼으로 데이터 기록 (현재는 브라우저 메모리에만 저장)

### 2. 데이터 확인
- 대시보드에서 전체 현황 확인
- 각 페이지의 통계 박스에서 입력된 데이터 확인
- AI 분석 결과 페이지에서 분석 결과 예정

### 3. 보고서 생성
- "📄 보고서 초안" 페이지로 이동
- "보고서 생성" 버튼 클릭 (다음 단계에서 활성화)
- PDF 다운로드 (다음 단계에서 활성화)

## 🐛 알려진 제한사항

- 데이터는 페이지 새로고침 시 초기화됨 (localStorage 구현 예정)
- AI 분석 기능은 UI만 구현 (로직 구현 예정)
- 보고서 생성 기능은 미구현
- 백엔드 연동 없음

## 🤝 기여 가이드

향후 이 프로젝트에 참여할 때는 다음을 따라주세요:

1. 새로운 기능은 새로운 브랜치에서 개발
2. 커밋 메시지는 명확하게 작성
3. TypeScript의 엄격한 타입 검사 유지
4. 기존 스타일 가이드 준수

## 📞 문의

문제가 발생하거나 기능 제안이 있으시면 GitHub Issues에 등록해주세요.

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

---

**마지막 업데이트**: 2024년 1월
**버전**: 0.1.0 (MVP)
