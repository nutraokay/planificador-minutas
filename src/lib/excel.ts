import * as XLSX from "xlsx";
import type { DishInput, FrecuenciaEspecial } from "../types/database";
import { NOMBRES_DIA_CORTO, parseFecha } from "./dateUtils";
import { normalizar } from "./text";

export interface HojaImportada {
  encabezados: string[];
  filas: Record<string, unknown>[];
}

/** Lee la primera hoja de un archivo .xlsx/.xls/.csv y la devuelve como filas objeto (encabezado -> valor). */
export async function leerHojaExcel(file: File): Promise<HojaImportada> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const primeraHoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(primeraHoja, { defval: "" });
  const encabezados = filas.length > 0 ? Object.keys(filas[0]) : [];
  return { encabezados, filas };
}

export type CampoDish = "nombre" | "tags" | "familia" | "dias_permitidos" | "frecuencia_especial" | "activo";

export const CAMPOS_DISH: { campo: CampoDish; etiqueta: string; requerido: boolean }[] = [
  { campo: "nombre", etiqueta: "Nombre del plato", requerido: true },
  { campo: "tags", etiqueta: "Tags (separados por coma)", requerido: false },
  { campo: "familia", etiqueta: "Familia", requerido: false },
  { campo: "dias_permitidos", etiqueta: "Días permitidos (1=lun..5=vie, separados por coma)", requerido: false },
  { campo: "frecuencia_especial", etiqueta: "Frecuencia especial", requerido: false },
  { campo: "activo", etiqueta: "Activo", requerido: false },
];

const FRECUENCIAS_VALIDAS: FrecuenciaEspecial[] = ["ninguna", "semana_por_medio", "una_vez_al_mes"];

function parseBooleano(v: unknown, defecto = true): boolean {
  if (v === "" || v === undefined || v === null) return defecto;
  const s = String(v).trim().toLowerCase();
  if (["si", "sí", "true", "1", "activo", "x", "yes"].includes(s)) return true;
  if (["no", "false", "0", "inactivo"].includes(s)) return false;
  return defecto;
}

function parseTags(v: unknown): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseDiasPermitidos(v: unknown): number[] | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const dias = s
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  return dias.length > 0 ? dias : null;
}

function parseFrecuencia(v: unknown): FrecuenciaEspecial {
  const s = String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
  return (FRECUENCIAS_VALIDAS as string[]).includes(s) ? (s as FrecuenciaEspecial) : "ninguna";
}

