import type { ResultadoSemana } from "../lib/verification";

interface Props {
  resultados: ResultadoSemana[];
}

export function VerificationPanel({ resultados }: Props) {
  if (resultados.length === 0) return null;

  const columnas = resultados[0].resultados.map((r) => ({ ruleId: r.ruleId, etiqueta: r.etiqueta }));

  if (columnas.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No hay reglas activas para verificar. Actívalas en la sección "Reglas".
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Verificación del menú</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">Semana</th>
              {columnas.map((c) => (
                <th key={c.ruleId} className="px-2 py-1.5 text-center font-medium">
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultados.map((semana) => (
              <tr key={semana.indice} className="border-t border-slate-100">
                <td className="px-2 py-2 font-medium text-slate-700">{semana.etiqueta}</td>
                {semana.resultados.map((r) => (
                  <td key={r.ruleId} className="px-2 py-2 text-center">
                    <Estado estado={r.estado} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-3">
        {resultados.map((semana) => {
          const fallas = semana.resultados.filter((r) => r.estado === "incumple");
          if (fallas.length === 0) return null;
          return (
            <div key={semana.indice} className="rounded-lg bg-fucsia-50/60 p-3">
              <p className="text-xs font-semibold text-fucsia-800">{semana.etiqueta}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-fucsia-900/80">
                {fallas.flatMap((r) => r.detalles.map((d, i) => <li key={`${r.ruleId}-${i}`}>{d}</li>))}
              </ul>
            </div>
          );
        })}
        {resultados.every((s) => s.resultados.every((r) => r.estado !== "incumple")) && (
          <p className="text-xs font-medium text-verde-700">Sin incumplimientos detectados en el mes. ✓</p>
        )}
      </div>
    </div>
  );
}

function Estado({ estado }: { estado: "cumple" | "incumple" | "excepcionada" }) {
  if (estado === "excepcionada") return <span className="text-slate-300">–</span>;
  if (estado === "cumple") return <span className="font-semibold text-verde-600">✓</span>;
  return <span className="font-semibold text-fucsia-600">✗</span>;
}
