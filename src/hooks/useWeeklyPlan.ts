import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { DailySlot, Dish, RandomizationRule, RuleException, WeeklyPlan } from "../types/database";
import { useAuth } from "../context/AuthContext";
import { diaSemanaISO, formatFecha, getSemanasHabilesDelMes } from "../lib/dateUtils";
import { generarMinuta } from "../lib/randomizer";

const DEFAULT_PLATOS_DIA = 2;

export function useWeeklyPlan(anio: number, mes: number) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [slots, setSlots] = useState<DailySlot[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aleatorizando, setAleatorizando] = useState(false);

  const mesISO = `${anio}-${String(mes).padStart(2, "0")}-01`;

  const cargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    setError(null);

    let { data: planData, error: errPlan } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("mes", mesISO)
      .maybeSingle();

    if (errPlan) {
      setError(errPlan.message);
      setCargando(false);
      return;
    }

    if (!planData) {
      const { data: nuevo, error: errCrear } = await supabase
        .from("weekly_plans")
        .insert({ mes: mesISO, user_id: user.id, estado: "borrador" })
        .select("*")
        .single();
      if (errCrear) {
        setError(errCrear.message);
        setCargando(false);
        return;
      }
      planData = nuevo;
    }

    setPlan(planData as WeeklyPlan);

    const { data: slotsData, error: errSlots } = await supabase
      .from("daily_slots")
      .select("*")
      .eq("weekly_plan_id", planData!.id)
      .order("fecha", { ascending: true })
      .order("slot", { ascending: true });

    if (errSlots) {
      setError(errSlots.message);
      setCargando(false);
      return;
    }

    let slotsFinal = slotsData as DailySlot[];

    // Asegura que exista al menos el slot 1 (y slot 2 si corresponde por
    // default) para cada día hábil del mes — para meses recién abiertos.
    const semanas = getSemanasHabilesDelMes(anio, mes);
    const existentes = new Set(slotsFinal.map((s) => `${s.fecha}#${s.slot}`));
    const faltantes: Partial<DailySlot>[] = [];

    for (const semana of semanas) {
      for (const dia of semana.dias) {
        const fecha = formatFecha(dia);
        const esViernes = diaSemanaISO(dia) === 5;
        const platosDelDia = esViernes ? 1 : DEFAULT_PLATOS_DIA;

        if (!existentes.has(`${fecha}#1`)) {
          faltantes.push({ weekly_plan_id: planData!.id, fecha, slot: 1, platos_del_dia: platosDelDia, es_manual: false });
        }
        if (platosDelDia === 2 && !existentes.has(`${fecha}#2`)) {
          faltantes.push({ weekly_plan_id: planData!.id, fecha, slot: 2, platos_del_dia: platosDelDia, es_manual: false });
        }
      }
    }

    if (faltantes.length > 0) {
      const { data: creados, error: errCreados } = await supabase.from("daily_slots").insert(faltantes).select("*");
      if (errCreados) setError(errCreados.message);
      else slotsFinal = [...slotsFinal, ...(creados as DailySlot[])];
    }

    slotsFinal.sort((a, b) => (a.fecha === b.fecha ? a.slot - b.slot : a.fecha.localeCompare(b.fecha)));
    setSlots(slotsFinal);
    setCargando(false);
  }, [user, mesISO, anio, mes]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  /** Cambia cuántos platos tiene un día (1 o 2). El viernes no se puede tocar. */
  async function setPlatosDelDia(fecha: string, cantidad: 1 | 2) {
    if (!plan) return;
    const slot1 = slots.find((s) => s.fecha === fecha && s.slot === 1);
    const slot2 = slots.find((s) => s.fecha === fecha && s.slot === 2);

    if (slot1) await supabase.from("daily_slots").update({ platos_del_dia: cantidad }).eq("id", slot1.id);

    if (cantidad === 2 && !slot2) {
      await supabase.from("daily_slots").insert({ weekly_plan_id: plan.id, fecha, slot: 2, platos_del_dia: 2, es_manual: false });
    } else if (cantidad === 1 && slot2) {
      await supabase.from("daily_slots").delete().eq("id", slot2.id);
    } else if (slot2) {
      await supabase.from("daily_slots").update({ platos_del_dia: cantidad }).eq("id", slot2.id);
    }

    await cargar();
  }

  /** Edición manual de un slot: fija el plato y lo marca como es_manual. `dishId` null limpia el plato. */
  async function setSlotDish(fecha: string, slot: 1 | 2, dishId: string | null) {
    const s = slots.find((s) => s.fecha === fecha && s.slot === slot);
    if (!s) return;
    await supabase
      .from("daily_slots")
      .update({ dish_id: dishId, es_manual: true, conflicto: false, conflicto_detalle: null })
      .eq("id", s.id);
    await cargar();
  }

  /** Quita la marca manual de un slot para que vuelva a quedar disponible para la próxima aleatorización. */
  async function limpiarManual(fecha: string, slot: 1 | 2) {
    const s = slots.find((s) => s.fecha === fecha && s.slot === slot);
    if (!s) return;
    await supabase.from("daily_slots").update({ es_manual: false }).eq("id", s.id);
    await cargar();
  }

  async function aleatorizar(dishes: Dish[], rules: RandomizationRule[], exceptions: RuleException[]) {
    if (!plan) return;
    setAleatorizando(true);
    try {
      const generados = generarMinuta({ anio, mes, dishes, rules, exceptions, slotsExistentes: slots });

      const filas = generados.map((g) => {
        const existente = slots.find((s) => s.fecha === g.fecha && s.slot === g.slot);
        return {
          id: existente?.id,
          weekly_plan_id: plan.id,
          fecha: g.fecha,
          slot: g.slot,
          dish_id: g.dish_id,
          es_manual: g.es_manual,
          platos_del_dia: g.platos_del_dia,
          conflicto: g.conflicto,
          conflicto_detalle: g.conflicto_detalle,
        };
      });

      const { error } = await supabase.from("daily_slots").upsert(filas, { onConflict: "id" });
      if (error) throw error;
      await cargar();
    } finally {
      setAleatorizando(false);
    }
  }

  return { plan, slots, cargando, error, aleatorizando, recargar: cargar, setPlatosDelDia, setSlotDish, limpiarManual, aleatorizar };
}
