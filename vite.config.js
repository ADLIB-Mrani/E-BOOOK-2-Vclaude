import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH est utilisé par le workflow GitHub Pages ("/nom-du-repo/").
// Sur Vercel ou en local, laissez vide : la base est "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
});
