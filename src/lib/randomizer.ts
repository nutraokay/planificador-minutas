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
import { esAcompanamiento, esPlatoDeFondo, esPlatoViernes, necesitaAcompanamiento, paridadEstable, tieneTag } from "./text";

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

function mezclar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
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

/** Intenta colocar un plato específico (no un pool) en alguno de los índices
 * candidatos de `salida`, respetando reglas duras (con relajación
 * progresiva si hace falta, igual que en la generación normal). Usado por
 * el post-pass de "plato obligatorio según su frecuencia". Devuelve true si
 * logró colocarlo (o si ya estaba puesto). */
function intentarColocarPlatoEspecifico(
  dishObjetivo: Dish,
  indicesCandidatos: number[],
  salida: SlotGenerado[],
  historial: Asignacion[],
  rules: RandomizationRule[],
  excMap: Map<string, Set<string>>,
  semanaInfoPorFecha: Map<string, { indice: number; lunesISO: string }>,
  etiquetaMotivo: string,
): boolean {
  if (indicesCandidatos.some((i) => salida[i].dish_id === dishObjetivo.id)) return true; // ya está puesto

  for (const i of mezclar(indicesCandidatos)) {
    const s = salida[i];
    if (s.es_manual) continue;
    const info = semanaInfoPorFecha.get(s.fecha);
    if (!info) continue;

    const diaSemana = diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`));
    const esViernes = diaSemana === 5;
    if (esViernes && !esPlatoViernes(dishObjetivo.tags)) continue;

    const ctx: SlotCtx = { fecha: s.fecha, diaSemana, semanaIndice: info.indice };
    const reglasHoy = reglasVigentes(rules, excMap, info.lunesISO).filter(
      (r) => r.tipo !== "composicion_semanal_minima" && r.tipo !== "plato_obligatorio_frecuencia",
    );
    const historialSinEsteSlot = historial.filter((h) => !(h.fecha === s.fecha && h.slot === s.slot));
    const { candidatos, conflicto, detalle } = elegirConRelajacion([dishObjetivo], ctx, historialSinEsteSlot, reglasHoy);
    if (candidatos.length === 0) continue;

    s.dish_id = dishObjetivo.id;
    s.conflicto = conflicto;
    s.conflicto_detalle = conflicto ? `Recolocado para asegurar "${dishObjetivo.nombre}" (${etiquetaMotivo}) — ${detalle}` : null;

    if (necesitaAcompanamiento(dishObjetivo.tags)) {
      if (!s.acompanamiento_id) {
        const otroDelDia = salida.find((o) => o.fecha === s.fecha && o !== s && o.acompanamiento_id);
        if (otroDelDia) s.acompanamiento_id = otroDelDia.acompanamiento_id;
      }
    } else {
      s.acompanamiento_id = null;
    }

    const hIdx = historial.findIndex((h) => h.fecha === s.fecha && h.slot === s.slot && h.dish.id !== s.acompanamiento_id);
    if (hIdx >= 0) historial[hIdx] = { ...historial[hIdx], dish: dishObjetivo };
    else historial.push({ fecha: s.fecha, diaSemana, semanaIndice: info.indice, slot: s.slot, dish: dishObjetivo, esManual: false });

    return true;
  }
  return false;
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
        if (dish && necesitaAcompanamiento(dish.tags)) slotsQueNecesitan.push(slot);
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
        const necesita = !!dish && necesitaAcompanamiento(dish.tags);
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

      // Varias reglas de composición compiten por los mismos cupos escasos
      // de la semana (ej: legumbre, pescado, cerdo, pollo, vacuno, fritura,
      // platos completos...). Legumbre y pescado se procesan siempre
      // primero (a pedido explícito) — son innegociables en la minuta.
      // Entre el resto, se procesa de la más difícil de cumplir a la más
      // fácil (menos platos elegibles en el catálogo primero), para que una
      // regla con muchas opciones no le gane el cupo a una con pocas.
      const TAGS_PRIORIDAD_MAXIMA = new Set(["legumbre", "proteina:pescado"]);
      const reglasOrdenadas = [...reglasVigentes(reglasComposicion, excMap, lunesISO)].sort((a, b) => {
        const tagA = ((a.parametros as any).tag as string) || "";
        const tagB = ((b.parametros as any).tag as string) || "";
        const prioA = TAGS_PRIORIDAD_MAXIMA.has(tagA) ? 0 : 1;
        const prioB = TAGS_PRIORIDAD_MAXIMA.has(tagB) ? 0 : 1;
        if (prioA !== prioB) return prioA - prioB;
        const nA = dishesActivos.filter((d) => tieneTag(d.tags, tagA) && esPlatoDeFondo(d.tags)).length;
        const nB = dishesActivos.filter((d) => tieneTag(d.tags, tagB) && esPlatoDeFondo(d.tags)).length;
        return nA - nB;
      });

      // Una vez que un día queda usado para cumplir una regla (de forma
      // natural o por recolocación), se bloquea para las reglas que se
      // procesan después — si no, una regla de menor prioridad podía
      // "robarle" el día a una regla ya cumplida (ej: pollo pisando el día
      // que ya se le había asignado a legumbre).
      const indicesBloqueados = new Set<number>();

      for (const regla of reglasOrdenadas) {
        const tag = (regla.parametros as any).tag as string;
        const minimo = Number((regla.parametros as any).minimo) || 1;
        if (!tag) continue;

        const cumpleTag = (dishId: string | null) => {
          if (!dishId) return false;
          const d = dishesById.get(dishId);
          return d ? tieneTag(d.tags, tag) : false;
        };

        let actuales = 0;
        for (const i of indicesSemana) {
          if (cumpleTag(salida[i].dish_id)) {
            actuales += 1;
            indicesBloqueados.add(i); // ya cumple esta regla: queda fijo
          }
        }
        if (actuales >= minimo) continue;

        // Orden al azar (no siempre el lunes primero) para que el día que
        // termina recibiendo el plato obligatorio varíe entre corridas.
        for (const i of mezclar(indicesSemana)) {
          if (actuales >= minimo) break;
          const s = salida[i];
          if (s.es_manual) continue;
          if (cumpleTag(s.dish_id)) continue;
          if (indicesBloqueados.has(i)) continue; // ya reservado por otra regla

          const diaSemana = diaSemanaISO(new Date(`${s.fecha}T12:00:00Z`));
          const esViernes = diaSemana === 5;
          let poolBase = dishesActivos.filter((d) => tieneTag(d.tags, tag) && esPlatoDeFondo(d.tags));
          if (esViernes) poolBase = poolBase.filter((d) => esPlatoViernes(d.tags));

          const ctx: SlotCtx = { fecha: s.fecha, diaSemana, semanaIndice: semana.indice };
          const reglasHoy = reglasVigentes(rules, excMap, lunesISO).filter((r) => r.tipo !== "composicion_semanal_minima");
          const historialSinEsteSlot = historial.filter((h) => !(h.fecha === s.fecha && h.slot === s.slot));
          // composicion_semanal_minima es obligatoria: si no hay candidato
          // respetando todo, se relajan otras reglas (mismo orden que en la
          // generación normal) antes de darla por incumplida.
          const { candidatos, conflicto: conflictoSwap, detalle: detalleSwap } = elegirConRelajacion(
            poolBase,
            ctx,
            historialSinEsteSlot,
            reglasHoy,
          );

          if (candidatos.length > 0) {
            const nuevoDish = elegirAleatorio(candidatos);
            s.dish_id = nuevoDish.id;
            s.conflicto = conflictoSwap;
            s.conflicto_detalle = conflictoSwap
              ? `Recolocado para cumplir composición semanal mínima (${tag}) — ${detalleSwap}`
              : null;

            // Ajusta el acompañamiento de este slot al nuevo plato: si ya
            // no lo necesita (plato completo/legumbre), se quita; si lo
            // necesita y no tenía uno, intenta reusar el del otro slot del
            // mismo día (para mantener "mismo acompañamiento del día").
            if (necesitaAcompanamiento(nuevoDish.tags)) {
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
            indicesBloqueados.add(i);
          }
        }
        // Si tras intentar recolocar sigue sin cumplirse, no se fuerza más:
        // el panel de Verificación lo mostrará como incumplimiento real.
      }
    }
  }

  // Post-pass: platos específicos marcados "semana por medio" o "una vez al
  // mes" en el catálogo que además tienen una regla "plato obligatorio" —
  // se asegura de que efectivamente aparezcan (no solo que estén
  // permitidos). Corre después de composición semanal para no pisarle el
  // cupo a legumbre/pescado/etc., que son obligatorias por tag.
  const reglasPlatoObligatorio = rules.filter((r) => r.tipo === "plato_obligatorio_frecuencia" && r.activa);
  if (reglasPlatoObligatorio.length > 0) {
    const semanaInfoPorFecha = new Map<string, { indice: number; lunesISO: string }>();
    for (const semana of semanas) {
      const lunesISO = formatFecha(semana.lunes);
      for (const dia of semana.dias) semanaInfoPorFecha.set(formatFecha(dia), { indice: semana.indice, lunesISO });
    }

    for (const regla of reglasPlatoObligatorio) {
      const dishId = (regla.parametros as any).dish_id as string | undefined;
      const dishObligatorio = dishId ? dishesById.get(dishId) : undefined;
      if (!dishObligatorio) continue;

      if (dishObligatorio.frecuencia_especial === "semana_por_medio") {
        const paridad = paridadEstable(dishObligatorio.id);
        for (const semana of semanas) {
          const lunesISO = formatFecha(semana.lunes);
          if (!reglasVigentes([regla], excMap, lunesISO).length) continue; // excepcionada esta semana

          const semanaEsImpar = semana.indice % 2 === 1;
          const leCorresponde = paridad === 0 ? semanaEsImpar : !semanaEsImpar;
          if (!leCorresponde) continue; // esta semana no es la que le toca a este plato

          const fechasSemana = new Set(semana.dias.map(formatFecha));
          const indicesSemana = salida.reduce<number[]>((acc, s, i) => {
            if (fechasSemana.has(s.fecha)) acc.push(i);
            return acc;
          }, []);

          intentarColocarPlatoEspecifico(
            dishObligatorio,
            indicesSemana,
            salida,
            historial,
            rules,
            excMap,
            semanaInfoPorFecha,
            "semana por medio",
          );
          // Si no se pudo colocar, queda sin aparecer esta semana — el
          // panel de Verificación lo mostrará como incumplimiento real.
        }
      } else if (dishObligatorio.frecuencia_especial === "una_vez_al_mes") {
        const todosLosIndices = salida.map((_, i) => i);
        intentarColocarPlatoEspecifico(
          dishObligatorio,
          todosLosIndices,
          salida,
          historial,
          rules,
          excMap,
          semanaInfoPorFecha,
          "una vez al mes",
        );
      }
      // Si el plato está marcado "ninguna" frecuencia especial en el
      // catálogo, esta regla no tiene nada que forzar — se ignora.
    }
  }

  return salida;
}
