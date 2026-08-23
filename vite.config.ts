import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Rutas relativas para que el build sirva bien tanto en local como en
  // GitHub Pages (donde la app no vive en la raíz del dominio).
  base: './',
  plugins: [react(), tailwindcss()],
})
