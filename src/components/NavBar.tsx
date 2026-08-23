import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/", label: "Minuta mensual", fin: true },
  { to: "/catalogo", label: "Catálogo de platos" },
  { to: "/reglas", label: "Reglas" },
];

export function NavBar() {
  const { cerrarSesion, user } = useAuth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fucsia-600 text-sm font-bold text-white">
            M
          </div>
          <span className="text-sm font-semibold text-slate-900">Minutas</span>
        </div>

        <nav className="flex flex-1 items-center gap-1">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.fin}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-fucsia-50 text-fucsia-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-400 sm:inline">{user?.email}</span>
          <button
            onClick={() => cerrarSesion()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
