import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * true cuando las credenciales de Supabase no están configuradas (por ejemplo,
 * en un clon fresco del repo antes de crear el archivo .env). La app usa esto
 * para mostrar una pantalla de configuración en vez de fallar en blanco.
 */
export const supabaseConfigurado = Boolean(supabaseUrl && supabaseAnonKey);

// Cuando falta configuración usamos valores dummy para que createClient no
// lance una excepción en el import — la app nunca llega a usarlos porque
// muestra la pantalla de "falta configuración" antes de hacer cualquier
// llamada real (ver src/components/ConfiguracionPendiente.tsx).
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
);
