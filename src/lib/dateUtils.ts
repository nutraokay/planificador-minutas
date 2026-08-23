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
  /** Lunes de esa semana calendario (puede caer fuera del mes si la semana está partida). */
  lunes: Date;
  /** Días hábiles (lun-vie) de esa semana que caen dentro del mes planificado. */
  dias: Date[];
}

/**
 * Agrupa los días hábiles (lunes a viernes) de un mes en semanas calendario.
 * `mes` es 1-12. La primera/última semana puede tener menos de 5 días si el
 * mes no empieza en lunes o no termina en viernes.
 */
export function getSemanasHabilesDelMes(anio: number, mes: number): SemanaDelMes[] {
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1, 12));
  const ultimoDia = new Date(Date.UTC(anio, mes, 0, 12));

  const semanas = new Map<string, SemanaDelMes>();
  let indice = 0;
  const ordenSemanas: string[] = [];

  for (
    let d = new Date(primerDia);
    d.getTime() <= ultimoDia.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const diaISO = diaSemanaISO(d);
    if (diaISO > 5) continue; // salta sábado/domingo

    const lunes = new Date(d);
    lunes.setUTCDate(lunes.getUTCDate() - (diaISO - 1));
    const key = formatFecha(lunes);

    if (!semanas.has(key)) {
      indice += 1;
      ordenSemanas.push(key);
      semanas.set(key, { indice, lunes, dias: [] });
    }
    semanas.get(key)!.dias.push(new Date(d));
  }

  return ordenSemanas.map((key) => semanas.get(key)!);
}

export function mesLabel(anio: number, mes: number): string {
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** Suma (o resta) meses a un par año/mes, normalizando el desborde. */
export function sumarMes(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(total / 12), mes: (total % 12 + 12) % 12 + 1 };
}
