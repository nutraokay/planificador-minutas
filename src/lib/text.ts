/** minúsculas + sin tildes, para comparar tags/palabras sin depender de cómo las tipeó el usuario. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function tieneTag(tags: string[], tag: string): boolean {
  const n = normalizar(tag);
  return tags.some((t) => normalizar(t) === n);
}

export function esAcompanamiento(tags: string[]): boolean {
  return tieneTag(tags, "acompañamiento");
}

export function esPlatoViernes(tags: string[]): boolean {
  return tieneTag(tags, "plato_viernes");
}

export function tagsProteina(tags: string[]): string[] {
  return tags.filter((t) => normalizar(t).startsWith("proteina:"));
}

/** Hash simple y estable de un string a 0|1, usado para asignar paridad de
 * semana a los platos "semana por medio" (no hay estado histórico entre
 * meses, así que se deriva del id del plato para que sea consistente). */
export function paridadEstable(id: string): 0 | 1 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2) as 0 | 1;
}
