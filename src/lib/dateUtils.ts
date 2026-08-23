// Utilidades de fechas para la minuta. Todo trabaja en fechas "naive"
// (YYYY-MM-DD, sin hora) para evitar líos de huso horario, ya que a la
// minuta solo le importa el día calendario.

export const NOMBRES_DIA: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
};

export const NOMBRES_DIA_CORTO: Record<number, string> = {
  1: "LUN",
  2: "MAR",
  3: "MIÉ",
  4: "JUE",
  5: "VIE",
};

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Construye un Date a mediodía UTC para una fecha YYYY-MM-DD, evitando
 * corrimientos de día por zona horaria al hacer getDay()/comparaciones. */
export function parseFecha(fechaISO: string): Date {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatFecha(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 1=lunes … 5=viernes. Devuelve 0 para sábado/domingo (no debería pasarse). */
export function diaSemanaISO(date: Date): number {
  const js = date.getUTCDay(); // 0=domingo..6=sábado
  return js === 0 ? 7 : js;
}

export interface SemanaDelMes {
  /** Índice 1-based de la semana dentro del mes planificado (orden cronológico). */
  indice: number;
  /** Lunes de esa semana calendario (puede caer en el mes anterior si el mes
   * planificado no empieza en lunes — se muestra igual, completa). */
  lunes: Date;
  /** Días hábiles (lun-vie) de esa semana — siempre 5 días. Si el mes no
   * empieza en lunes o no termina en viernes, esa semana "límite" se
   * completa con días del mes vecino (se muestra igual en ambos meses,
   * cada uno con su propia planificación/aleatorización para esos días). */
  dias: Date[];
}

/**
 * Agrupa los días hábiles (lunes a viernes) de un mes en semanas calendario
 * completas. `mes` es 1-12.
 *
 * Cada semana se muestra siempre completa (lunes a viernes), aunque eso
 * signifique asomarse al mes anterior o al siguiente. Por diseño, la semana
 * "límite" (la que contiene el día 1, o la que contiene el último día del
 * mes) puede aparecer en dos meses consecutivos a la vez — por ejemplo, si
 * septiembre empieza martes, la semana lunes 31/08–viernes 04/09 se ve
 * completa tanto al final de agosto como al inicio de septiembre. Cada mes
 * planifica esos días de forma independiente (son weekly_plans distintos),
 * así que se puede aleatorizar septiembre sin tocar lo que quedó guardado
 * en agosto para esos mismos días, y viceversa.
 */
export function getSemanasHabilesDelMes(anio: number, mes: number): SemanaDelMes[] {
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1, 12));
  const ultimoDia = new Date(Date.UTC(anio, mes, 0, 12));
  const diaISO1 = diaSemanaISO(primerDia);

  // Lunes de la semana que contiene el día 1 del mes.
  const lunes = new Date(primerDia);
  if (diaISO1 <= 5) {
    lunes.setUTCDate(lunes.getUTCDate() - (diaISO1 - 1));
  } else {
    // El día 1 cae sábado o domingo: el próximo día hábil ya es lunes.
    lunes.setUTCDate(lunes.getUTCDate() + (diaISO1 === 6 ? 2 : 1));
  }

  const semanas: SemanaDelMes[] = [];
  let indice = 0;

  while (lunes.getTime() <= ultimoDia.getTime()) {
    indice += 1;
    const dias: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const dia = new Date(lunes);
      dia.setUTCDate(dia.getUTCDate() + i);
      dias.push(dia);
    }
    semanas.push({ indice, lunes: new Date(lunes), dias });
    lunes.setUTCDate(lunes.getUTCDate() + 7);
  }

  return semanas;
}

export function mesLabel(anio: number, mes: number): string {
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** Suma (o resta) meses a un par año/mes, normalizando el desborde. */
export function sumarMes(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(total / 12), mes: (total % 12 + 12) % 12 + 1 };
}
