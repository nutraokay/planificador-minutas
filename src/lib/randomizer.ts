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
import { esPlatoViernes, tieneTag } from "./text";

export interface SlotGenerado {
  fecha: string;
  slot: 1 | 2;
  dish_id: string | null;
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
  // considerarlos como contexto fijo, según la especificación.
  const historial: Asignacion[] = [];
  for (const semana of semanas) {
    for (const dia of semana.dias) {
      const fecha = formatFecha(dia);
      const cfg = configPorFecha.get(fecha);
      if (!cfg) continue;
      for (const [slot, existente] of cfg.existentes) {
        if (existente.es_manual && existente.dish_id) {
          const dish = dishesById.get(existente.dish_id);
          if (dish) {
            historial.push({
              fecha,
              diaSemana: diaSemanaISO(dia),
              semanaIndice: semana.indice,
              slot: slot as 1 | 2,
              dish,
              esManual: true,
            });
          }
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

      for (let slot = 1 as 1 | 2; slot <= platosDelDia; slot = (slot + 1) as 1 | 2) {
        const existente = cfg?.existentes.get(slot);

        if (existente?.es_manual) {
          salida.push({
            fecha,
            slot,
            dish_id: existente.dish_id,
            es_manual: true,
            platos_del_dia: platosDelDia,
            conflicto: existente.conflicto,
            conflicto_detalle: existente.conflicto_detalle,
          });
          continue;
        }

        const ctx: SlotCtx = { fecha, diaSemana, semanaIndice: semana.indice };
        const reglasHoy = reglasVigentes(rules, excMap, lunesISO);

        // El viernes elige solo del pool plato_viernes. El resto de la semana
        // usa el catálogo completo — un plato marcado plato_viernes puede
        // seguir sirviendo otros días si también cabe ahí (no es exclusivo
        // del viernes, es un mínimo garantizado para ese día).
        let poolBase = dishesActivos;
        if (esViernes) {
          poolBase = poolBase.filter((d) => esPlatoViernes(d.tags));
        }

        let candidatos = poolBase.filter((d) => violacionesDuras(d, ctx, historial, reglasHoy).length === 0);

        const usaPreferencia = reglasHoy.some((r) => r.tipo === "preferencia_dia_semana_distinto");
        if (usaPreferencia && candidatos.length > 0) {
          const preferidos = candidatos.filter((d) => !violaPreferenciaDiaSemana(d, ctx, historial));
          if (preferidos.length > 0) candidatos = preferidos;
        }

        let conflicto = false;
        let detalle: string | null = null;

        if (candidatos.length === 0) {
          let reglasTrabajo = reglasHoy;
          const relajadas: string[] = [];
          for (const tipoRelajar of ORDEN_RELAJACION) {
            if (tipoRelajar === "preferencia_dia_semana_distinto") continue; // ya es blanda
            if (tipoRelajar === "composicion_semanal_minima") continue; // no es filtro por slot
            if (!reglasTrabajo.some((r) => r.tipo === tipoRelajar)) continue;
            reglasTrabajo = reglasTrabajo.filter((r) => r.tipo !== tipoRelajar);
            relajadas.push(RULE_DEFS[tipoRelajar].etiqueta);
            const intento = poolBase.filter((d) => violacionesDuras(d, ctx, historial, reglasTrabajo).length === 0);
            if (intento.length > 0) {
              candidatos = intento;
              break;
            }
          }
          if (candidatos.length > 0) {
            conflicto = true;
            detalle = `Generado relajando: ${relajadas.join(", ")}`;
          } else {
            conflicto = true;
            detalle =
              poolBase.length === 0
                ? esViernes
                  ? "No hay platos activos con tag plato_viernes en el catálogo"
                  : "No hay platos activos disponibles en el catálogo"
                : "No se encontró ningún plato válido ni relajando todas las reglas";
          }
        }

        const dish = candidatos.length > 0 ? elegirAleatorio(candidatos) : null;
        if (dish) historial.push({ fecha, diaSemana, semanaIndice: semana.indice, slot, dish, esManual: false });

        salida.push({
          fecha,
          slot,
          dish_id: dish?.id ?? null,
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
          let poolBase = dishesActivos.filter((d) => tieneTag(d.tags, tag));
          if (esViernes) poolBase = poolBase.filter((d) => esPlatoViernes(d.tags));

          const ctx: SlotCtx = { fecha: s.fecha, diaSemana, semanaIndice: semana.indice };
          const reglasHoy = reglasVigentes(rules, excMap, lunesISO).filter((r) => r.tipo !== "composicion_semanal_minima");
          const historialSinEsteSlot = historial.filter((h) => !(h.fecha === s.fecha && h.slot === s.slot));
          const candidatos = poolBase.filter((d) => violacionesDuras(d, ctx, historialSinEsteSlot, reglasHoy).length === 0);

          if (candidatos.length > 0) {
            const nuevoDish = elegirAleatorio(candidatos);
            const anteriorDishId = s.dish_id;
            s.dish_id = nuevoDish.id;
            const hIdx = historial.findIndex((h) => h.fecha === s.fecha && h.slot === s.slot);
            if (hIdx >= 0) historial[hIdx] = { ...historial[hIdx], dish: nuevoDish };
            else if (anteriorDishId) historial.push({ fecha: s.fecha, diaSemana, semanaIndice: semana.indice, slot: s.slot, dish: nuevoDish, esManual: false });
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
