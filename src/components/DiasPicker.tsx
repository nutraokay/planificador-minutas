import { NOMBRES_DIA_CORTO } from "../lib/dateUtils";

const DIAS = [1, 2, 3, 4, 5];

interface Props {
  /** null = sin restricción (todos los días). */
  value: number[] | null;
  onChange: (value: number[] | null) => void;
  size?: "sm" | "xs";
}

/** Selector de días hábiles (L-V) con opción "Todos" (= sin restricción, null). */
export function DiasPicker({ value, onChange, size = "sm" }: Props) {
  const sinRestriccion = value === null || value.length === 0;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-md font-medium transition-colors ${pad} ${
          sinRestriccion ? "bg-fucsia-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
        }`}
      >
        Todos
      </button>
      {DIAS.map((d) => {
        const activo = !sinRestriccion && value!.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              const base = sinRestriccion ? [] : value!;
              const next = activo ? base.filter((x) => x !== d) : [...base, d].sort();
              onChange(next.length === 0 ? null : next);
            }}
            className={`rounded-md font-medium transition-colors ${pad} ${
              activo ? "bg-fucsia-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {NOMBRES_DIA_CORTO[d]}
          </button>
        );
      })}
    </div>
  );
}
