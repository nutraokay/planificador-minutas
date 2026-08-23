import type { DailySlot, Dish } from "../types/database";
import { NOMBRES_DIA_CORTO } from "../lib/dateUtils";

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
  onLimpiarManual,
}: Props) {
  const platosDelDia = slot1?.platos_del_dia ?? (esViernes ? 1 : 2);
  const dishesOrdenados = [...dishes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const poolViernes = dishesOrdenados.filter((d) => d.tags.some((t) => t.toLowerCase() === "plato_viernes"));

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
          dishesById={dishesById}
          advertencias={advertencias[1] ?? []}
          onSet={(id) => onSetSlotDish(1, id)}
          onLimpiarManual={() => onLimpiarManual(1)}
        />
        {platosDelDia === 2 && (
          <SlotSelector
            etiqueta="Opción 2"
            dailySlot={slot2}
            opciones={dishesOrdenados}
            dishesById={dishesById}
            advertencias={advertencias[2] ?? []}
            onSet={(id) => onSetSlotDish(2, id)}
            onLimpiarManual={() => onLimpiarManual(2)}
          />
        )}
      </div>
    </div>
  );
}

function SlotSelector({
  etiqueta,
  dailySlot,
  opciones,
  advertencias,
  onSet,
  onLimpiarManual,
}: {
  etiqueta: string;
  dailySlot: DailySlot | undefined;
  opciones: Dish[];
  dishesById: Map<string, Dish>;
  advertencias: string[];
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
