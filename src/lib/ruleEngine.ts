import type { DailySlot, Dish, RandomizationRule, RuleType } from "../types/database";
import { diaSemanaISO } from "./dateUtils";
import { esAcompanamiento, normalizar, paridadEstable, tagsProteina, tieneTag } from "./text";

export interface SlotCtx {
  fecha: string;
  diaSemana: number; // 1..5
  semanaIndice: number; // 1-based dentro del plan
}

export interface Asignacion extends SlotCtx {
  slot: 1 | 2;
  dish: Dish;
  esManual: boolean;
}

export interface Violacion {
  tipo: RuleType;
  detalle: string;
}

/** Tipos de regla que se evalúan como filtro duro candidato-por-candidato. */
const TIPOS_FILTRO_DURO: RuleType[] = [
  "dias_permitidos",
  "restriccion_por_palabra",
  "frecuencia_especial",
  "no_repetir_semana_siguiente",
  "no_repetir_proteina_semana_siguiente",
  "distancia_minima_acompanamiento",
  "mismo_tipo_no_repite_dia_semana",
];

function mismaOSemanaAnterior(a: Asignacion, semanaIndice: number): boolean {
  return a.semanaIndice === semanaIndice || a.semanaIndice === semanaIndice - 1;
}

/**
 * Evalúa un plato candidato contra el subconjunto de reglas "duras" pasado
 * en `reglas` (ya filtrado por activas y sin excepción para la semana
 * actual por el llamador). Devuelve la lista de violaciones encontradas.
 */
export function violacionesDuras(
  dish: Dish,
  ctx: SlotCtx,
  historial: Asignacion[],
  reglas: RandomizationRule[],
): Violacion[] {
  const violaciones: Violacion[] = [];

  for (const regla of reglas) {
    if (!TIPOS_FILTRO_DURO.includes(regla.tipo)) continue;
    const p = regla.parametros as Record<string, any>;

    switch (regla.tipo) {
      case "dias_permitidos": {
        const dias = dish.dias_permitidos;
        if (dias && dias.length > 0 && !dias.includes(ctx.diaSemana)) {
          violaciones.push({
            tipo: regla.tipo,
            detalle: `"${dish.nombre}" solo permitido días ${dias.join(",")}`,
          });
        }
        break;
      }

      case "restriccion_por_palabra": {
        const palabra = (p.palabra as string) || "";
        const diasPermitidos = (p.dias_permitidos as number[]) || [];
        if (palabra && normalizar(dish.nombre).includes(normalizar(palabra))) {
          if (diasPermitidos.length > 0 && !diasPermitidos.includes(ctx.diaSemana)) {
            violaciones.push({
              tipo: regla.tipo,
              detalle: `"${dish.nombre}" contiene "${palabra}", solo permitido días ${diasPermitidos.join(",")}`,
            });
          }
        }
        break;
      }

      case "frecuencia_especial": {
        if (dish.frecuencia_especial === "una_vez_al_mes") {
          if (historial.some((h) => h.dish.id === dish.id)) {
            violaciones.push({ tipo: regla.tipo, detalle: `"${dish.nombre}" ya se usó este mes (una vez al mes)` });
          }
        } else if (dish.frecuencia_especial === "semana_por_medio") {
          const paridad = paridadEstable(dish.id);
          const semanaEsImpar = ctx.semanaIndice % 2 === 1;
          const permitido = paridad === 0 ? semanaEsImpar : !semanaEsImpar;
          if (!permitido) {
            violaciones.push({ tipo: regla.tipo, detalle: `"${dish.nombre}" es semana por medio, no corresponde esta semana` });
          }
        }
        break;
      }

      case "no_repetir_semana_siguiente": {
        // El acompañamiento compartido del día aparece "dos veces" el mismo
        // día (Opción 1 y 2) a propósito — eso no cuenta como repetición.
        const repetido = historial.find(
          (h) =>
            mismaOSemanaAnterior(h, ctx.semanaIndice) &&
            h.dish.id === dish.id &&
            !(h.fecha === ctx.fecha && esAcompanamiento(dish.tags)),
        );
        if (repetido) {
          violaciones.push({
            tipo: regla.tipo,
            detalle: `"${dish.nombre}" ya se usó el ${repetido.fecha} (misma semana o semana anterior)`,
          });
        }
        break;
      }

      case "no_repetir_proteina_semana_siguiente": {
        const proteinas = tagsProteina(dish.tags).map(normalizar);
        if (proteinas.length > 0) {
          const repetido = historial.find(
            (h) => mismaOSemanaAnterior(h, ctx.semanaIndice) && tagsProteina(h.dish.tags).some((t) => proteinas.includes(normalizar(t))),
          );
          if (repetido) {
            violaciones.push({
              tipo: regla.tipo,
              detalle: `"${dish.nombre}" comparte proteína con "${repetido.dish.nombre}" (${repetido.fecha})`,
            });
          }
        }
        break;
      }

      case "distancia_minima_acompanamiento": {
        // Aplica a acompañamientos "puros" y también a cualquier plato que
        // comparta familia con uno (ej: Carbonada/Charquicán/Pastel de papas
        // son platos completos pero cuentan como "papa" para esta distancia,
        // aunque no sean acompañamientos en sí).
        if (esAcompanamiento(dish.tags) || dish.familia) {
          const n = typeof p.dias === "number" ? p.dias : 1;
          const choque = historial.find((h) => {
            if (h.semanaIndice !== ctx.semanaIndice) return false;
            if (!esAcompanamiento(h.dish.tags) && !h.dish.familia) return false;
            const mismoDish = h.dish.id === dish.id;
            const mismaFamilia = !!h.dish.familia && !!dish.familia && h.dish.familia === dish.familia;
            if (!mismoDish && !mismaFamilia) return false;
            const diff = Math.abs(h.diaSemana - ctx.diaSemana);
            // diff === 0 con el MISMO plato es el acompañamiento compartido
            // entre Opción 1 y 2 ese día — no es una repetición. Dos platos
            // *distintos* de la misma familia el mismo día sí cuenta.
            if (mismoDish && diff === 0) return false;
            return diff <= n;
          });
          if (choque) {
            violaciones.push({
              tipo: regla.tipo,
              detalle: `"${dish.nombre}" repite acompañamiento con "${choque.dish.nombre}" (${choque.fecha}), faltan menos de ${n} día(s) hábil(es)`,
            });
          }
        }
        break;
      }

      case "mismo_tipo_no_repite_dia_semana": {
        const tag = (p.tag as string) || "";
        if (tag && tieneTag(dish.tags, tag)) {
          const choque = historial.find(
            (h) => h.semanaIndice === ctx.semanaIndice - 1 && h.diaSemana === ctx.diaSemana && tieneTag(h.dish.tags, tag),
          );
          if (choque) {
            violaciones.push({
              tipo: regla.tipo,
              detalle: `"${dish.nombre}" (${tag}) repite día de semana con "${choque.dish.nombre}" (${choque.fecha})`,
            });
          }
        }
        break;
      }
    }
  }

  return violaciones;
}

