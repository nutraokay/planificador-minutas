import type { RuleType } from "../types/database";

export interface RuleDef {
  tipo: RuleType;
  etiqueta: string;
  descripcion: string;
  /** true si esta regla acepta múltiples filas (una por tag/palabra) con parámetros propios. */
  multiInstancia: boolean;
  parametrosDefault: Record<string, unknown>;
  /** Campos que tiene el formulario de parámetros de esta regla, para renderizar el editor genérico. */
  campos: CampoParametro[];
}

export type CampoParametro =
  | { nombre: string; tipo: "tag"; etiqueta: string; placeholder?: string }
  | { nombre: string; tipo: "texto"; etiqueta: string; placeholder?: string }
  | { nombre: string; tipo: "numero"; etiqueta: string; min?: number; max?: number }
  | { nombre: string; tipo: "dias"; etiqueta: string }
  | { nombre: string; tipo: "plato"; etiqueta: string };

export const RULE_DEFS: Record<RuleType, RuleDef> = {
  no_repetir_semana_siguiente: {
    tipo: "no_repetir_semana_siguiente",
    etiqueta: "No repetir plato semana siguiente",
    descripcion:
      "Un plato no puede repetirse dentro de la misma semana ni en la semana calendario siguiente.",
    multiInstancia: false,
    parametrosDefault: {},
    campos: [],
  },
  no_repetir_proteina_semana_siguiente: {
    tipo: "no_repetir_proteina_semana_siguiente",
    etiqueta: "No repetir proteína semana siguiente",
    descripcion:
      "Aunque el plato sea distinto, si comparte tag proteina:X con uno ya usado esa semana o la anterior, no se puede repetir.",
    multiInstancia: false,
    parametrosDefault: {},
    campos: [],
  },
  distancia_minima_acompanamiento: {
    tipo: "distancia_minima_acompanamiento",
    etiqueta: "Distancia mínima entre acompañamientos",
    descripcion:
      "Un acompañamiento (o su familia) no puede repetirse hasta N días hábiles después, dentro de la misma semana.",
    multiInstancia: false,
    parametrosDefault: { dias: 1 },
    campos: [{ nombre: "dias", tipo: "numero", etiqueta: "Días hábiles mínimos de por medio", min: 0, max: 5 }],
  },
  preferencia_dia_semana_distinto: {
    tipo: "preferencia_dia_semana_distinto",
    etiqueta: "Preferir día de semana distinto (acompañamientos)",
    descripcion:
      "Regla blanda: si es posible, evita que un acompañamiento caiga el mismo día de la semana que en la semana anterior. No bloquea si no se puede cumplir.",
    multiInstancia: false,
    parametrosDefault: {},
    campos: [],
  },
  frecuencia_especial: {
    tipo: "frecuencia_especial",
    etiqueta: "Respetar frecuencia especial del plato",
    descripcion:
      "Respeta el campo 'frecuencia especial' de cada plato: semana por medio (paridad de semana del mes) o máximo una vez al mes.",
    multiInstancia: false,
    parametrosDefault: {},
    campos: [],
  },
  dias_permitidos: {
    tipo: "dias_permitidos",
    etiqueta: "Respetar días permitidos del plato",
    descripcion: "Respeta el campo 'días permitidos' de cada plato (solo puede aparecer esos días).",
    multiInstancia: false,
    parametrosDefault: {},
    campos: [],
  },
  restriccion_por_palabra: {
    tipo: "restriccion_por_palabra",
    etiqueta: "Restricción por palabra en el nombre",
    descripcion:
      "Si el nombre del plato contiene la palabra indicada, solo puede aparecer en los días permitidos indicados.",
    multiInstancia: true,
    parametrosDefault: { palabra: "", dias_permitidos: [3, 4, 5] },
    campos: [
      { nombre: "palabra", tipo: "texto", etiqueta: "Palabra en el nombre", placeholder: "ej: cerdo" },
      { nombre: "dias_permitidos", tipo: "dias", etiqueta: "Días permitidos" },
    ],
  },
  mismo_tipo_no_repite_dia_semana: {
    tipo: "mismo_tipo_no_repite_dia_semana",
    etiqueta: "Mismo tipo no repite día de la semana",
    descripcion:
      "Para el tag indicado (ej: proteina:pollo), no puede caer el mismo día de la semana que en la semana calendario anterior.",
    multiInstancia: true,
    parametrosDefault: { tag: "" },
    campos: [{ nombre: "tag", tipo: "tag", etiqueta: "Tag", placeholder: "ej: proteina:pollo" }],
  },
  composicion_semanal_minima: {
    tipo: "composicion_semanal_minima",
    etiqueta: "Composición semanal mínima",
    descripcion: "Mínimo N días por semana con el tag indicado (ej: legumbre, pescado).",
    multiInstancia: true,
    parametrosDefault: { tag: "", minimo: 1 },
    campos: [
      { nombre: "tag", tipo: "tag", etiqueta: "Tag", placeholder: "ej: legumbre" },
      { nombre: "minimo", tipo: "numero", etiqueta: "Mínimo por semana", min: 1, max: 5 },
    ],
  },
  plato_obligatorio_frecuencia: {
    tipo: "plato_obligatorio_frecuencia",
    etiqueta: "Plato obligatorio (semana por medio / una vez al mes)",
    descripcion:
      "Elige un plato marcado como \"semana por medio\" o \"una vez al mes\" en el catálogo — se asegura de que efectivamente aparezca en las semanas que le corresponden (o una vez en el mes), no solo que esté permitido.",
    multiInstancia: true,
    parametrosDefault: { dish_id: "" },
    campos: [{ nombre: "dish_id", tipo: "plato", etiqueta: "Plato" }],
  },
};

export const RULE_TYPES_ORDENADOS: RuleType[] = [
  "dias_permitidos",
  "restriccion_por_palabra",
  "composicion_semanal_minima",
  "plato_obligatorio_frecuencia",
  "frecuencia_especial",
  "mismo_tipo_no_repite_dia_semana",
  "no_repetir_proteina_semana_siguiente",
  "no_repetir_semana_siguiente",
  "distancia_minima_acompanamiento",
  "preferencia_dia_semana_distinto",
];

/**
 * Orden de relajación cuando el pool de candidatos queda vacío: se relaja
 * primero la regla más flexible (índice 0) y se sigue avanzando hasta que
 * aparezca algún candidato válido. `dias_permitidos` y `restriccion_por_palabra`
 * son las más rígidas — se relajan solo como último recurso, para no dejar
 * un slot sin plato asignado.
 */
export const ORDEN_RELAJACION: RuleType[] = [
  "preferencia_dia_semana_distinto",
  "distancia_minima_acompanamiento",
  "no_repetir_semana_siguiente",
  "no_repetir_proteina_semana_siguiente",
  "mismo_tipo_no_repite_dia_semana",
  "frecuencia_especial",
  "composicion_semanal_minima",
  "restriccion_por_palabra",
  "dias_permitidos",
];

export function tagsDisponibles(dishesTags: string[][]): string[] {
  const set = new Set<string>();
  for (const tags of dishesTags) for (const t of tags) set.add(t);
  return [...set].sort();
}
