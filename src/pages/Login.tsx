import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { iniciarSesion } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await iniciarSesion(email, password);
    if (error) setError(error);
    setEnviando(false);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-fucsia-600 text-xl font-bold text-white">
            M
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Minutas</h1>
          <p className="text-sm text-slate-500">Planificación de menús semanales</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Correo</label>
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.cl"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-fucsia-400 focus:ring-2 focus:ring-fucsia-100"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Contraseña</label>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-fucsia-400 focus:ring-2 focus:ring-fucsia-100"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-fucsia-50 px-3 py-2 text-xs font-medium text-fucsia-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-fucsia-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-fucsia-700 disabled:opacity-60"
          >
            {enviando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          ¿No tienes cuenta? Créala en Authentication → Users de tu proyecto Supabase.
        </p>
      </div>
    </div>
  );
}
