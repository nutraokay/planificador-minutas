import { useState } from "react";
import {
  CAMPOS_DISH,
  detectarLayoutPorSecciones,
  leerHojaExcel,
  mapearFilasADishes,
  parseLayoutPorSecciones,
  type CampoDish,
  type DeteccionSecciones,
} from "../lib/excel";
import type { DishInput } from "../types/database";

interface Props {
  onCerrar: () => void;
  onImportar: (dishes: DishInput[]) => Promise<void>;
}

export function ImportarExcelModal({ onCerrar, onImportar }: Props) {
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<Partial<Record<CampoDish, string>>>({});
  const [deteccion, setDeteccion] = useState<DeteccionSecciones | null>(null);
  const [usarManual, setUsarManual] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNombreArchivo(file.name);
    setUsarManual(false);
    try {
      const { encabezados, filas } = await leerHojaExcel(file);
      setEncabezados(encabezados);
      setFilas(filas);

      const deteccionLayout = detectarLayoutPorSecciones(encabezados);
      setDeteccion(deteccionLayout);

      // Auto-mapeo por nombre de columna aproximado (fallback si no se detecta el layout por secciones).
      const auto: Partial<Record<CampoDish, string>> = {};
      for (const campo of CAMPOS_DISH) {
        const encontrado = encabezados.find((h) => h.toLowerCase().includes(campo.campo.replace("_", " ").split(" ")[0]));
        if (encontrado) auto[campo.campo] = encontrado;
      }
      setMapeo(auto);
    } catch {
      setError("No se pudo leer el archivo. Verifica que sea un .xlsx, .xls o .csv válido.");
    }
  }

  const modoSecciones = deteccion?.detectado && !usarManual;
  const resultadoSecciones = modoSecciones ? parseLayoutPorSecciones(filas, deteccion!) : null;

  const previaManual = mapeo.nombre ? mapearFilasADishes(filas.slice(0, 5), mapeo) : [];
  const totalManual = mapeo.nombre ? mapearFilasADishes(filas, mapeo).length : 0;

  const dishesAImportar = modoSecciones ? resultadoSecciones!.dishes : mapearFilasADishes(filas, mapeo);
  const totalAImportar = modoSecciones ? resultadoSecciones!.dishes.length : totalManual;
  const previa = modoSecciones ? resultadoSecciones!.dishes.slice(0, 8) : previaManual;
  const puedeImportar = modoSecciones ? totalAImportar > 0 : Boolean(mapeo.nombre) && totalManual > 0;

  async function confirmar() {
    if (!puedeImportar) return;
    setImportando(true);
    setError(null);
    try {
      await onImportar(dishesAImportar);
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Importar platos desde Excel</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleArchivo}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-fucsia-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-fucsia-700 hover:file:bg-fucsia-100"
          />
          {nombreArchivo && <p className="mt-1 text-xs text-slate-400">{nombreArchivo} — {filas.length} filas detectadas</p>}
        </div>

        {modoSecciones && resultadoSecciones && (
          <div className="mt-5 space-y-3">
            <div className="rounded-lg bg-verde-50 px-3 py-2 text-xs text-verde-800">
              Detecté un catálogo organizado por categorías (Proteína / Acompañamiento / Platos completos / Platos de
              viernes) — no hace falta mapear columnas, ya se etiquetó automáticamente.
              {resultadoSecciones.resumen.combinados > 0 && (
                <>
                  {" "}
                  {resultadoSecciones.resumen.combinados} plato(s) aparecían en Proteína y en Viernes a la vez — se
                  combinaron en un solo plato con ambos usos.
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
              <Stat etiqueta="Proteínas" valor={resultadoSecciones.resumen.proteinas} />
              <Stat etiqueta="Acompañamientos" valor={resultadoSecciones.resumen.acompanamientos} />
              <Stat etiqueta="Platos completos" valor={resultadoSecciones.resumen.platosCompletos} />
              <Stat etiqueta="Platos de viernes" valor={resultadoSecciones.resumen.platosViernes} />
            </div>
            <button
              onClick={() => setUsarManual(true)}
              className="text-xs font-medium text-slate-400 hover:text-fucsia-600 hover:underline"
            >
              ¿No es correcto? Mapear columnas a mano en su lugar
            </button>
          </div>
        )}

        {!modoSecciones && encabezados.length > 0 && (
          <div className="mt-5 space-y-3">
            {deteccion && !deteccion.detectado && (
              <p className="text-xs text-slate-400">
                No detecté un catálogo por categorías en este archivo — mapea las columnas manualmente:
              </p>
            )}
            <p className="text-xs font-medium text-slate-500">Mapeo de columnas</p>
            {CAMPOS_DISH.map((campo) => (
              <div key={campo.campo} className="flex items-center gap-3">
                <label className="w-64 shrink-0 text-sm text-slate-700">
                  {campo.etiqueta}
                  {campo.requerido && <span className="text-fucsia-600"> *</span>}
                </label>
                <select
                  value={mapeo[campo.campo] ?? ""}
                  onChange={(e) => setMapeo((m) => ({ ...m, [campo.campo]: e.target.value || undefined }))}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-fucsia-400"
                >
                  <option value="">— No mapear —</option>
                  {encabezados.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {previa.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-medium text-slate-500">Previsualización ({totalAImportar} platos válidos)</p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Nombre</th>
                    <th className="px-2 py-1.5">Tags</th>
                    <th className="px-2 py-1.5">Familia</th>
                    <th className="px-2 py-1.5">Días</th>
                    <th className="px-2 py-1.5">Frecuencia</th>
                    <th className="px-2 py-1.5">Activo</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.map((d, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{d.nombre}</td>
                      <td className="px-2 py-1.5">{d.tags.join(", ")}</td>
                      <td className="px-2 py-1.5">{d.familia ?? "—"}</td>
                      <td className="px-2 py-1.5">{d.dias_permitidos?.join(",") ?? "Todos"}</td>
                      <td className="px-2 py-1.5">{d.frecuencia_especial}</td>
                      <td className="px-2 py-1.5">{d.activo ? "Sí" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-fucsia-50 px-3 py-2 text-xs font-medium text-fucsia-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!puedeImportar || importando}
            className="rounded-lg bg-fucsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fucsia-700 disabled:opacity-50"
          >
            {importando ? "Importando…" : `Importar ${totalAImportar} platos`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
      <div className="text-base font-semibold text-slate-800">{valor}</div>
      <div className="text-[11px] text-slate-500">{etiqueta}</div>
    </div>
  );
}
