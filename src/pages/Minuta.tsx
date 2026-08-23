import { useMemo, useState } from "react";
import { useDishes } from "../hooks/useDishes";
import { useRules } from "../hooks/useRules";
import { useWeeklyPlan } from "../hooks/useWeeklyPlan";
import { PantallaCargando } from "../components/PantallaCargando";
import { DiaCard } from "../components/DiaCard";
import { VerificationPanel } from "../components/VerificationPanel";
import { diaSemanaISO, formatFecha, getSemanasHabilesDelMes, mesLabel, sumarMes } from "../lib/dateUtils";
import { exportarMinutaExcel } from "../lib/excel";
import { verificarMinuta } from "../lib/verification";
import { expandirSlotsAHistorial, reglasVigentes, violacionesDuras } from "../lib/ruleEngine";
import { necesitaAcompanamiento } from "../lib/text";
import type { Dish, RuleException } from "../types/database";

export function Minuta() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const { dishes, cargando: cargandoDishes, error: errorDishes } = useDishes();
  const { rules, exceptions, cargando: cargandoRules, error: errorRules } = useRules();
  const {
    plan,
    slots,
    cargando: cargandoPlan,
    error: errorPlan,
    aleatorizando,
    setPlatosDelDia,
    setSlotDish,
    setAcompanamientoDia,
    limpiarManual,
    aleatorizar,
  } = useWeeklyPlan(anio, mes);

  const cargando = cargandoDishes || cargandoRules || cargandoPlan;
  const error = errorDishes || errorRules || errorPlan;

  const semanas = useMemo(() => getSemanasHabilesDelMes(anio, mes), [anio, mes]);
  const dishesById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  const resultadosVerificacion = useMemo(
    () => verificarMinuta({ anio, mes, dishes, rules, exceptions, slots }),
    [anio, mes, dishes, rules, exceptions, slots],
  );

  const advertenciasPorSlot = useMemo(
    () => calcularAdvertencias(anio, mes, semanas, slots, dishesById, rules, exceptions),
    [anio, mes, semanas, slots, dishesById, rules, exceptions],
  );

  function cambiarMes(delta: number) {
    const { anio: a, mes: m } = sumarMes(anio, mes, delta);
    setAnio(a);
    setMes(m);
  }

  async function handleAleatorizar() {
    const confirmado = window.confirm(
      "Esto va a regenerar TODA la minuta del mes, incluyendo lo que hayas editado a mano. ¿Continuar?",
    );
    if (!confirmado) return;
    await aleatorizar(dishes, rules, exceptions);
  }

  function nombreCombinado(s: (typeof slots)[number] | undefined): string {
    if (!s?.dish_id) return "";
    const dish = dishesById.get(s.dish_id);
    if (!dish) return "";
    const acomp = s.acompanamiento_id && necesitaAcompanamiento(dish.tags) ? dishesById.get(s.acompanamiento_id) : undefined;
    return acomp ? `${dish.nombre} con ${acomp.nombre}` : dish.nombre;
  }

  function handleExportar() {
    const semanasExport = semanas.map((semana) => ({
      indice: semana.indice,
      dias: semana.dias.map((dia) => {
        const fecha = formatFecha(dia);
        const s1 = slots.find((s) => s.fecha === fecha && s.slot === 1);
        const s2 = slots.find((s) => s.fecha === fecha && s.slot === 2);
        return {
          fecha,
          diaSemana: diaSemanaISO(dia),
          opcion1: nombreCombinado(s1),
          opcion2: nombreCombinado(s2),
        };
      }),
    }));
    exportarMinutaExcel(mesLabel(anio, mes), semanasExport);
  }

  if (cargando) return <PantallaCargando />;

  if (error || !plan) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-xl border border-fucsia-200 bg-fucsia-50 p-5 text-sm text-fucsia-800">
          <p className="font-semibold">No se pudo cargar la minuta del mes.</p>
          <p className="mt-2">
            {error ?? "No se encontró ni se pudo crear el plan mensual. Revisa que las tablas de Supabase estén creadas correctamente."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => cambiarMes(-1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50">
            ←
          </button>
          <h1 className="w-40 text-center text-lg font-semibold capitalize text-slate-900">{mesLabel(anio, mes)}</h1>
          <button onClick={() => cambiarMes(1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50">
            →
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleAleatorizar}
            disabled={aleatorizando}
            className="rounded-lg bg-fucsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fucsia-700 disabled:opacity-60"
          >
            {aleatorizando ? "Aleatorizando…" : "Aleatorizar mes"}
          </button>
          <button
            onClick={handleExportar}
            className="rounded-lg border border-verde-200 bg-white px-4 py-2 text-sm font-semibold text-verde-700 hover:bg-verde-50"
          >
            Exportar a Excel
          </button>
        </div>
      </div>

      {dishes.length === 0 && (
        <p className="rounded-lg bg-fucsia-50 px-3 py-2 text-sm text-fucsia-700">
          Tu catálogo de platos está vacío — importa platos desde la sección "Catálogo de platos" antes de aleatorizar.
        </p>
      )}

      <div className="space-y-5">
        {semanas.map((semana) => (
          <div key={semana.indice}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Semana {semana.indice}</h2>
            <div className="flex flex-wrap gap-3">
              {semana.dias.map((dia) => {
                const fecha = formatFecha(dia);
                const diaSemana = diaSemanaISO(dia);
                const esViernes = diaSemana === 5;
                const slot1 = slots.find((s) => s.fecha === fecha && s.slot === 1);
                const slot2 = slots.find((s) => s.fecha === fecha && s.slot === 2);
                return (
                  <DiaCard
                    key={fecha}
                    fecha={fecha}
                    diaSemana={diaSemana}
                    esViernes={esViernes}
                    slot1={slot1}
                    slot2={slot2}
                    dishes={dishes}
                    dishesById={dishesById}
                    advertencias={{
                      1: advertenciasPorSlot.get(`${fecha}#1`) ?? [],
                      2: advertenciasPorSlot.get(`${fecha}#2`) ?? [],
                    }}
                    onSetPlatosDelDia={(cantidad) => setPlatosDelDia(fecha, cantidad)}
                    onSetSlotDish={(slot, dishId) => {
                      const nuevoDish = dishId ? dishesById.get(dishId) : null;
                      const yaNoNecesitaAcomp = !!dishId && (!nuevoDish || !necesitaAcompanamiento(nuevoDish.tags));
                      setSlotDish(fecha, slot, dishId, yaNoNecesitaAcomp);
                    }}
                    onSetAcompanamientoDia={(acompId) => setAcompanamientoDia(fecha, acompId)}
                    onLimpiarManual={(slot) => limpiarManual(fecha, slot)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <VerificationPanel resultados={resultadosVerificacion} />
    </div>
  );
}

/** Calcula, para cada slot con plato asignado, las reglas activas que ese
 * plato viola dado el resto de la minuta — se usa para la advertencia visual
 * en el selector manual (no bloquea guardar, solo informa). */
function calcularAdvertencias(
  anio: number,
  mes: number,
  semanas: ReturnType<typeof getSemanasHabilesDelMes>,
  slots: ReturnType<typeof useWeeklyPlan>["slots"],
  dishesById: Map<string, ReturnType<typeof useDishes>["dishes"][number]>,
  rules: ReturnType<typeof useRules>["rules"],
  exceptions: RuleException[],
): Map<string, string[]> {
  void anio;
  void mes;
  const excMap = new Map<string, Set<string>>();
  for (const ex of exceptions) {
    if (!excMap.has(ex.rule_id)) excMap.set(ex.rule_id, new Set());
    excMap.get(ex.rule_id)!.add(ex.semana_inicio);
  }

  const semanaIndicePorFecha = new Map<string, number>();
  const lunesPorFecha = new Map<string, string>();
  for (const semana of semanas) {
    const lunesISO = formatFecha(semana.lunes);
    for (const dia of semana.dias) {
      semanaIndicePorFecha.set(formatFecha(dia), semana.indice);
      lunesPorFecha.set(formatFecha(dia), lunesISO);
    }
  }

  const historialCompleto = expandirSlotsAHistorial(slots, dishesById, semanaIndicePorFecha);

  const resultado = new Map<string, string[]>();
  for (const s of slots) {
    const semanaIndice = semanaIndicePorFecha.get(s.fecha);
    const lunesISO = lunesPorFecha.get(s.fecha);
    if (semanaIndice === undefined || !lunesISO) continue;
    const reglasHoy = reglasVigentes(rules, excMap, lunesISO);
    const ctx = { fecha: s.fecha, diaSemana: diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`)), semanaIndice };

    const platos: Dish[] = [];
    if (s.dish_id) {
      const d = dishesById.get(s.dish_id);
      if (d) platos.push(d);
    }
    if (s.acompanamiento_id) {
      const a = dishesById.get(s.acompanamiento_id);
      if (a) platos.push(a);
    }
    if (platos.length === 0) continue;

    const historialSinEste = historialCompleto.filter((h) => !(h.fecha === s.fecha && h.slot === s.slot));
    const violaciones = platos.flatMap((d) => violacionesDuras(d, ctx, historialSinEste, reglasHoy));
    if (violaciones.length > 0) resultado.set(`${s.fecha}#${s.slot}`, violaciones.map((v) => v.detalle));
  }

  return resultado;
}
