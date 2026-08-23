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
import { reglasVigentes, violacionesDuras, type Asignacion } from "../lib/ruleEngine";
import type { RuleException } from "../types/database";

export function Minuta() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const { dishes, cargando: cargandoDishes } = useDishes();
  const { rules, exceptions, cargando: cargandoRules } = useRules();
  const {
    plan,
    slots,
    cargando: cargandoPlan,
    aleatorizando,
    setPlatosDelDia,
    setSlotDish,
    limpiarManual,
    aleatorizar,
  } = useWeeklyPlan(anio, mes);

  const cargando = cargandoDishes || cargandoRules || cargandoPlan;

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
      "Esto regenerará todos los slots no editados manualmente. Los slots marcados como manuales no se tocarán. ¿Continuar?",
    );
    if (!confirmado) return;
    await aleatorizar(dishes, rules, exceptions);
  }

  function handleExportar() {
    const filas = semanas.flatMap((semana) =>
      semana.dias.map((dia) => {
        const fecha = formatFecha(dia);
        const s1 = slots.find((s) => s.fecha === fecha && s.slot === 1);
        const s2 = slots.find((s) => s.fecha === fecha && s.slot === 2);
        return {
          fecha,
          diaSemana: diaSemanaISO(dia),
          opcion1: s1?.dish_id ? dishesById.get(s1.dish_id)?.nombre ?? "" : "",
          opcion2: s2?.dish_id ? dishesById.get(s2.dish_id)?.nombre ?? "" : "",
        };
      }),
    );
    exportarMinutaExcel(mesLabel(anio, mes), filas);
  }

  if (cargando || !plan) return <PantallaCargando />;

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
                    onSetSlotDish={(slot, dishId) => setSlotDish(fecha, slot, dishId)}
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

  const historialCompleto: Asignacion[] = [];
  for (const s of slots) {
    if (!s.dish_id) continue;
    const dish = dishesById.get(s.dish_id);
    const semanaIndice = semanaIndicePorFecha.get(s.fecha);
    if (!dish || semanaIndice === undefined) continue;
    historialCompleto.push({
      fecha: s.fecha,
      diaSemana: diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`)),
      semanaIndice,
      slot: s.slot,
      dish,
      esManual: s.es_manual,
    });
  }

  const resultado = new Map<string, string[]>();
  for (const s of slots) {
    if (!s.dish_id) continue;
    const dish = dishesById.get(s.dish_id);
    const semanaIndice = semanaIndicePorFecha.get(s.fecha);
    const lunesISO = lunesPorFecha.get(s.fecha);
    if (!dish || semanaIndice === undefined || !lunesISO) continue;

    const historialSinEste = historialCompleto.filter((h) => !(h.fecha === s.fecha && h.slot === s.slot));
    const reglasHoy = reglasVigentes(rules, excMap, lunesISO);
    const violaciones = violacionesDuras(
      dish,
      { fecha: s.fecha, diaSemana: diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`)), semanaIndice },
      historialSinEste,
      reglasHoy,
    );
    if (violaciones.length > 0) resultado.set(`${s.fecha}#${s.slot}`, violaciones.map((v) => v.detalle));
  }

  return resultado;
}
