// Monta a pasta dist só com o que é público (o código do worker, o README e as configurações ficam de fora).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const item of ['index.html', 'admin.html', 'sucesso.html', 'pendente.html', 'erro.html', 'assets', 'scripts', 'styles']) {
  cpSync(item, `dist/${item}`, { recursive: true });
}
// API: no Cloudflare Pages o worker vai junto, na pasta _worker.js (não fica acessível como arquivo)
cpSync('worker', 'dist/_worker.js', { recursive: true });
writeFileSync('dist/_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
writeFileSync('dist/.assetsignore', ['_worker.js', '_routes.json'].join('\n'));
writeFileSync('dist/_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src https://maps.google.com https://www.google.com; connect-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/admin.html
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
  X-Frame-Options: DENY
`);
console.log('dist pronta');
