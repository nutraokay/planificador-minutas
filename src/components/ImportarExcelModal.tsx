import { useState } from "react";
import { CAMPOS_DISH, leerHojaExcel, mapearFilasADishes, type CampoDish } from "../lib/excel";
import type { DishInput } from "../types/database";

interface Props {
  onCerrar: () => void;
  onImportar: (dishes: DishInput[]) => Promise<void>;
}

export function ImportarExcelModal({ onCerrar, onImportar }: Props) {
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<Partial<Record<CampoDish, string>>>({});
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNombreArchivo(file.name);
    try {
      const { encabezados, filas } = await leerHojaExcel(file);
      setEncabezados(encabezados);
      setFilas(filas);

      // Auto-mapeo por nombre de columna aproximado.
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

  const previa = mapeo.nombre ? mapearFilasADishes(filas.slice(0, 5), mapeo) : [];
  const totalValidas = mapeo.nombre ? mapearFilasADishes(filas, mapeo).length : 0;

  async function confirmar() {
    if (!mapeo.nombre) return;
    setImportando(true);
    setError(null);
    try {
      const dishes = mapearFilasADishes(filas, mapeo);
      await onImportar(dishes);
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

        {encabezados.length > 0 && (
          <div className="mt-5 space-y-3">
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
            <p className="text-xs font-medium text-slate-500">Previsualización ({totalValidas} platos válidos)</p>
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
            disabled={!mapeo.nombre || totalValidas === 0 || importando}
            className="rounded-lg bg-fucsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fucsia-700 disabled:opacity-50"
          >
            {importando ? "Importando…" : `Importar ${totalValidas} platos`}
          </button>
        </div>
      </div>
    </div>
  );
}
