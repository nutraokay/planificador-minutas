# Minutas — Piloto (1 sede)

SaaS para planificar minutas (menús semanales de almuerzo) de forma
aleatorizada, respetando reglas de negocio configurables. Piloto para 1 sola
sede, con el modelo de datos preparado para escalar a multi-sede más
adelante (columnas `venue_id`, sin UI ni lógica de sede todavía).

## Qué incluye

- **Catálogo de platos**: tabla editable + importación desde Excel (mapeo de
  columnas configurable). Cada plato lleva tags libres, familia (para
  acompañamientos), días permitidos, frecuencia especial y estado activo.
- **Reglas de aleatorización**: las 9 reglas de la especificación, editables,
  activables/desactivables, con soporte de múltiples instancias (por tag o
  por palabra) y excepciones puntuales por semana.
- **Minuta mensual**: navegación por mes, agrupada por semana, con 1 o 2
  platos por día configurable (viernes siempre 1, elegido solo del pool
  `plato_viernes`), edición manual de cualquier slot y botón "Aleatorizar
  mes" que respeta lo editado a mano.
- **Panel de verificación**: tabla ✓/✗ por semana y regla activa, con detalle
  de incumplimientos concretos. Se recalcula al aleatorizar o al editar un
  slot manualmente.
- **Exportar a Excel** de la minuta generada.
- **Login** simple (Supabase Auth, 1 usuario para este piloto).

## Configurar Supabase (una sola vez)

1. Crea un proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. En **SQL Editor**, pega y ejecuta el contenido completo de
   [`supabase/schema.sql`](./supabase/schema.sql). Crea las tablas `dishes`,
   `weekly_plans`, `daily_slots`, `randomization_rules` y `rule_exceptions`,
   con sus políticas de seguridad (RLS) por dueño (`auth.uid()`).
3. En **Authentication → Users → Add user**, crea tu cuenta (marca "Auto
   Confirm User" para poder entrar sin verificar el correo).
4. En **Project Settings → API**, copia la **Project URL** y la **anon
   public key**.

## Correr localmente

```bash
cp .env.example .env      # pega ahí la URL y la anon key del paso anterior
npm install
npm run dev
```

Abre `http://localhost:5173` e inicia sesión con la cuenta que creaste.

Si `.env` no existe o está incompleto, la app muestra una pantalla explicando
qué falta en vez de romperse.

## Notas de diseño de las reglas

- Las reglas se guardan en `randomization_rules` (jsonb `parametros`,
  `activa`). Para pausar una regla solo una semana puntual, se usa
  `rule_exceptions` en vez de desactivarla globalmente.
- `no_repetir_semana_siguiente`, `distancia_minima_acompañamiento` y las
  demás reglas de repetición se evalúan **dentro del mes que se está
  generando** (no cruzan al mes anterior) — es una simplificación consciente
  del piloto: cada mes parte de cero.
- `frecuencia_especial = "semana_por_medio"` no tiene estado histórico entre
  meses, así que la paridad de semana (par/impar) de cada plato se deriva de
  forma estable a partir de su `id` — es consistente mes a mes para el mismo
  plato, aunque no configurable manualmente en esta fase.
- Cuando el pool de candidatos para un slot queda vacío, el motor relaja
  reglas en este orden (de más flexible a más rígida): preferencia de día de
  semana, distancia entre acompañamientos, no-repetición semana
  siguiente/proteína/mismo-tipo, frecuencia especial, composición semanal
  mínima, restricción por palabra y días permitidos. El slot generado así
  queda marcado como "conflicto" para revisión manual.

## Stack

Vite + React + TypeScript + Tailwind CSS v4 + React Router (HashRouter) +
Supabase (Auth + Postgres) + SheetJS (`xlsx`) para importar/exportar Excel.
