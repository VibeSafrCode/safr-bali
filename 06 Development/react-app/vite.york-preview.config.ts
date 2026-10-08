import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const previewBase=process.env.SAFRWAY_PREVIEW_BASE_PATH??'';
if(!['','/yoga-preview'].includes(previewBase))throw new Error('Invalid preview base');
export default defineConfig({
  plugins:[react()],
  publicDir:false,
  build:{
    outDir:resolve(root,previewBase?'../astro-site/dist-yoga-https-preview/_york':'../astro-site/dist-york-preview/_york'),
    emptyOutDir:true,
    sourcemap:false,
    lib:{entry:resolve(root,'src/york-preview/main.tsx'),formats:['es'],fileName:()=> 'york-preview.js'},
    rollupOptions:{output:{codeSplitting:false}},
  },
  define:{'process.env.NODE_ENV':JSON.stringify('production'),'__YOGA_PREVIEW_BASE__':JSON.stringify(previewBase)},
});
