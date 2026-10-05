// Server-only Vite bridge. The browser receives only an allowlisted public JSON.
// Production uses the same Python updater via systemd and nginx (see runbook).
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cache = fileURLToPath(new URL('../.cache/youtube-playlist.json', import.meta.url));
const updater = fileURLToPath(new URL('../../tools/youtube/refresh_public_playlist.py', import.meta.url));
const credential = fileURLToPath(new URL('../../../.env.youtube.local', import.meta.url));

export function youtubePreview() {
 function configure(server) {
  let child, timer;
  const refresh = () => {
   if (child || !existsSync(credential)) return;
   child = spawn('python3', [updater, '--env-file', credential, '--output', cache], {stdio: ['ignore', 'pipe', 'ignore']});
   child.stdout.on('data', chunk => server.config.logger.info(`[youtube] ${chunk.toString().trim()}`));
   child.once('error', () => { server.config.logger.warn('[youtube] updater unavailable'); child = undefined; });
   child.once('exit', () => { child = undefined; });
  };
  const start = () => {
   refresh();
   timer = setInterval(refresh, 15 * 60 * 1000);
   timer.unref();
  };
  // Astro check also instantiates Vite but does not listen. It must not spend API quota.
  if (server.httpServer?.listening) start();
  else server.httpServer?.once('listening', start);
  server.httpServer?.once('close', () => { clearInterval(timer); child?.kill(); });
  server.middlewares.use(async (req, res, next) => {
   if (req.url?.split('?')[0] !== '/api/public/youtube-playlist.json') return next();
   res.setHeader('Content-Type', 'application/json; charset=utf-8');
   res.setHeader('Cache-Control', 'no-store');
   if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end('{}'); }
   try {
    const data = await readFile(cache);
    res.end(req.method === 'HEAD' ? undefined : data);
   } catch { res.statusCode = 503; res.end('{}'); }
  });
 }
 return {name: 'safr-youtube-preview', apply: 'serve', configureServer: configure, configurePreviewServer: configure};
}