/** Convierte filas crudas del Excel en DishInput[], usando el mapeo columna-Excel -> campo elegido por el usuario. */
export function mapearFilasADishes(filas: Record<string, unknown>[], mapeo: Partial<Record<CampoDish, string>>): DishInput[] {
  const out: DishInput[] = [];
  for (const fila of filas) {
    const nombre = mapeo.nombre ? String(fila[mapeo.nombre] ?? "").trim() : "";
    if (!nombre) continue;
    out.push({
      nombre,
      tags: mapeo.tags ? parseTags(fila[mapeo.tags]) : [],
      familia: mapeo.familia ? String(fila[mapeo.familia] ?? "").trim() || null : null,
      dias_permitidos: mapeo.dias_permitidos ? parseDiasPermitidos(fila[mapeo.dias_permitidos]) : null,
      frecuencia_especial: mapeo.frecuencia_especial ? parseFrecuencia(fila[mapeo.frecuencia_especial]) : "ninguna",
      activo: mapeo.activo ? parseBooleano(fila[mapeo.activo]) : true,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Importación "por secciones": algunos catálogos reales no vienen como una
// tabla plana (un plato por fila) sino como columnas paralelas, una por
// categoría — típicamente Proteína | Acompañamiento | Platos completos
// (sin acompañamiento) | Platos de viernes, cada una con su propio largo.
// Se detecta automáticamente por el nombre de los encabezados y se arma el
// catálogo con los tags correctos, sin pedir mapeo manual.
// ─────────────────────────────────────────────────────────────────────────

export interface ColumnaProteina {
  columna: string;
  /** Tag fijo si el encabezado ya dice el tipo (VACUNO, POLLO, LEGUMBRES...).
   * null = encabezado genérico ("Proteína") — el tipo se infiere por plato, palabra por palabra. */
  tagFijo: string | null;
}

export interface DeteccionSecciones {
  detectado: boolean;
  columnasProteina: ColumnaProteina[];
  columnaAcompanamiento?: string;
  columnaPlatosCompletos?: string;
  columnaPlatosViernes?: string;
}

/** Encabezados de columna que ya declaran el tipo de proteína/categoría, sin
 * necesidad de adivinar por el nombre del plato. Cubre tanto un catálogo con
 * una sola columna "Proteína" genérica como uno separado por tipo (formato
 * más preciso, como VACUNO / POLLO / CERDO / PESCADO / LEGUMBRES). */
const COLUMNAS_PROTEINA_CONOCIDAS: { patron: RegExp; tag: string | null }[] = [
  { patron: /^vacuno$/, tag: "proteina:vacuno" },
  { patron: /^pollo$/, tag: "proteina:pollo" },
  { patron: /^cerdo$/, tag: "proteina:cerdo" },
  { patron: /^pescado$/, tag: "proteina:pescado" },
  { patron: /legumbre/, tag: "legumbre" },
  { patron: /fritura/, tag: "fritura_envasada" },
  { patron: /proteina/, tag: null },
];

export function detectarLayoutPorSecciones(encabezados: string[]): DeteccionSecciones {
  const buscar = (pred: (h: string) => boolean) => encabezados.find((h) => pred(normalizar(h)));

  const columnasProteina: ColumnaProteina[] = [];
  for (const h of encabezados) {
    const n = normalizar(h);
    const match = COLUMNAS_PROTEINA_CONOCIDAS.find((m) => m.patron.test(n));
    if (match) columnasProteina.push({ columna: h, tagFijo: match.tag });
  }

  const columnaAcompanamiento = buscar((h) => h.includes("acompan"));
  const columnaPlatosCompletos = buscar((h) => h.includes("plato") && h.includes("completo"));
  const columnaPlatosViernes = buscar((h) => h.includes("viernes"));

  return {
    // con al menos una columna tipo proteína + acompañamiento ya alcanza para reconocer este formato
    detectado: columnasProteina.length > 0 && Boolean(columnaAcompanamiento),
    columnasProteina,
    columnaAcompanamiento,
    columnaPlatosCompletos,
    columnaPlatosViernes,
  };
}

const PISTAS_PROTEINA: { tag: string; palabras: string[] }[] = [
  { tag: "proteina:pollo", palabras: ["pollo"] },
  { tag: "proteina:pescado", palabras: ["pescado", "salmon", "atun", "merluza", "reineta", "jurel"] },
  { tag: "proteina:cerdo", palabras: ["cerdo", "chancho"] },
  {
    tag: "proteina:vacuno",
    palabras: ["vacuno", "carne", "lomo", "posta", "malaya", "strogonoff", "estrogonoff", "chapsui de vacuno"],
  },
];

/** Intenta adivinar el tag proteina:X del nombre del plato. Si no está claro
 * (ej. "Escalopa kyser"), devuelve null — mejor sin tag que un tag erróneo;
 * se puede completar a mano después en el catálogo. */
function inferirTagProteina(nombre: string): string | null {
  const n = normalizar(nombre);
  for (const { tag, palabras } of PISTAS_PROTEINA) {
    if (palabras.some((p) => n.includes(p))) return tag;
  }
  return null;
}

const FAMILIAS_ACOMPANAMIENTO: { familia: string; palabras: string[] }[] = [
  { familia: "arroz", palabras: ["arroz"] },
  { familia: "pure", palabras: ["pure"] },
  { familia: "papas", palabras: ["papa"] },
  { familia: "fideos", palabras: ["fideo", "tallarin", "spaghetti", "espagueti"] },
  { familia: "ensalada", palabras: ["ensalada"] },
];

function inferirFamiliaAcompanamiento(nombre: string): string | null {
  const n = normalizar(nombre);
  for (const { familia, palabras } of FAMILIAS_ACOMPANAMIENTO) {
    if (palabras.some((p) => n.includes(p))) return familia;
  }
  return null;
}

/** Valores no vacíos de una columna, sin duplicados (por texto normalizado), en orden de aparición. */
function valoresColumna(filas: Record<string, unknown>[], columna: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const fila of filas) {
    const v = String(fila[columna] ?? "").trim();
    if (!v || vistos.has(normalizar(v))) continue;
    vistos.add(normalizar(v));
    out.push(v);
  }
  return out;
}

export interface ResultadoImportacionSecciones {
  dishes: DishInput[];
  resumen: {
    proteinas: number;
    acompanamientos: number;
    platosCompletos: number;
    platosViernes: number;
    /** platos que aparecían en Proteína Y en Viernes a la vez — se combinan en un solo plato con ambos usos. */
    combinados: number;
  };
}

export function parseLayoutPorSecciones(
  filas: Record<string, unknown>[],
  deteccion: DeteccionSecciones,
): ResultadoImportacionSecciones {
  // Junta las columnas de proteína (puede ser una sola "Proteína" genérica, o
  // varias ya tipadas: VACUNO, POLLO, CERDO, PESCADO, LEGUMBRES...),
  // combinando por nombre de plato si el mismo apareciera en más de una.
  const proteinasPorNombre = new Map<string, { nombre: string; tags: Set<string> }>();
  for (const col of deteccion.columnasProteina) {
    for (const nombre of valoresColumna(filas, col.columna)) {
      const key = normalizar(nombre);
      if (!proteinasPorNombre.has(key)) proteinasPorNombre.set(key, { nombre, tags: new Set() });
      const tag = col.tagFijo ?? inferirTagProteina(nombre);
      if (tag) proteinasPorNombre.get(key)!.tags.add(tag);
    }
  }
  const proteinas = [...proteinasPorNombre.values()];

  const acompanamientos = deteccion.columnaAcompanamiento ? valoresColumna(filas, deteccion.columnaAcompanamiento) : [];
  const platosCompletos = deteccion.columnaPlatosCompletos ? valoresColumna(filas, deteccion.columnaPlatosCompletos) : [];
  const platosViernes = deteccion.columnaPlatosViernes ? valoresColumna(filas, deteccion.columnaPlatosViernes) : [];

  const viernesKeys = new Set(platosViernes.map(normalizar));
  const proteinaKeys = new Set(proteinas.map((p) => normalizar(p.nombre)));
  let combinados = 0;
  const dishes: DishInput[] = [];

  for (const { nombre, tags } of proteinas) {
    const tagsFinal = [...tags];
    if (viernesKeys.has(normalizar(nombre))) {
      tagsFinal.push("plato_viernes");
      combinados += 1;
    }
    dishes.push({ nombre, tags: tagsFinal, familia: null, dias_permitidos: null, frecuencia_especial: "ninguna", activo: true });
  }

  // Platos de viernes que NO estaban ya en la lista de proteínas (los combinados ya se agregaron arriba).
  for (const nombre of platosViernes) {
    if (proteinaKeys.has(normalizar(nombre))) continue;
    dishes.push({
      nombre,
      tags: ["plato_viernes"],
      familia: null,
      dias_permitidos: null,
      frecuencia_especial: "ninguna",
      activo: true,
    });
  }

  for (const nombre of acompanamientos) {
    dishes.push({
      nombre,
      tags: ["acompañamiento"],
      familia: inferirFamiliaAcompanamiento(nombre),
      dias_permitidos: null,
      frecuencia_especial: "ninguna",
      activo: true,
    });
  }

  for (const nombre of platosCompletos) {
    dishes.push({
      nombre,
      tags: ["plato_completo"],
      familia: null,
      dias_permitidos: null,
      frecuencia_especial: "ninguna",
      activo: true,
    });
  }

  return {
    dishes,
    resumen: {
      proteinas: proteinas.length,
      acompanamientos: acompanamientos.length,
      platosCompletos: platosCompletos.length,
      platosViernes: platosViernes.length,
      combinados,
    },
  };
}

export interface DiaExportMinuta {
  fecha: string;
  diaSemana: number;
  opcion1: string;
  opcion2: string;
}

export interface SemanaExportMinuta {
  indice: number;
  dias: DiaExportMinuta[];
}

function fmtCorta(fechaISO: string): string {
  const d = parseFecha(fechaISO);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Arma el libro Excel de la minuta en formato calendario: una cuadrícula
 * lunes-viernes por semana (encabezado con el día + fecha, una fila para
 * Opción 1 y otra para Opción 2), en vez de un listado plano de filas.
 * Separado de `exportarMinutaExcel` para poder probarlo sin depender de la
 * descarga del navegador. */
export function construirLibroMinutaCalendario(mesLabel: string, semanas: SemanaExportMinuta[]): XLSX.WorkBook {
  const NUM_COLUMNAS = 5;
  const aoa: (string | null)[][] = [];
  const merges: XLSX.Range[] = [];

  aoa.push([mesLabel, null, null, null, null]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NUM_COLUMNAS - 1 } });

  for (const semana of semanas) {
    aoa.push([]); // separador en blanco entre semanas

    const filaTitulo = aoa.length;
    aoa.push([`Semana ${semana.indice}`, null, null, null, null]);
    merges.push({ s: { r: filaTitulo, c: 0 }, e: { r: filaTitulo, c: NUM_COLUMNAS - 1 } });

    aoa.push(semana.dias.map((d) => `${NOMBRES_DIA_CORTO[d.diaSemana] ?? ""} ${fmtCorta(d.fecha)}`));
    aoa.push(semana.dias.map((d) => d.opcion1 || "—"));
    aoa.push(semana.dias.map((d) => d.opcion2 || "—"));
  }

  const hoja = XLSX.utils.aoa_to_sheet(aoa);
  hoja["!merges"] = merges;
  hoja["!cols"] = Array.from({ length: NUM_COLUMNAS }, () => ({ wch: 30 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Minuta");
  return wb;
}

export function exportarMinutaExcel(mesLabel: string, semanas: SemanaExportMinuta[]) {
  const wb = construirLibroMinutaCalendario(mesLabel, semanas);
  XLSX.writeFile(wb, `minuta-${mesLabel.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
}
