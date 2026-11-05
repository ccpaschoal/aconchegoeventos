// Monta a pasta dist só com o que é público (o código do worker, o README e as configurações ficam de fora).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const item of ['index.html', 'admin.html', 'sucesso.html', 'pendente.html', 'erro.html', 'assets', 'scripts', 'styles']) {
  cpSync(item, `dist/${item}`, { recursive: true });
}
writeFileSync('dist/_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/admin.html
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
  X-Frame-Options: DENY
`);
console.log('dist pronta');
