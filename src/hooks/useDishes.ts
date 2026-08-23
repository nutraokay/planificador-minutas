import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Dish, DishInput } from "../types/database";
import { useAuth } from "../context/AuthContext";

export function useDishes() {
  const { user } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!user) return;
    setCargando(true);
    const { data, error } = await supabase.from("dishes").select("*").order("nombre", { ascending: true });
    if (error) setError(error.message);
    else setDishes(data as Dish[]);
    setCargando(false);
  }, [user]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function crear(input: DishInput) {
    if (!user) return;
    const { error } = await supabase.from("dishes").insert({ ...input, user_id: user.id });
    if (error) throw error;
    await recargar();
  }

  async function crearVarios(inputs: DishInput[]) {
    if (!user || inputs.length === 0) return;
    const filas = inputs.map((i) => ({ ...i, user_id: user.id }));
    const { error } = await supabase.from("dishes").insert(filas);
    if (error) throw error;
    await recargar();
  }

  async function actualizar(id: string, cambios: Partial<DishInput>) {
    const { error } = await supabase.from("dishes").update(cambios).eq("id", id);
    if (error) throw error;
    await recargar();
  }

  async function eliminar(id: string) {
    const { error } = await supabase.from("dishes").delete().eq("id", id);
    if (error) throw error;
    await recargar();
  }

  return { dishes, cargando, error, recargar, crear, crearVarios, actualizar, eliminar };
}
