import type { DailySlot, Dish } from "../types/database";
import { NOMBRES_DIA_CORTO } from "../lib/dateUtils";
import { esAcompanamiento, necesitaAcompanamiento } from "../lib/text";

interface Props {
  fecha: string;
  diaSemana: number;
  esViernes: boolean;
  slot1: DailySlot | undefined;
  slot2: DailySlot | undefined;
  dishes: Dish[];
  dishesById: Map<string, Dish>;
  advertencias: Record<number, string[]>;
  onSetPlatosDelDia: (cantidad: 1 | 2) => void;
  onSetSlotDish: (slot: 1 | 2, dishId: string | null) => void;
  onSetAcompanamientoDia: (acompanamientoId: string | null) => void;
  onLimpiarManual: (slot: 1 | 2) => void;
}

function fmtCorta(fechaISO: string): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function DiaCard({
  fecha,
  diaSemana,
  esViernes,
  slot1,
  slot2,
  dishes,
  dishesById,
  advertencias,
  onSetPlatosDelDia,
  onSetSlotDish,
  onSetAcompanamientoDia,
  onLimpiarManual,
}: Props) {
  const platosDelDia = slot1?.platos_del_dia ?? (esViernes ? 1 : 2);
  const dishesOrdenados = [...dishes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const poolViernes = dishesOrdenados.filter((d) => d.tags.some((t) => t.toLowerCase() === "plato_viernes"));
  const poolAcompanamiento = dishesOrdenados.filter((d) => esAcompanamiento(d.tags));

  const dish1 = slot1?.dish_id ? dishesById.get(slot1.dish_id) : undefined;
  const dish2 = slot2?.dish_id ? dishesById.get(slot2.dish_id) : undefined;
  const acompanamientoIdDelDia = slot1?.acompanamiento_id ?? slot2?.acompanamiento_id ?? null;
  const acompanamientoDia = acompanamientoIdDelDia ? dishesById.get(acompanamientoIdDelDia) : undefined;

  return (
    <div className="flex min-w-[220px] flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fucsia-600">{NOMBRES_DIA_CORTO[diaSemana]}</p>
          <p className="text-sm font-medium text-slate-800">{fmtCorta(fecha)}</p>
        </div>
        {!esViernes && (
          <div className="flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-medium">
            <button
              onClick={() => onSetPlatosDelDia(1)}
              className={`px-2 py-1 ${platosDelDia === 1 ? "bg-fucsia-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              1
            </button>
            <button
              onClick={() => onSetPlatosDelDia(2)}
              className={`px-2 py-1 ${platosDelDia === 2 ? "bg-fucsia-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
            >
              2
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <SlotSelector
          etiqueta="Opción 1"
          dailySlot={slot1}
          opciones={esViernes ? poolViernes : dishesOrdenados}
          advertencias={advertencias[1] ?? []}
          acompanamiento={dish1 && necesitaAcompanamiento(dish1.tags) ? acompanamientoDia : undefined}
          onSet={(id) => onSetSlotDish(1, id)}
          onLimpiarManual={() => onLimpiarManual(1)}
        />
        {platosDelDia === 2 && (
          <SlotSelector
            etiqueta="Opción 2"
            dailySlot={slot2}
            opciones={dishesOrdenados}
            advertencias={advertencias[2] ?? []}
            acompanamiento={dish2 && necesitaAcompanamiento(dish2.tags) ? acompanamientoDia : undefined}
            onSet={(id) => onSetSlotDish(2, id)}
            onLimpiarManual={() => onLimpiarManual(2)}
          />
        )}

        <div>
          <span className="text-[11px] font-medium text-slate-400">Acompañamiento del día</span>
          <select
            value={acompanamientoIdDelDia ?? ""}
            onChange={(e) => onSetAcompanamientoDia(e.target.value || null)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-fucsia-400"
          >
            <option value="">— sin acompañamiento —</option>
            {poolAcompanamiento.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.activo}>
                {d.nombre}
                {!d.activo ? " (inactivo)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-slate-400">Se combina con Opción 1{platosDelDia === 2 ? " y 2" : ""}, salvo que sea plato completo o legumbre.</p>
        </div>
      </div>
    </div>
  );
}

function SlotSelector({
  etiqueta,
  dailySlot,
  opciones,
  advertencias,
  acompanamiento,
  onSet,
  onLimpiarManual,
}: {
  etiqueta: string;
  dailySlot: DailySlot | undefined;
  opciones: Dish[];
  advertencias: string[];
  /** Si el plato de este slot necesita acompañamiento y hay uno fijado ese día, se muestra combinado. */
  acompanamiento: Dish | undefined;
  onSet: (id: string | null) => void;
  onLimpiarManual: () => void;
}) {
  const conflicto = dailySlot?.conflicto && !dailySlot.es_manual;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">{etiqueta}</span>
        <div className="flex items-center gap-1">
          {dailySlot?.es_manual && (
            <button
              onClick={onLimpiarManual}
              title="Quitar edición manual (se regenerará al aleatorizar)"
              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200"
            >
              manual
            </button>
          )}
          {conflicto && (
            <span title={dailySlot?.conflicto_detalle ?? ""} className="rounded-full bg-fucsia-100 px-1.5 py-0.5 text-[10px] font-medium text-fucsia-700">
              conflicto
            </span>
          )}
        </div>
      </div>
      <select
        value={dailySlot?.dish_id ?? ""}
        onChange={(e) => onSet(e.target.value || null)}
        className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-fucsia-400 ${
          advertencias.length > 0 ? "border-fucsia-300 bg-fucsia-50/40" : "border-slate-200"
        }`}
      >
        <option value="">— sin plato —</option>
        {opciones.map((d) => (
          <option key={d.id} value={d.id} disabled={!d.activo}>
            {d.nombre}
            {!d.activo ? " (inactivo)" : ""}
          </option>
        ))}
      </select>
      {acompanamiento && <p className="mt-1 text-[11px] text-verde-700">+ {acompanamiento.nombre}</p>}
      {advertencias.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[10px] text-fucsia-700">
          {advertencias.map((a, i) => (
            <li key={i}>⚠ {a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
