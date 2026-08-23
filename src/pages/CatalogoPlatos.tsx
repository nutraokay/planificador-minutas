import { useState } from "react";
import { useDishes } from "../hooks/useDishes";
import type { Dish, DishInput, FrecuenciaEspecial } from "../types/database";
import { DiasPicker } from "../components/DiasPicker";
import { ImportarExcelModal } from "../components/ImportarExcelModal";
import { PantallaCargando } from "../components/PantallaCargando";

const FRECUENCIAS: { valor: FrecuenciaEspecial; etiqueta: string }[] = [
  { valor: "ninguna", etiqueta: "Ninguna" },
  { valor: "semana_por_medio", etiqueta: "Semana por medio" },
  { valor: "una_vez_al_mes", etiqueta: "Una vez al mes" },
];

const DISH_VACIO: DishInput = {
  nombre: "",
  tags: [],
  familia: null,
  dias_permitidos: null,
  frecuencia_especial: "ninguna",
  activo: true,
};

export function CatalogoPlatos() {
  const { dishes, cargando, crear, crearVarios, actualizar, eliminar } = useDishes();
  const [mostrarImport, setMostrarImport] = useState(false);
  const [nuevo, setNuevo] = useState<DishInput | null>(null);
  const [filtro, setFiltro] = useState("");
  const [soloActivos, setSoloActivos] = useState(false);

  if (cargando) return <PantallaCargando />;

  const visibles = dishes.filter((d) => {
    if (soloActivos && !d.activo) return false;
    if (filtro && !d.nombre.toLowerCase().includes(filtro.toLowerCase())) return false;
    return true;
  });

  async function guardarNuevo() {
    if (!nuevo || !nuevo.nombre.trim()) return;
    await crear(nuevo);
    setNuevo(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Catálogo de platos</h1>
          <p className="text-sm text-slate-500">{dishes.length} platos · {dishes.filter((d) => d.activo).length} activos</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarImport(true)}
            className="rounded-lg border border-fucsia-200 bg-white px-3 py-2 text-sm font-medium text-fucsia-700 hover:bg-fucsia-50"
          >
            Importar desde Excel
          </button>
          <button
            onClick={() => setNuevo(DISH_VACIO)}
            className="rounded-lg bg-fucsia-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fucsia-700"
          >
            + Nuevo plato
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar plato…"
          className="w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-fucsia-400"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} className="accent-fucsia-600" />
          Solo activos
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Nombre</th>
              <th className="px-3 py-2.5">Tags</th>
              <th className="px-3 py-2.5">Familia</th>
              <th className="px-3 py-2.5">Días permitidos</th>
              <th className="px-3 py-2.5">Frecuencia especial</th>
              <th className="px-3 py-2.5">Activo</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {nuevo && (
              <FilaEdicion
                dish={nuevo}
                onChange={setNuevo}
                onGuardar={guardarNuevo}
                onCancelar={() => setNuevo(null)}
                esNuevo
              />
            )}
            {visibles.map((d) => (
              <FilaPlato key={d.id} dish={d} onGuardar={(cambios) => actualizar(d.id, cambios)} onEliminar={() => eliminar(d.id)} />
            ))}
            {visibles.length === 0 && !nuevo && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin platos todavía. Importa tu catálogo desde Excel o agrega uno nuevo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mostrarImport && (
        <ImportarExcelModal onCerrar={() => setMostrarImport(false)} onImportar={(dishes) => crearVarios(dishes)} />
      )}
    </div>
  );
}

function FilaPlato({ dish, onGuardar, onEliminar }: { dish: Dish; onGuardar: (c: Partial<DishInput>) => void; onEliminar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<DishInput>(dish);

  if (editando) {
    return (
      <FilaEdicion
        dish={valor}
        onChange={setValor}
        onGuardar={() => {
          onGuardar(valor);
          setEditando(false);
        }}
        onCancelar={() => {
          setValor(dish);
          setEditando(false);
        }}
      />
    );
  }

  return (
    <tr className={`border-t border-slate-100 ${!dish.activo ? "opacity-50" : ""}`}>
      <td className="px-3 py-2 font-medium text-slate-800">{dish.nombre}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {dish.tags.map((t) => (
            <span key={t} className="rounded-full bg-fucsia-50 px-2 py-0.5 text-[11px] font-medium text-fucsia-700">
              {t}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-slate-500">{dish.familia ?? "—"}</td>
      <td className="px-3 py-2 text-slate-500">
        {dish.dias_permitidos && dish.dias_permitidos.length > 0 ? dish.dias_permitidos.join(", ") : "Todos"}
      </td>
      <td className="px-3 py-2 text-slate-500">{FRECUENCIAS.find((f) => f.valor === dish.frecuencia_especial)?.etiqueta}</td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            dish.activo ? "bg-verde-100 text-verde-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {dish.activo ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => setEditando(true)} className="mr-2 text-xs font-medium text-fucsia-600 hover:underline">
          Editar
        </button>
        <button onClick={onEliminar} className="text-xs font-medium text-slate-400 hover:text-fucsia-600 hover:underline">
          Eliminar
        </button>
      </td>
    </tr>
  );
}

function FilaEdicion({
  dish,
  onChange,
  onGuardar,
  onCancelar,
  esNuevo,
}: {
  dish: DishInput;
  onChange: (d: DishInput) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  esNuevo?: boolean;
}) {
  const [tagsTexto, setTagsTexto] = useState(dish.tags.join(", "));

  return (
    <tr className="border-t border-slate-100 bg-fucsia-50/40">
      <td className="px-3 py-2">
        <input
          autoFocus={esNuevo}
          value={dish.nombre}
          onChange={(e) => onChange({ ...dish, nombre: e.target.value })}
          placeholder="Nombre del plato"
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-fucsia-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={tagsTexto}
          onChange={(e) => {
            setTagsTexto(e.target.value);
            onChange({ ...dish, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) });
          }}
          placeholder="legumbre, proteina:pollo"
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-fucsia-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={dish.familia ?? ""}
          onChange={(e) => onChange({ ...dish, familia: e.target.value || null })}
          placeholder="ej: arroz"
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-fucsia-400"
        />
      </td>
      <td className="px-3 py-2">
        <DiasPicker value={dish.dias_permitidos} onChange={(v) => onChange({ ...dish, dias_permitidos: v })} size="xs" />
      </td>
      <td className="px-3 py-2">
        <select
          value={dish.frecuencia_especial}
          onChange={(e) => onChange({ ...dish, frecuencia_especial: e.target.value as FrecuenciaEspecial })}
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-fucsia-400"
        >
          {FRECUENCIAS.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.etiqueta}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input type="checkbox" checked={dish.activo} onChange={(e) => onChange({ ...dish, activo: e.target.checked })} className="accent-fucsia-600" />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button onClick={onGuardar} className="mr-2 text-xs font-semibold text-verde-700 hover:underline">
          Guardar
        </button>
        <button onClick={onCancelar} className="text-xs font-medium text-slate-400 hover:underline">
          Cancelar
        </button>
      </td>
    </tr>
  );
}
