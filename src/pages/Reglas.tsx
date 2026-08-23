import { useState } from "react";
import { useRules } from "../hooks/useRules";
import { useDishes } from "../hooks/useDishes";
import { RULE_DEFS, RULE_TYPES_ORDENADOS, tagsDisponibles } from "../lib/rules";
import type { Dish, RandomizationRule } from "../types/database";
import { PantallaCargando } from "../components/PantallaCargando";
import { DiasPicker } from "../components/DiasPicker";
import { ExcepcionModal } from "../components/ExcepcionModal";

export function Reglas() {
  const { rules, exceptions, cargando, actualizarRegla, crearInstanciaRegla, eliminarRegla, agregarExcepcion, eliminarExcepcion } =
    useRules();
  const { dishes } = useDishes();
  const [excepcionPara, setExcepcionPara] = useState<RandomizationRule | null>(null);

  if (cargando) return <PantallaCargando />;

  const tagsConocidos = tagsDisponibles(dishes.map((d) => d.tags));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold text-slate-900">Reglas de aleatorización</h1>
      <p className="mt-1 text-sm text-slate-500">
        Actívalas, edítalas o desactívalas. Para pausar una regla solo una semana puntual, usa "+ excepción" en vez de
        desactivarla del todo.
      </p>

      <div className="mt-6 space-y-6">
        {RULE_TYPES_ORDENADOS.map((tipo) => {
          const def = RULE_DEFS[tipo];
          const instancias = rules.filter((r) => r.tipo === tipo);
          return (
            <section key={tipo} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{def.etiqueta}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{def.descripcion}</p>
                </div>
                {def.multiInstancia && (
                  <button
                    onClick={() => crearInstanciaRegla(tipo, def.parametrosDefault)}
                    className="shrink-0 rounded-lg border border-fucsia-200 px-2.5 py-1 text-xs font-medium text-fucsia-700 hover:bg-fucsia-50"
                  >
                    + Agregar
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {instancias.length === 0 && <p className="text-xs text-slate-400">Sin instancias configuradas.</p>}
                {instancias.map((regla) => (
                  <FilaRegla
                    key={regla.id}
                    regla={regla}
                    tagsConocidos={tagsConocidos}
                    dishes={dishes}
                    excepciones={exceptions.filter((e) => e.rule_id === regla.id)}
                    onActualizar={(cambios) => actualizarRegla(regla.id, cambios)}
                    onEliminar={def.multiInstancia ? () => eliminarRegla(regla.id) : undefined}
                    onExcepcion={() => setExcepcionPara(regla)}
                    onQuitarExcepcion={eliminarExcepcion}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {excepcionPara && (
        <ExcepcionModal
          etiquetaRegla={RULE_DEFS[excepcionPara.tipo].etiqueta}
          onCerrar={() => setExcepcionPara(null)}
          onGuardar={(semana, motivo) => agregarExcepcion(excepcionPara.id, semana, motivo)}
        />
      )}
    </div>
  );
}

/** Compara dos objetos de parámetros ignorando el orden de las claves
 * (jsonb no garantiza preservar el orden de inserción). */
function mismosParametros(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const normalizar = (o: Record<string, unknown>) =>
    JSON.stringify(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k]]),
    );
  return normalizar(a) === normalizar(b);
}

function FilaRegla({
  regla,
  tagsConocidos,
  dishes,
  excepciones,
  onActualizar,
  onEliminar,
  onExcepcion,
  onQuitarExcepcion,
}: {
  regla: RandomizationRule;
  tagsConocidos: string[];
  dishes: Dish[];
  excepciones: { id: string; semana_inicio: string; motivo: string | null }[];
  onActualizar: (cambios: Partial<Pick<RandomizationRule, "activa" | "parametros">>) => void;
  onEliminar?: () => void;
  onExcepcion: () => void;
  onQuitarExcepcion: (id: string) => void;
}) {
  const def = RULE_DEFS[regla.tipo];
  const [params, setParams] = useState(regla.parametros as Record<string, any>);
  const sucio = !mismosParametros(params, regla.parametros);

  const platoSeleccionado = regla.tipo === "plato_obligatorio_frecuencia" ? dishes.find((d) => d.id === params.dish_id) : undefined;

  return (
    <div className={`rounded-lg border p-3 ${regla.activa ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onActualizar({ activa: !regla.activa })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${regla.activa ? "bg-fucsia-600" : "bg-slate-300"}`}
          aria-label="Activar/desactivar regla"
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              regla.activa ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>

        <div className="flex flex-1 flex-wrap items-center gap-3">
          {def.campos.map((campo) => (
            <div key={campo.nombre} className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">{campo.etiqueta}:</span>
              {campo.tipo === "numero" && (
                <input
                  type="number"
                  min={campo.min}
                  max={campo.max}
                  value={params[campo.nombre] ?? ""}
                  onChange={(e) => setParams({ ...params, [campo.nombre]: Number(e.target.value) })}
                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-fucsia-400"
                />
              )}
              {campo.tipo === "texto" && (
                <input
                  value={params[campo.nombre] ?? ""}
                  placeholder={campo.placeholder}
                  onChange={(e) => setParams({ ...params, [campo.nombre]: e.target.value })}
                  className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-fucsia-400"
                />
              )}
              {campo.tipo === "tag" && (
                <input
                  value={params[campo.nombre] ?? ""}
                  placeholder={campo.placeholder}
                  onChange={(e) => setParams({ ...params, [campo.nombre]: e.target.value })}
                  list={`tags-conocidos-${regla.id}`}
                  className="w-40 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-fucsia-400"
                />
              )}
              {campo.tipo === "tag" && (
                <datalist id={`tags-conocidos-${regla.id}`}>
                  {tagsConocidos.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              )}
              {campo.tipo === "dias" && (
                <DiasPicker
                  value={params[campo.nombre] ?? null}
                  onChange={(v) => setParams({ ...params, [campo.nombre]: v ?? [] })}
                  size="xs"
                />
              )}
              {campo.tipo === "plato" && (
                <select
                  value={params[campo.nombre] ?? ""}
                  onChange={(e) => setParams({ ...params, [campo.nombre]: e.target.value })}
                  className="w-56 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-fucsia-400"
                >
                  <option value="">— elegir plato —</option>
                  {dishes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {sucio && (
            <button
              onClick={() => onActualizar({ parametros: params })}
              className="rounded-md bg-verde-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-verde-700"
            >
              Guardar
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onExcepcion} className="text-xs font-medium text-fucsia-600 hover:underline">
            + excepción
          </button>
          {onEliminar && (
            <button onClick={onEliminar} className="text-xs font-medium text-slate-400 hover:text-fucsia-600 hover:underline">
              Eliminar
            </button>
          )}
        </div>
      </div>

      {platoSeleccionado && platoSeleccionado.frecuencia_especial === "ninguna" && (
        <p className="mt-2 text-xs text-fucsia-600">
          ⚠ "{platoSeleccionado.nombre}" no tiene "frecuencia especial" configurada en el Catálogo — marca ahí "semana por
          medio" o "una vez al mes" para que esta regla pueda asegurar su aparición.
        </p>
      )}

      {excepciones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {excepciones.map((ex) => (
            <span key={ex.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              Semana {ex.semana_inicio}
              {ex.motivo && ` · ${ex.motivo}`}
              <button onClick={() => onQuitarExcepcion(ex.id)} className="ml-0.5 text-slate-400 hover:text-fucsia-600">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
