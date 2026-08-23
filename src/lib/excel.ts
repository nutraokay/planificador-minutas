import * as XLSX from "xlsx";
import type { DishInput, FrecuenciaEspecial } from "../types/database";
import { NOMBRES_DIA } from "./dateUtils";

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

export interface FilaExportMinuta {
  fecha: string;
  diaSemana: number;
  opcion1: string;
  opcion2: string;
}

export function exportarMinutaExcel(mesLabel: string, filas: FilaExportMinuta[]) {
  const data = filas.map((f) => ({
    Fecha: f.fecha,
    Día: NOMBRES_DIA[f.diaSemana] ?? "",
    "Opción 1": f.opcion1,
    "Opción 2": f.opcion2,
  }));
  const hoja = XLSX.utils.json_to_sheet(data);
  hoja["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 32 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, "Minuta");
  XLSX.writeFile(wb, `minuta-${mesLabel.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
}
