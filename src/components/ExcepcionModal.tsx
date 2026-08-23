import { useState } from "react";
import { diaSemanaISO, formatFecha, parseFecha } from "../lib/dateUtils";

interface Props {
  etiquetaRegla: string;
  onCerrar: () => void;
  onGuardar: (semanaInicioISO: string, motivo: string) => Promise<void>;
}

function lunesDeLaSemana(fechaISO: string): string {
  const d = parseFecha(fechaISO);
  const dow = diaSemanaISO(d);
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return formatFecha(d);
}

export function ExcepcionModal({ etiquetaRegla, onCerrar, onGuardar }: Props) {
  const [fecha, setFecha] = useState(formatFecha(new Date()));
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(lunesDeLaSemana(fecha), motivo);
      onCerrar();
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("duplicate")
          ? "Ya existe una excepción para esa semana."
          : "No se pudo guardar la excepción.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">Excepción puntual</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pausa la regla <span className="font-medium text-slate-700">"{etiquetaRegla}"</span> solo para la semana que
          contenga la fecha elegida.
        </p>

        <div className="mt-4">
          <label className="text-xs font-medium text-slate-600">Cualquier fecha de esa semana</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-fucsia-400"
          />
          <p className="mt-1 text-[11px] text-slate-400">Semana del lunes {lunesDeLaSemana(fecha)}</p>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-slate-600">Motivo (opcional)</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ej: semana de aniversario"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-fucsia-400"
          />
        </div>

        {error && <p className="mt-3 rounded-lg bg-fucsia-50 px-3 py-2 text-xs font-medium text-fucsia-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={guardando}
            className="rounded-lg bg-fucsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-fucsia-700 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Agregar excepción"}
          </button>
        </div>
      </div>
    </div>
  );
}
