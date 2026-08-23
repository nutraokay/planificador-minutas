import type { DailySlot, Dish, RandomizationRule, RuleException, RuleType } from "../types/database";
import { diaSemanaISO, formatFecha, getSemanasHabilesDelMes, NOMBRES_DIA_CORTO } from "./dateUtils";
import { RULE_DEFS } from "./rules";
import { esAcompanamiento, normalizar, paridadEstable, tagsProteina, tieneTag } from "./text";
import type { Asignacion } from "./ruleEngine";

export type EstadoRegla = "cumple" | "incumple" | "excepcionada";

export interface ResultadoReglaSemana {
  ruleId: string;
  tipo: RuleType;
  etiqueta: string;
  estado: EstadoRegla;
  detalles: string[];
}

export interface ResultadoSemana {
  indice: number;
  lunes: string;
  etiqueta: string;
  resultados: ResultadoReglaSemana[];
}

export function etiquetaRegla(rule: RandomizationRule): string {
  const base = RULE_DEFS[rule.tipo].etiqueta;
  const p = rule.parametros as Record<string, any>;
  switch (rule.tipo) {
    case "distancia_minima_acompanamiento":
      return `${base} (≥${p.dias ?? 1} día)`;
    case "restriccion_por_palabra":
      return p.palabra ? `${base} ("${p.palabra}")` : `${base} (sin configurar)`;
    case "mismo_tipo_no_repite_dia_semana":
      return p.tag ? `${base} (${p.tag})` : `${base} (sin configurar)`;
    case "composicion_semanal_minima":
      return p.tag ? `${base} (${p.tag} ≥${p.minimo ?? 1})` : `${base} (sin configurar)`;
    default:
      return base;
  }
}

function fmtCorta(fechaISO: string): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface VerificarInput {
  anio: number;
  mes: number;
  dishes: Dish[];
  rules: RandomizationRule[];
  exceptions: RuleException[];
  slots: DailySlot[];
}

export function verificarMinuta(input: VerificarInput): ResultadoSemana[] {
  const { anio, mes, exceptions } = input;
  const dishesById = new Map(input.dishes.map((d) => [d.id, d]));
  const reglasActivas = input.rules.filter((r) => r.activa);
  const semanas = getSemanasHabilesDelMes(anio, mes);

  const excMap = new Map<string, Set<string>>();
  for (const ex of exceptions) {
    if (!excMap.has(ex.rule_id)) excMap.set(ex.rule_id, new Set());
    excMap.get(ex.rule_id)!.add(ex.semana_inicio);
  }

  const asignacionesPorFechaSlot = new Map<string, DailySlot>();
  for (const s of input.slots) asignacionesPorFechaSlot.set(`${s.fecha}#${s.slot}`, s);

  // Todas las asignaciones (con plato) del mes, agrupadas por semana, en orden.
  const asignacionesPorSemana: Asignacion[][] = semanas.map((semana) =>
    semana.dias.flatMap((dia) => {
      const fecha = formatFecha(dia);
      const diaSemana = diaSemanaISO(dia);
      const out: Asignacion[] = [];
      for (const slot of [1, 2] as const) {
        const s = asignacionesPorFechaSlot.get(`${fecha}#${slot}`);
        if (!s || !s.dish_id) continue;
        const dish = dishesById.get(s.dish_id);
        if (!dish) continue;
        out.push({ fecha, diaSemana, semanaIndice: semana.indice, slot, dish, esManual: s.es_manual });
      }
      return out;
    }),
  );

  const resultados: ResultadoSemana[] = semanas.map((semana, i) => {
    const asignSemana = asignacionesPorSemana[i];
    const asignPrevia = i > 0 ? asignacionesPorSemana[i - 1] : [];
    const asignHastaAhora = asignacionesPorSemana.slice(0, i + 1).flat();
    const lunesISO = formatFecha(semana.lunes);

    const resultadosRegla: ResultadoReglaSemana[] = reglasActivas.map((regla) => {
      const excepcionada = excMap.get(regla.id)?.has(lunesISO) ?? false;
      if (excepcionada) {
        return { ruleId: regla.id, tipo: regla.tipo, etiqueta: etiquetaRegla(regla), estado: "excepcionada", detalles: [] };
      }
      const detalles = auditarRegla(regla, asignSemana, asignPrevia, asignHastaAhora);
      return {
        ruleId: regla.id,
        tipo: regla.tipo,
        etiqueta: etiquetaRegla(regla),
        estado: detalles.length === 0 ? "cumple" : "incumple",
        detalles,
      };
    });

    return {
      indice: semana.indice,
      lunes: lunesISO,
      etiqueta: `Sem ${semana.indice} (${fmtCorta(formatFecha(semana.dias[0]))}–${fmtCorta(formatFecha(semana.dias[semana.dias.length - 1]))})`,
      resultados: resultadosRegla,
    };
  });

  return resultados;
}

