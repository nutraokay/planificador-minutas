import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { RandomizationRule, RuleException, RuleType } from "../types/database";
import { useAuth } from "../context/AuthContext";

/** Set de reglas por defecto para una cuenta nueva — reproduce el comportamiento
 * descrito en la especificación (legumbre/pescado mínimo 1 vez, pollo no
 * repite día de semana, etc). El usuario puede editarlas o desactivarlas
 * libremente después. */
const REGLAS_SEED: { tipo: RuleType; parametros: Record<string, unknown>; activa: boolean }[] = [
  { tipo: "no_repetir_semana_siguiente", parametros: {}, activa: true },
  { tipo: "no_repetir_proteina_semana_siguiente", parametros: {}, activa: true },
  { tipo: "distancia_minima_acompanamiento", parametros: { dias: 1 }, activa: true },
  { tipo: "preferencia_dia_semana_distinto", parametros: {}, activa: true },
  { tipo: "frecuencia_especial", parametros: {}, activa: true },
  { tipo: "dias_permitidos", parametros: {}, activa: true },
  { tipo: "mismo_tipo_no_repite_dia_semana", parametros: { tag: "proteina:pollo" }, activa: true },
  { tipo: "composicion_semanal_minima", parametros: { tag: "legumbre", minimo: 1 }, activa: true },
  { tipo: "composicion_semanal_minima", parametros: { tag: "pescado", minimo: 1 }, activa: true },
  { tipo: "restriccion_por_palabra", parametros: { palabra: "cerdo", dias_permitidos: [3, 4, 5] }, activa: false },
];

export function useRules() {
  const { user } = useAuth();
  const [rules, setRules] = useState<RandomizationRule[]>([]);
  const [exceptions, setExceptions] = useState<RuleException[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    const { data: reglas, error: err1 } = await supabase
      .from("randomization_rules")
      .select("*")
      .order("created_at", { ascending: true });

    if (err1) {
      setError(err1.message);
      setCargando(false);
      return;
    }

    let reglasFinal = reglas as RandomizationRule[];
    if (reglasFinal.length === 0) {
      const filas = REGLAS_SEED.map((r) => ({ ...r, user_id: user.id }));
      const { data: insertadas, error: errSeed } = await supabase.from("randomization_rules").insert(filas).select("*");
      if (errSeed) setError(errSeed.message);
      else reglasFinal = insertadas as RandomizationRule[];
    }

    setRules(reglasFinal);

    const ids = reglasFinal.map((r) => r.id);
    if (ids.length > 0) {
      const { data: excs, error: err2 } = await supabase.from("rule_exceptions").select("*").in("rule_id", ids);
      if (err2) setError(err2.message);
      else setExceptions(excs as RuleException[]);
    } else {
      setExceptions([]);
    }

    setCargando(false);
  }, [user]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function actualizarRegla(id: string, cambios: Partial<Pick<RandomizationRule, "activa" | "parametros">>) {
    const { error } = await supabase.from("randomization_rules").update(cambios).eq("id", id);
    if (error) throw error;
    await recargar();
  }

  async function crearInstanciaRegla(tipo: RuleType, parametros: Record<string, unknown>) {
    if (!user) return;
    const { error } = await supabase.from("randomization_rules").insert({ tipo, parametros, activa: true, user_id: user.id });
    if (error) throw error;
    await recargar();
  }

  async function eliminarRegla(id: string) {
    const { error } = await supabase.from("randomization_rules").delete().eq("id", id);
    if (error) throw error;
    await recargar();
  }

  async function agregarExcepcion(ruleId: string, semanaInicio: string, motivo: string) {
    const { error } = await supabase
      .from("rule_exceptions")
      .insert({ rule_id: ruleId, semana_inicio: semanaInicio, motivo: motivo || null });
    if (error) throw error;
    await recargar();
  }

  async function eliminarExcepcion(id: string) {
    const { error } = await supabase.from("rule_exceptions").delete().eq("id", id);
    if (error) throw error;
    await recargar();
  }

  return {
    rules,
    exceptions,
    cargando,
    error,
    recargar,
    actualizarRegla,
    crearInstanciaRegla,
    eliminarRegla,
    agregarExcepcion,
    eliminarExcepcion,
  };
}
