import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Pass the reviewed night-heroes handoff directory.');
const target = resolve('../react-app/public/assets/heroes');
await mkdir(target, { recursive: true });
for (const id of ['bali', 'thailand', 'uae', 'nepal', 'russia']) {
  for (const width of [768, 1536]) {
    const result = await sharp(resolve(source, `${id}-hero-night-ai-v1.png`))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(resolve(target, `${id}-hero-night-ai-v1-${width}.webp`));
    console.log(`${id}/${width}: ${result.size} bytes`);
  }
}