function auditarRegla(
  regla: RandomizationRule,
  semana: Asignacion[],
  semanaAnterior: Asignacion[],
  hastaAhora: Asignacion[],
): string[] {
  const p = regla.parametros as Record<string, any>;
  const detalles: string[] = [];

  switch (regla.tipo) {
    case "no_repetir_semana_siguiente": {
      const porDish = new Map<string, Asignacion[]>();
      for (const a of semana) {
        if (!porDish.has(a.dish.id)) porDish.set(a.dish.id, []);
        porDish.get(a.dish.id)!.push(a);
      }
      for (const [, lista] of porDish) {
        if (lista.length > 1) {
          detalles.push(`"${lista[0].dish.nombre}" se repite esta semana (${lista.map((a) => fmtCorta(a.fecha)).join(", ")})`);
        }
      }
      for (const a of semana) {
        const prev = semanaAnterior.find((h) => h.dish.id === a.dish.id);
        if (prev) detalles.push(`"${a.dish.nombre}" repite con la semana anterior (${fmtCorta(prev.fecha)} y ${fmtCorta(a.fecha)})`);
      }
      break;
    }

    case "no_repetir_proteina_semana_siguiente": {
      for (let idx = 0; idx < semana.length; idx++) {
        const a = semana[idx];
        const proteinas = tagsProteina(a.dish.tags).map(normalizar);
        if (proteinas.length === 0) continue;
        for (let j = idx + 1; j < semana.length; j++) {
          const b = semana[j];
          if (tagsProteina(b.dish.tags).some((t) => proteinas.includes(normalizar(t)))) {
            detalles.push(`"${a.dish.nombre}" (${fmtCorta(a.fecha)}) y "${b.dish.nombre}" (${fmtCorta(b.fecha)}) comparten proteína`);
          }
        }
        const prev = semanaAnterior.find((h) => tagsProteina(h.dish.tags).some((t) => proteinas.includes(normalizar(t))));
        if (prev) detalles.push(`"${a.dish.nombre}" (${fmtCorta(a.fecha)}) repite proteína con "${prev.dish.nombre}" de la semana anterior (${fmtCorta(prev.fecha)})`);
      }
      break;
    }

    case "distancia_minima_acompanamiento": {
      const n = typeof p.dias === "number" ? p.dias : 1;
      const acomps = semana.filter((a) => esAcompanamiento(a.dish.tags) || a.dish.familia);
      for (let idx = 0; idx < acomps.length; idx++) {
        for (let j = idx + 1; j < acomps.length; j++) {
          const a = acomps[idx];
          const b = acomps[j];
          const mismoGrupo = a.dish.id === b.dish.id || (!!a.dish.familia && !!b.dish.familia && a.dish.familia === b.dish.familia);
          if (mismoGrupo && Math.abs(a.diaSemana - b.diaSemana) <= n) {
            detalles.push(`"${a.dish.nombre}" (${fmtCorta(a.fecha)}) y "${b.dish.nombre}" (${fmtCorta(b.fecha)}) son el mismo acompañamiento con menos de ${n} día(s) de por medio`);
          }
        }
      }
      break;
    }

    case "preferencia_dia_semana_distinto": {
      const acomps = semana.filter((a) => esAcompanamiento(a.dish.tags));
      for (const a of acomps) {
        const prev = semanaAnterior.find(
          (h) => h.diaSemana === a.diaSemana && (h.dish.id === a.dish.id || (!!h.dish.familia && !!a.dish.familia && h.dish.familia === a.dish.familia)),
        );
        if (prev) {
          detalles.push(`"${a.dish.nombre}" cae ${NOMBRES_DIA_CORTO[a.diaSemana]} igual que la semana anterior (preferencia, no bloqueante)`);
        }
      }
      break;
    }

    case "frecuencia_especial": {
      for (const a of semana) {
        if (a.dish.frecuencia_especial === "una_vez_al_mes") {
          const otras = hastaAhora.filter((h) => h.dish.id === a.dish.id && h.fecha !== a.fecha);
          if (otras.length > 0) {
            detalles.push(`"${a.dish.nombre}" es "una vez al mes" pero ya apareció antes este mes (${fmtCorta(otras[0].fecha)})`);
          }
        } else if (a.dish.frecuencia_especial === "semana_por_medio") {
          const paridad = paridadEstable(a.dish.id);
          const semanaEsImpar = a.semanaIndice % 2 === 1;
          const permitido = paridad === 0 ? semanaEsImpar : !semanaEsImpar;
          if (!permitido) detalles.push(`"${a.dish.nombre}" es "semana por medio" y no correspondía esta semana`);
        }
      }
      break;
    }

    case "dias_permitidos": {
      for (const a of semana) {
        const dias = a.dish.dias_permitidos;
        if (dias && dias.length > 0 && !dias.includes(a.diaSemana)) {
          detalles.push(`"${a.dish.nombre}" (${NOMBRES_DIA_CORTO[a.diaSemana]}) solo debería ir días ${dias.join(",")}`);
        }
      }
      break;
    }

    case "restriccion_por_palabra": {
      const palabra = (p.palabra as string) || "";
      const diasPermitidos = (p.dias_permitidos as number[]) || [];
      if (!palabra) break;
      for (const a of semana) {
        if (normalizar(a.dish.nombre).includes(normalizar(palabra)) && diasPermitidos.length > 0 && !diasPermitidos.includes(a.diaSemana)) {
          detalles.push(`"${a.dish.nombre}" (${NOMBRES_DIA_CORTO[a.diaSemana]}) contiene "${palabra}" — debería ser ${diasPermitidos.map((d) => NOMBRES_DIA_CORTO[d]).join("/")}`);
        }
      }
      break;
    }

    case "mismo_tipo_no_repite_dia_semana": {
      const tag = (p.tag as string) || "";
      if (!tag) break;
      for (const a of semana) {
        if (!tieneTag(a.dish.tags, tag)) continue;
        const prev = semanaAnterior.find((h) => h.diaSemana === a.diaSemana && tieneTag(h.dish.tags, tag));
        if (prev) {
          detalles.push(`"${a.dish.nombre}" (${NOMBRES_DIA_CORTO[a.diaSemana]}, ${tag}) repite día con "${prev.dish.nombre}" de la semana pasada`);
        }
      }
      break;
    }

    case "composicion_semanal_minima": {
      const tag = (p.tag as string) || "";
      const minimo = Number(p.minimo) || 1;
      if (!tag) break;
      const cuenta = semana.filter((a) => tieneTag(a.dish.tags, tag)).length;
      if (cuenta < minimo) {
        detalles.push(`Solo ${cuenta} día(s) con "${tag}" esta semana (mínimo ${minimo})`);
      }
      break;
    }
  }

  return detalles;
}
