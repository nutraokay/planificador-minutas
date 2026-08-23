// Tipos que reflejan el esquema de supabase/schema.sql.
// `venue_id` existe en las tablas por si en el futuro hay multi-sede, pero
// no se usa ni se muestra en esta fase (piloto de 1 sede).

export type FrecuenciaEspecial = "ninguna" | "semana_por_medio" | "una_vez_al_mes";

export interface Dish {
  id: string;
  user_id: string;
  venue_id: string | null;
  nombre: string;
  tags: string[];
  familia: string | null;
  dias_permitidos: number[] | null; // 1=lunes … 5=viernes
  frecuencia_especial: FrecuenciaEspecial;
  activo: boolean;
  created_at: string;
}

export type DishInput = Omit<Dish, "id" | "user_id" | "venue_id" | "created_at">;

export type RuleType =
  | "no_repetir_semana_siguiente"
  | "no_repetir_proteina_semana_siguiente"
  | "distancia_minima_acompanamiento"
  | "preferencia_dia_semana_distinto"
  | "frecuencia_especial"
  | "dias_permitidos"
  | "restriccion_por_palabra"
  | "mismo_tipo_no_repite_dia_semana"
  | "composicion_semanal_minima";

export interface RandomizationRule {
  id: string;
  user_id: string;
  venue_id: string | null;
  tipo: RuleType;
  parametros: Record<string, unknown>;
  activa: boolean;
  created_at: string;
}

export interface RuleException {
  id: string;
  rule_id: string;
  semana_inicio: string; // date ISO — lunes de la semana exceptuada
  motivo: string | null;
  created_at: string;
}

export type EstadoPlan = "borrador" | "activo";

export interface WeeklyPlan {
  id: string;
  user_id: string;
  venue_id: string | null;
  mes: string; // date ISO, primer día del mes
  estado: EstadoPlan;
  created_at: string;
}

export interface DailySlot {
  id: string;
  weekly_plan_id: string;
  fecha: string; // date ISO
  slot: 1 | 2;
  dish_id: string | null;
  es_manual: boolean;
  platos_del_dia: 1 | 2;
  conflicto: boolean;
  conflicto_detalle: string | null;
  created_at: string;
}
