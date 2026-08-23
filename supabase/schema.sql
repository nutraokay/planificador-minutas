-- Minutas — esquema Supabase (piloto 1 sede)
-- Corre este archivo completo en el SQL Editor de tu proyecto Supabase.
--
-- Diseño pensado para escalar a multi-sede más adelante: las tablas
-- `dishes`, `weekly_plans` y `randomization_rules` ya incluyen una columna
-- `venue_id` (uuid, nullable, sin uso todavía). Hoy no hay UI ni lógica de
-- sede — todo el piloto opera con `venue_id = null` — pero el día que haya
-- más de una sede, cada fila puede empezar a llevar su id sin migrar el
-- modelo de datos.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- dishes: catálogo de platos
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  venue_id uuid, -- reservado para multi-sede futura, sin uso en el piloto
  nombre text not null,
  tags text[] not null default '{}',
  familia text,
  dias_permitidos int[], -- 1=lunes..5=viernes, null/vacío = sin restricción
  frecuencia_especial text not null default 'ninguna'
    check (frecuencia_especial in ('ninguna', 'semana_por_medio', 'una_vez_al_mes')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists dishes_user_id_idx on public.dishes(user_id);

alter table public.dishes enable row level security;

create policy "dishes: dueño puede leer" on public.dishes
  for select using (auth.uid() = user_id);
create policy "dishes: dueño puede insertar" on public.dishes
  for insert with check (auth.uid() = user_id);
create policy "dishes: dueño puede actualizar" on public.dishes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dishes: dueño puede borrar" on public.dishes
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- weekly_plans: una fila por mes planificado
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  venue_id uuid, -- reservado para multi-sede futura
  mes date not null, -- primer día del mes
  estado text not null default 'borrador' check (estado in ('borrador', 'activo')),
  created_at timestamptz not null default now(),
  unique (user_id, mes)
);

alter table public.weekly_plans enable row level security;

create policy "weekly_plans: dueño puede leer" on public.weekly_plans
  for select using (auth.uid() = user_id);
create policy "weekly_plans: dueño puede insertar" on public.weekly_plans
  for insert with check (auth.uid() = user_id);
create policy "weekly_plans: dueño puede actualizar" on public.weekly_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weekly_plans: dueño puede borrar" on public.weekly_plans
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- daily_slots: una fila por día + opción de plato
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.daily_slots (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  fecha date not null,
  slot int not null check (slot in (1, 2)),
  dish_id uuid references public.dishes(id) on delete set null,
  es_manual boolean not null default false,
  platos_del_dia int not null default 1 check (platos_del_dia in (1, 2)),
  conflicto boolean not null default false,
  conflicto_detalle text,
  created_at timestamptz not null default now(),
  unique (weekly_plan_id, fecha, slot)
);

create index if not exists daily_slots_plan_idx on public.daily_slots(weekly_plan_id);
create index if not exists daily_slots_fecha_idx on public.daily_slots(fecha);

alter table public.daily_slots enable row level security;

-- daily_slots no tiene user_id propio: la seguridad se resuelve vía el
-- weekly_plan al que pertenece.
create policy "daily_slots: dueño puede leer" on public.daily_slots
  for select using (
    exists (select 1 from public.weekly_plans wp
            where wp.id = weekly_plan_id and wp.user_id = auth.uid())
  );
create policy "daily_slots: dueño puede insertar" on public.daily_slots
  for insert with check (
    exists (select 1 from public.weekly_plans wp
            where wp.id = weekly_plan_id and wp.user_id = auth.uid())
  );
create policy "daily_slots: dueño puede actualizar" on public.daily_slots
  for update using (
    exists (select 1 from public.weekly_plans wp
            where wp.id = weekly_plan_id and wp.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.weekly_plans wp
            where wp.id = weekly_plan_id and wp.user_id = auth.uid())
  );
create policy "daily_slots: dueño puede borrar" on public.daily_slots
  for delete using (
    exists (select 1 from public.weekly_plans wp
            where wp.id = weekly_plan_id and wp.user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- randomization_rules: reglas editables/activables
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.randomization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  venue_id uuid, -- reservado para multi-sede futura
  tipo text not null check (tipo in (
    'no_repetir_semana_siguiente',
    'no_repetir_proteina_semana_siguiente',
    'distancia_minima_acompanamiento',
    'preferencia_dia_semana_distinto',
    'frecuencia_especial',
    'dias_permitidos',
    'restriccion_por_palabra',
    'mismo_tipo_no_repite_dia_semana',
    'composicion_semanal_minima'
  )),
  parametros jsonb not null default '{}'::jsonb,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists randomization_rules_user_id_idx on public.randomization_rules(user_id);

alter table public.randomization_rules enable row level security;

create policy "randomization_rules: dueño puede leer" on public.randomization_rules
  for select using (auth.uid() = user_id);
create policy "randomization_rules: dueño puede insertar" on public.randomization_rules
  for insert with check (auth.uid() = user_id);
create policy "randomization_rules: dueño puede actualizar" on public.randomization_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "randomization_rules: dueño puede borrar" on public.randomization_rules
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- rule_exceptions: pausar una regla para una semana puntual
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.rule_exceptions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.randomization_rules(id) on delete cascade,
  semana_inicio date not null, -- lunes de la semana exceptuada
  motivo text,
  created_at timestamptz not null default now(),
  unique (rule_id, semana_inicio)
);

create index if not exists rule_exceptions_rule_idx on public.rule_exceptions(rule_id);

alter table public.rule_exceptions enable row level security;

create policy "rule_exceptions: dueño puede leer" on public.rule_exceptions
  for select using (
    exists (select 1 from public.randomization_rules r
            where r.id = rule_id and r.user_id = auth.uid())
  );
create policy "rule_exceptions: dueño puede insertar" on public.rule_exceptions
  for insert with check (
    exists (select 1 from public.randomization_rules r
            where r.id = rule_id and r.user_id = auth.uid())
  );
create policy "rule_exceptions: dueño puede borrar" on public.rule_exceptions
  for delete using (
    exists (select 1 from public.randomization_rules r
            where r.id = rule_id and r.user_id = auth.uid())
  );
