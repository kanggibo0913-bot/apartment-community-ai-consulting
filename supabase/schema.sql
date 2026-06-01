-- HOMEBASE AI / 아파트 커뮤니티 위탁운영 컨설팅 — Supabase 초기 스키마
--
-- ⚠️ 이 SQL은 Supabase 프로젝트의 SQL Editor에서 1회 실행하면 됩니다.
-- ⚠️ 이번 단계는 "연결 기반 + 테이블 준비"까지만 진행하며 기존 localStorage 데이터를
--     자동으로 마이그레이션하지 않습니다. 마이그레이션은 후속 단계에서 별도 진행합니다.
--
-- 접근 모델 (의도):
--   브라우저 → Netlify Function → Supabase REST API (service role) → Postgres
--   브라우저는 Supabase anon/service 키를 직접 들고 있지 않습니다.
--   따라서 RLS는 "deny by default"로 두고, 모든 정상 접근은 service role을 통과합니다.
--
-- 권장 실행 순서:
--   1) gen_random_uuid()를 위해 pgcrypto 확장 활성화
--   2) homebase_workspaces 테이블 생성 (작업공간 단위 멀티 인스턴스 대비)
--   3) homebase_app_state 테이블 생성 (state_key → payload jsonb 범용 저장)
--   4) updated_at 자동 갱신 트리거
--   5) RLS 활성화 (정책 없음 = service role만 통과)
--   6) 기본 작업공간 시드 1건 (옵션)

-- 0) 확장
create extension if not exists "pgcrypto";

-- 1) 작업공간 — 멀티 단지/멀티 인스턴스 대비. 접근 코드 해시로만 식별한다.
create table if not exists public.homebase_workspaces (
  id uuid primary key default gen_random_uuid(),
  workspace_code_hash text not null unique,
  label text not null default '기본 작업공간',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 앱 상태 범용 저장. state_key는 기존 localStorage key와 동일한 식별자를 그대로 사용한다.
--    예: tenderNotices / tenderScheduleEvents / siteLaborCalendarInputs /
--        siteLaborCostData / siteLaborCostSnapshots / aiResultHistory /
--        publishedReports / bidNoticeChecklist 등.
--    payload는 jsonb로 자유형이며 version 컬럼으로 향후 스키마 진화를 흡수한다.
create table if not exists public.homebase_app_state (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.homebase_workspaces(id) on delete cascade,
  state_key text not null,
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, state_key)
);

-- 3) updated_at 자동 갱신 트리거 (공통)
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_homebase_workspaces_updated_at on public.homebase_workspaces;
create trigger trg_homebase_workspaces_updated_at
before update on public.homebase_workspaces
for each row execute function public.touch_updated_at();

drop trigger if exists trg_homebase_app_state_updated_at on public.homebase_app_state;
create trigger trg_homebase_app_state_updated_at
before update on public.homebase_app_state
for each row execute function public.touch_updated_at();

-- 4) RLS — 기본 deny. service role 키를 통과한 Netlify Function만 접근하도록 둔다.
--    anon/authenticated 역할에는 정책을 부여하지 않는다 (의도된 차단).
alter table public.homebase_workspaces enable row level security;
alter table public.homebase_app_state  enable row level security;

-- 5) 기본 작업공간 1건 시드 (옵션). workspace_code_hash는 운영 시 sha256 등으로 교체.
--    이미 존재하면 무시.
insert into public.homebase_workspaces (workspace_code_hash, label)
values ('default-placeholder-hash', '기본 작업공간')
on conflict (workspace_code_hash) do nothing;

-- 검증 쿼리 (수동 실행):
--   select id, label, created_at from public.homebase_workspaces;
--   select state_key, jsonb_typeof(payload), version, updated_at
--     from public.homebase_app_state order by updated_at desc limit 10;
