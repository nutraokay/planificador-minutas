import { Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { Minuta } from "./pages/Minuta";
import { CatalogoPlatos } from "./pages/CatalogoPlatos";
import { Reglas } from "./pages/Reglas";
import { Login } from "./pages/Login";
import { ConfiguracionPendiente } from "./components/ConfiguracionPendiente";
import { PantallaCargando } from "./components/PantallaCargando";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { supabaseConfigurado } from "./lib/supabaseClient";

function AppShell() {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Routes>
        <Route path="/" element={<Minuta />} />
        <Route path="/catalogo" element={<CatalogoPlatos />} />
        <Route path="/reglas" element={<Reglas />} />
      </Routes>
    </div>
  );
}

function AuthGate() {
  const { session, cargando } = useAuth();

  if (cargando) return <PantallaCargando />;
  if (!session) return <Login />;

  return <AppShell />;
}

function App() {
  if (!supabaseConfigurado) return <ConfiguracionPendiente />;

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
