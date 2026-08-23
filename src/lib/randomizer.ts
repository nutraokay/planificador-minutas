import type { DailySlot, Dish, RandomizationRule, RuleException } from "../types/database";
import { diaSemanaISO, formatFecha, getSemanasHabilesDelMes } from "./dateUtils";
import { ORDEN_RELAJACION, RULE_DEFS } from "./rules";
import {
  reglasVigentes,
  violacionesDuras,
  violaPreferenciaDiaSemana,
  type Asignacion,
  type SlotCtx,
} from "./ruleEngine";
import { esAcompanamiento, esPlatoDeFondo, esPlatoViernes, necesitaAcompanamiento, tieneTag } from "./text";

export interface SlotGenerado {
  fecha: string;
  slot: 1 | 2;
  dish_id: string | null;
  acompanamiento_id: string | null;
  es_manual: boolean;
  platos_del_dia: 1 | 2;
  conflicto: boolean;
  conflicto_detalle: string | null;
}

export interface GenerarMinutaInput {
  anio: number;
  mes: number; // 1-12
  dishes: Dish[];
  rules: RandomizationRule[];
  exceptions: RuleException[];
  slotsExistentes: DailySlot[];
}

function elegirAleatorio<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function excepcionesPorRegla(exceptions: RuleException[]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const ex of exceptions) {
    if (!mapa.has(ex.rule_id)) mapa.set(ex.rule_id, new Set());
    mapa.get(ex.rule_id)!.add(ex.semana_inicio);
  }
  return mapa;
}

/** Intenta elegir un candidato del pool respetando las reglas duras; si el
 * pool queda vacío, relaja reglas en orden (de más flexible a más rígida)
 * hasta encontrar algo. Devuelve el pool final de candidatos + si hubo que
 * relajar algo (y qué). */
function elegirConRelajacion(
  poolBase: Dish[],
  ctx: SlotCtx,
  historial: Asignacion[],
  reglasHoy: RandomizationRule[],
): { candidatos: Dish[]; conflicto: boolean; detalle: string | null } {
  let candidatos = poolBase.filter((d) => violacionesDuras(d, ctx, historial, reglasHoy).length === 0);

  const usaPreferencia = reglasHoy.some((r) => r.tipo === "preferencia_dia_semana_distinto");
  if (usaPreferencia && candidatos.length > 0) {
    const preferidos = candidatos.filter((d) => !violaPreferenciaDiaSemana(d, ctx, historial));
    if (preferidos.length > 0) candidatos = preferidos;
  }

  if (candidatos.length > 0) return { candidatos, conflicto: false, detalle: null };

  let reglasTrabajo = reglasHoy;
  const relajadas: string[] = [];
  for (const tipoRelajar of ORDEN_RELAJACION) {
    if (tipoRelajar === "preferencia_dia_semana_distinto") continue; // ya es blanda
    if (tipoRelajar === "composicion_semanal_minima") continue; // no es filtro por slot
    if (!reglasTrabajo.some((r) => r.tipo === tipoRelajar)) continue;
    reglasTrabajo = reglasTrabajo.filter((r) => r.tipo !== tipoRelajar);
    relajadas.push(RULE_DEFS[tipoRelajar].etiqueta);
    const intento = poolBase.filter((d) => violacionesDuras(d, ctx, historial, reglasTrabajo).length === 0);
    if (intento.length > 0) return { candidatos: intento, conflicto: true, detalle: `Generado relajando: ${relajadas.join(", ")}` };
  }

  return {
    candidatos: [],
    conflicto: true,
    detalle: poolBase.length === 0 ? "No hay platos activos disponibles en el catálogo" : "No se encontró ningún plato válido ni relajando todas las reglas",
  };
}