/**
 * Regla blanda `preferencia_dia_semana_distinto`: true si el candidato
 * repite día de la semana con el mismo acompañamiento/familia de la semana
 * calendario anterior. No bloquea — solo se usa para preferir otros
 * candidatos cuando existan.
 */
export function violaPreferenciaDiaSemana(dish: Dish, ctx: SlotCtx, historial: Asignacion[]): boolean {
  if (!esAcompanamiento(dish.tags)) return false;
  return historial.some((h) => {
    if (h.semanaIndice !== ctx.semanaIndice - 1) return false;
    if (h.diaSemana !== ctx.diaSemana) return false;
    return h.dish.id === dish.id || (!!h.dish.familia && !!dish.familia && h.dish.familia === dish.familia);
  });
}

/**
 * Convierte filas de daily_slots guardadas en entradas de historial para el
 * motor de reglas. Cada fila puede aportar hasta 2 entradas: el plato de
 * fondo (dish_id) y, si tiene, el acompañamiento del día (acompanamiento_id)
 * — así las reglas de repetición/distancia ven ambos por separado aunque
 * vivan en la misma fila física.
 */
export function expandirSlotsAHistorial(
  slots: DailySlot[],
  dishesById: Map<string, Dish>,
  semanaIndicePorFecha: Map<string, number>,
): Asignacion[] {
  const out: Asignacion[] = [];
  for (const s of slots) {
    const semanaIndice = semanaIndicePorFecha.get(s.fecha);
    if (semanaIndice === undefined) continue;
    const diaSemana = diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`));

    if (s.dish_id) {
      const dish = dishesById.get(s.dish_id);
      if (dish) out.push({ fecha: s.fecha, diaSemana, semanaIndice, slot: s.slot, dish, esManual: s.es_manual });
    }
    if (s.acompanamiento_id) {
      const acomp = dishesById.get(s.acompanamiento_id);
      if (acomp) out.push({ fecha: s.fecha, diaSemana, semanaIndice, slot: s.slot, dish: acomp, esManual: s.es_manual });
    }
  }
  return out;
}

/** Reglas activas para una semana dada, descontando excepciones puntuales. */
export function reglasVigentes(
  reglas: RandomizationRule[],
  excepcionesPorRegla: Map<string, Set<string>>, // rule_id -> set de semana_inicio (lunes ISO)
  lunesSemanaISO: string,
): RandomizationRule[] {
  return reglas.filter((r) => {
    if (!r.activa) return false;
    const excepciones = excepcionesPorRegla.get(r.id);
    if (excepciones?.has(lunesSemanaISO)) return false;
    return true;
  });
}
