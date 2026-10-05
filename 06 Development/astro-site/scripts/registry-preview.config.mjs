// Explicit editorial-review mode. No YouTube updater, real submissions or
// automatic published-pricing fetch. Launch from the existing Astro project.
import base from "../astro.config.mjs";
export default {...base,vite:{...base.vite,
  plugins:base.vite.plugins.filter(plugin=>plugin.name!=="safr-youtube-preview")}};