export function generarMinuta(input: GenerarMinutaInput): SlotGenerado[] {
  const { anio, mes, rules, exceptions, slotsExistentes } = input;
  const dishesActivos = input.dishes.filter((d) => d.activo);
  const dishesById = new Map(input.dishes.map((d) => [d.id, d]));
  const excMap = excepcionesPorRegla(exceptions);
  const semanas = getSemanasHabilesDelMes(anio, mes);

  // Config de slots por fecha: cuántos platos tiene el día. Se preserva lo
  // ya configurado/guardado; si no hay nada guardado, default 2 (lun-jue) / 1 (viernes).
  const configPorFecha = new Map<string, { platosDelDia: 1 | 2; existentes: Map<number, DailySlot> }>();
  for (const s of slotsExistentes) {
    if (!configPorFecha.has(s.fecha)) configPorFecha.set(s.fecha, { platosDelDia: s.platos_del_dia, existentes: new Map() });
    configPorFecha.get(s.fecha)!.existentes.set(s.slot, s);
  }

  // Historial: arranca con TODOS los slots manuales ya guardados (de todo el
  // mes, no solo lo ya "recorrido") — las reglas de repetición deben
  // considerarlos como contexto fijo. Cada slot manual aporta su plato de
  // fondo Y su acompañamiento (si tiene) como entradas separadas.
  const historial: Asignacion[] = [];
  for (const semana of semanas) {
    for (const dia of semana.dias) {
      const fecha = formatFecha(dia);
      const cfg = configPorFecha.get(fecha);
      if (!cfg) continue;
      for (const [slot, existente] of cfg.existentes) {
        if (!existente.es_manual) continue;
        const base: Omit<Asignacion, "dish"> = {
          fecha,
          diaSemana: diaSemanaISO(dia),
          semanaIndice: semana.indice,
          slot: slot as 1 | 2,
          esManual: true,
        };
        if (existente.dish_id) {
          const dish = dishesById.get(existente.dish_id);
          if (dish) historial.push({ ...base, dish });
        }
        if (existente.acompanamiento_id) {
          const acomp = dishesById.get(existente.acompanamiento_id);
          if (acomp) historial.push({ ...base, dish: acomp });
        }
      }
    }
  }

  const salida: SlotGenerado[] = [];

  for (const semana of semanas) {
    const lunesISO = formatFecha(semana.lunes);

    for (const dia of semana.dias) {
      const fecha = formatFecha(dia);
      const diaSemana = diaSemanaISO(dia);
      const esViernes = diaSemana === 5;
      const cfg = configPorFecha.get(fecha);
      const platosDelDia: 1 | 2 = esViernes ? 1 : cfg?.platosDelDia ?? 2;
      const ctx: SlotCtx = { fecha, diaSemana, semanaIndice: semana.indice };
      const reglasHoy = reglasVigentes(rules, excMap, lunesISO);

      // ── Paso 1: elegir el plato de fondo de cada slot del día ──────────
      // Opción 1 y Opción 2 son siempre "platos de fondo" (proteína,
      // legumbre o plato completo) — nunca un acompañamiento suelto. El
      // viernes elige solo del pool plato_viernes; el resto de la semana
      // usa el catálogo completo (un plato marcado plato_viernes puede
      // seguir sirviendo otros días si también cabe ahí).
      const fondosDelDia = new Map<1 | 2, Dish | null>();
      const conflictosFondo = new Map<1 | 2, { conflicto: boolean; detalle: string | null }>();
      const slotsManuales = new Map<1 | 2, DailySlot>();
      let acompanamientoDelDia: Dish | null = null;

      for (let slot = 1 as 1 | 2; slot <= platosDelDia; slot = (slot + 1) as 1 | 2) {
        const existente = cfg?.existentes.get(slot);

        if (existente?.es_manual) {
          slotsManuales.set(slot, existente);
          fondosDelDia.set(slot, existente.dish_id ? dishesById.get(existente.dish_id) ?? null : null);
          if (existente.acompanamiento_id && !acompanamientoDelDia) {
            acompanamientoDelDia = dishesById.get(existente.acompanamiento_id) ?? null;
          }
          continue;
        }

        let poolBase = dishesActivos.filter((d) => esPlatoDeFondo(d.tags));
        if (esViernes) poolBase = poolBase.filter((d) => esPlatoViernes(d.tags));

        const { candidatos, conflicto, detalle } = elegirConRelajacion(poolBase, ctx, historial, reglasHoy);
        const dish = candidatos.length > 0 ? elegirAleatorio(candidatos) : null;
        if (dish) historial.push({ fecha, diaSemana, semanaIndice: semana.indice, slot, dish, esManual: false });

        fondosDelDia.set(slot, dish);
        conflictosFondo.set(slot, {
          conflicto,
          detalle: detalle ?? (esViernes && poolBase.length === 0 ? "No hay platos activos con tag plato_viernes en el catálogo" : detalle),
        });
      }

      // ── Paso 2: acompañamiento compartido del día (si algún plato de
      // fondo lo necesita y todavía no hay uno fijado manualmente) ───────
      const slotsQueNecesitan: (1 | 2)[] = [];
      for (const [slot, dish] of fondosDelDia) {
        if (dish && !esViernes && necesitaAcompanamiento(dish.tags)) slotsQueNecesitan.push(slot);
      }

      let conflictoAcomp = false;
      let detalleAcomp: string | null = null;

      if (slotsQueNecesitan.length > 0 && !acompanamientoDelDia) {
        const poolAcomp = dishesActivos.filter((d) => esAcompanamiento(d.tags));
        const resultado = elegirConRelajacion(poolAcomp, ctx, historial, reglasHoy);
        acompanamientoDelDia = resultado.candidatos.length > 0 ? elegirAleatorio(resultado.candidatos) : null;
        conflictoAcomp = resultado.conflicto || !acompanamientoDelDia;
        detalleAcomp =
          resultado.detalle ?? (!acompanamientoDelDia && poolAcomp.length === 0 ? "No hay acompañamientos activos en el catálogo" : null);

        if (acompanamientoDelDia) {
          for (const slot of slotsQueNecesitan) {
            if (slotsManuales.has(slot)) continue; // no tocar slots manuales
            historial.push({ fecha, diaSemana, semanaIndice: semana.indice, slot, dish: acompanamientoDelDia, esManual: false });
          }
        }
      }

      // ── Paso 3: armar la salida del día ─────────────────────────────
      for (let slot = 1 as 1 | 2; slot <= platosDelDia; slot = (slot + 1) as 1 | 2) {
        const manual = slotsManuales.get(slot);
        if (manual) {
          salida.push({
            fecha,
            slot,
            dish_id: manual.dish_id,
            acompanamiento_id: manual.acompanamiento_id,
            es_manual: true,
            platos_del_dia: platosDelDia,
            conflicto: manual.conflicto,
            conflicto_detalle: manual.conflicto_detalle,
          });
          continue;
        }

        const dish = fondosDelDia.get(slot) ?? null;
        const necesita = !!dish && !esViernes && necesitaAcompanamiento(dish.tags);
        const acompId = necesita ? acompanamientoDelDia?.id ?? null : null;

        const { conflicto: conflictoFondo, detalle: detalleFondo } = conflictosFondo.get(slot) ?? { conflicto: false, detalle: null };
        const conflicto = conflictoFondo || (necesita && conflictoAcomp);
        const detalle = [detalleFondo, necesita ? detalleAcomp : null].filter(Boolean).join(" | ") || null;

        salida.push({
          fecha,
          slot,
          dish_id: dish?.id ?? null,
          acompanamiento_id: acompId,
          es_manual: false,
          platos_del_dia: platosDelDia,
          conflicto,
          conflicto_detalle: detalle,
        });
      }
    }
  }

  // Post-pass: intenta cumplir composicion_semanal_minima por semana,
  // recolocando un slot no-manual compatible cuando falta cobertura.
  const reglasComposicion = rules.filter((r) => r.tipo === "composicion_semanal_minima" && r.activa);
  if (reglasComposicion.length > 0) {
    for (const semana of semanas) {
      const lunesISO = formatFecha(semana.lunes);
      if (!reglasVigentes(reglasComposicion, excMap, lunesISO).length) continue;

      const fechasSemana = new Set(semana.dias.map(formatFecha));
      const indicesSemana = salida.reduce<number[]>((acc, s, i) => {
        if (fechasSemana.has(s.fecha)) acc.push(i);
        return acc;
      }, []);

      for (const regla of reglasVigentes(reglasComposicion, excMap, lunesISO)) {
        const tag = (regla.parametros as any).tag as string;
        const minimo = Number((regla.parametros as any).minimo) || 1;
        if (!tag) continue;

        const cumpleTag = (dishId: string | null) => {
          if (!dishId) return false;
          const d = dishesById.get(dishId);
          return d ? tieneTag(d.tags, tag) : false;
        };

        let actuales = indicesSemana.filter((i) => cumpleTag(salida[i].dish_id)).length;
        if (actuales >= minimo) continue;

        for (const i of indicesSemana) {
          if (actuales >= minimo) break;
          const s = salida[i];
          if (s.es_manual) continue;
          if (cumpleTag(s.dish_id)) continue;

          const diaSemana = diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`));
          const esViernes = diaSemana === 5;
          let poolBase = dishesActivos.filter((d) => tieneTag(d.tags, tag) && esPlatoDeFondo(d.tags));
          if (esViernes) poolBase = poolBase.filter((d) => esPlatoViernes(d.tags));

          const ctx: SlotCtx = { fecha: s.fecha, diaSemana, semanaIndice: semana.indice };
          const reglasHoy = reglasVigentes(rules, excMap, lunesISO).filter((r) => r.tipo !== "composicion_semanal_minima");
          const historialSinEsteSlot = historial.filter((h) => !(h.fecha === s.fecha && h.slot === s.slot));
          const candidatos = poolBase.filter((d) => violacionesDuras(d, ctx, historialSinEsteSlot, reglasHoy).length === 0);

          if (candidatos.length > 0) {
            const nuevoDish = elegirAleatorio(candidatos);
            s.dish_id = nuevoDish.id;

            // Ajusta el acompañamiento de este slot al nuevo plato: si ya
            // no lo necesita (plato completo/legumbre), se quita; si lo
            // necesita y no tenía uno, intenta reusar el del otro slot del
            // mismo día (para mantener "mismo acompañamiento del día").
            if (!esViernes && necesitaAcompanamiento(nuevoDish.tags)) {
              if (!s.acompanamiento_id) {
                const otroDelDia = salida.find((o) => o.fecha === s.fecha && o !== s && o.acompanamiento_id);
                if (otroDelDia) s.acompanamiento_id = otroDelDia.acompanamiento_id;
              }
            } else {
              s.acompanamiento_id = null;
            }

            const hIdx = historial.findIndex((h) => h.fecha === s.fecha && h.slot === s.slot && h.dish.id !== s.acompanamiento_id);
            if (hIdx >= 0) historial[hIdx] = { ...historial[hIdx], dish: nuevoDish };
            else historial.push({ fecha: s.fecha, diaSemana, semanaIndice: semana.indice, slot: s.slot, dish: nuevoDish, esManual: false });
            actuales += 1;
          }
        }
        // Si tras intentar recolocar sigue sin cumplirse, no se fuerza más:
        // el panel de Verificación lo mostrará como incumplimiento real.
      }
    }
  }

  return salida;
}
