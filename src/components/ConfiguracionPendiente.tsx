export function ConfiguracionPendiente() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-fucsia-100 text-lg font-bold text-fucsia-700">
          !
        </div>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Falta configurar Supabase</h1>
        <p className="mt-2 text-sm text-slate-600">
          No encontramos <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code>{" "}
          ni <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            Copia <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.example</code> a{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env</code>.
          </li>
          <li>Completa la URL y la anon key de tu proyecto Supabase (Project Settings → API).</li>
          <li>
            Corre <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">supabase/schema.sql</code> en el SQL
            Editor de tu proyecto.
          </li>
          <li>Crea tu usuario en Authentication → Users (marca "Auto Confirm User").</li>
          <li>Reinicia el servidor de desarrollo.</li>
        </ol>
      </div>
    </div>
  );
}
