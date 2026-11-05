# Aconchego Festas e Eventos · Site

Site do **Aconchego Festas e Eventos** (@aconchego.eventoss), espaço para festas e eventos no Juarez Freire, em Trindade-GO. Site por **Camilla Paschoal** (@camillapaschoal).

## Características

- **Identidade do Instagram**: azul da palmeira, marinho e branco, Montserrat Black em caixa alta e cantos retos
- **Fundo de noite**: céu escuro com estrelinhas, o brilho azul da piscina subindo de baixo e a palmeira da marca bem apagada
- **Transição de garrafas**: cada seção é uma tela; a atual fica grande no meio e as vizinhas aparecem menores em cima e embaixo
- **Carrossel de garrafa** com as fotos do espaço (arrastar, setas ou teclado)
- **Títulos letra por letra** ao trocar de tela
- **WhatsApp em todo lugar**: botão Reservar no topo, botão flutuante e mensagem já escrita
- **Responsivo**: no celular, a tela rola por dentro antes de passar para a próxima
- **Acessível**: navegação por teclado, textos alternativos e respeito a "reduzir movimento"

## Estrutura

```
aconchego-site/
├── index.html          # conteúdo do site
├── admin.html          # painel da dona (agenda, preços, reservas)
├── sucesso.html · pendente.html · erro.html   # retorno do Mercado Pago
├── styles/style.css    # cores, fundo, fontes e layout
├── styles/agenda.css   # calendário, painel e páginas de reserva
├── scripts/app.js      # transição de garrafas e carrossel
├── scripts/agenda.js   # calendário de reservas
├── scripts/admin.js    # painel da dona
├── scripts/retorno.js  # resumo nas páginas de retorno
├── worker/            # API de reservas (Cloudflare Worker): rotas, regras de preço, Mercado Pago e alertas
├── migrations/        # tabelas do banco D1
├── build.mjs          # monta a pasta dist (só o que é público)
├── wrangler.jsonc     # configuração da Cloudflare
├── assets/img/         # fotos do espaço, logo, favicon e imagem de compartilhamento
├── package.json        # comandos de build e publicação
└── README.md
```

## Modificações rápidas

**Cores e fundo** (`styles/style.css`, bloco `:root` no topo):
```css
--azul: #166EC8;   /* ajustado para contraste WCAG AA */
--marinho: #002E45;
--fundo: #070B10;   /* fundo atrás das telas */
```
O céu, as estrelas e a palmeira de fundo ficam logo abaixo, em `body`, `body::before` e `body::after`.

**Trocar a transição** (`scripts/app.js`, procure `const amostra`):
- `'a'` clássica · `'b'` empilhada · `'c'` inclinada

**WhatsApp**: todos os botões usam `https://wa.me/5562994127148`. Para mudar o número, troque em todos os lugares do `index.html` (Ctrl+H no VS Code).

**Nova foto na galeria**: coloque a imagem em `assets/img/` (de preferência .webp, até 1200 px) e copie uma linha `<figure class="cf-item">` no `index.html`.

**Depois de mudar CSS ou JS**: troque o `?v=` no `index.html` (ex.: `20261104a` → `20261104b`) para o navegador não mostrar a versão antiga.

## Publicar

- **Site com reservas (Cloudflare)**: `npm run deploy` na pasta do site (detalhes na seção Reservas).
- **GitHub Pages**: atualiza sozinho a cada push na branch `main` (sem o painel; a tela Reservar usa a API da Cloudflare).

## Reservas

Reserva online com pagamento pelo **Mercado Pago (Checkout Pro: Pix e cartão)**, hospedada de graça na **Cloudflare** (Workers + banco D1).

- **Site com reservas e painel**: https://aconchegoeventos.aconchego-site.workers.dev
- **Painel da dona**: https://aconchegoeventos.aconchego-site.workers.dev/admin.html
- A versão do GitHub Pages continua no ar e usa a mesma agenda (a API aceita chamadas de `ccpaschoal.github.io`).

**Preços** (editáveis no admin, seção *Preços e regras*)
- Diária: R$ 500 · diária em feriado: R$ 400
- Pacote fim de semana: sexta + sábado ou sábado + domingo = R$ 850, só se nenhum dos dois for feriado nem tiver preço especial
- Exemplos: sex+sáb+dom = R$ 1.350 · sex+sáb + domingo feriado = R$ 850 + R$ 400
- O cliente reserva de 1 até 3 dias seguidos (*Máximo de dias por reserva*).
- Feriados automáticos: nacionais, Carnaval e Corpus Christi. Feriados de Goiás e de Trindade a dona marca no calendário do admin (*Feriado → É feriado*), assim como pode desmarcar qualquer um.

**Como funciona**
1. O cliente escolhe o dia, quantos dias e preenche nome, WhatsApp e convidados.
2. A API recalcula o preço, segura os dias como **pendentes por 30 min** (o banco não deixa dois clientes pegarem o mesmo dia) e manda para o Mercado Pago.
3. O Mercado Pago avisa `/api/webhook-mp`; a API confere a assinatura, consulta o pagamento e marca a reserva como **paga**.
4. A dona recebe **e-mail** (Resend) e **WhatsApp** (CallMeBot), uma vez só por reserva.

**Painel da dona**
- *Agenda*: clique num dia para abrir/fechar, marcar feriado, mudar o preço só daquela data ou **bloquear** dias fechados pelo WhatsApp.
- *Reservas*: pagas, aguardando pagamento e bloqueios, com link para o WhatsApp do cliente. "Cancelar" libera os dias (o dinheiro se devolve no painel do Mercado Pago).
- Status *Conflito: devolver* = alguém pagou depois que a reserva expirou e o dia já era de outra pessoa (ou pagou menos). Devolva pelo Mercado Pago.

### Publicar mudanças

Precisa do Node e do Wrangler (`npm i -g wrangler`, depois `wrangler login`). Na pasta do site:

```
npm run deploy        # monta a pasta dist e publica na Cloudflare
npm run banco         # aplica mudanças do banco (pasta migrations), se houver
npm run dev           # roda tudo no computador (http://127.0.0.1:8787); antes, uma vez: npm run banco:local
```

Para testar localmente, crie um arquivo `.dev.vars` (fica fora do git) com `ADMIN_PASSWORD=...` e as outras chaves.

### Segredos (chaves)

Cada um com `wrangler secret put NOME` (cola o valor quando pedir) ou no painel: *Cloudflare → Workers & Pages → aconchegoeventos → Settings → Variables and Secrets*.

| Nome | Para quê |
|---|---|
| `ADMIN_PASSWORD` | Senha do admin.html (já configurada) |
| `MP_ACCESS_TOKEN` | Access Token **de produção** do Mercado Pago (`APP_USR-...`) |
| `MP_ACCESS_TOKEN_TESTE` | Access Token **de teste** |
| `MP_MODO` | `teste` usa o token de teste; vazio ou `producao` usa o de produção |
| `MP_WEBHOOK_SECRET` | Assinatura secreta do webhook do Mercado Pago |
| `RESEND_API_KEY` | Chave da Resend (`re_...`) |
| `EMAIL_DONA` | E-mail que recebe os alertas (vários separados por vírgula) |
| `EMAIL_REMETENTE` | Opcional. Ex.: `Reservas Aconchego <reservas@seudominio.com.br>` |
| `CALLMEBOT_PHONE` | WhatsApp da dona com país e DDD, ex.: `+5562994127148` |
| `CALLMEBOT_APIKEY` | Chave que o CallMeBot manda no WhatsApp |
| `SITE_URL` | Opcional. Endereço público, se usar domínio próprio |

Segredos valem na hora, sem novo deploy. Nenhuma chave fica no código.

### Credenciais

**Mercado Pago**
1. https://www.mercadopago.com.br/developers/panel/app com a conta que vai receber → *Criar aplicação* (pagamentos online, Checkout Pro).
2. *Credenciais de produção* → **Access Token** → `MP_ACCESS_TOKEN`.
3. *Credenciais de teste* → **Access Token** → `MP_ACCESS_TOKEN_TESTE`. Se pedir, crie em *Contas de teste* um vendedor e um comprador.
4. *Webhooks → Configurar notificações*: URL `https://aconchegoeventos.aconchego-site.workers.dev/api/webhook-mp?source_news=webhooks` (produção e teste), evento **Pagamentos**, salvar. Copie a **Assinatura secreta** → `MP_WEBHOOK_SECRET`.

**Resend (e-mail)**
1. Conta em https://resend.com, **de preferência com o e-mail da dona** (sem domínio próprio a Resend só entrega para o e-mail da conta).
2. *API Keys → Create API Key* → `RESEND_API_KEY`. O e-mail da dona vai em `EMAIL_DONA`.

**CallMeBot (WhatsApp, grátis para o próprio número)**
1. No celular da dona, salve o número do CallMeBot que aparece em https://www.callmebot.com/blog/free-api-whatsapp-messages/.
2. Mande para ele: `I allow callmebot to send me messages`.
3. A resposta traz a **apikey** → `CALLMEBOT_APIKEY`. O número da dona vai em `CALLMEBOT_PHONE`.

### Testar no sandbox do Mercado Pago

1. `MP_MODO=teste` e `MP_ACCESS_TOKEN_TESTE` configurados.
2. Numa **janela anônima**, reserve uma data. No Mercado Pago, entre com o **comprador de teste** (se pedir) e pague com cartão de teste:
   - Mastercard `5031 4332 1540 6351` · Visa `4235 6477 2802 5682` · CVV `123` · validade `11/30`
   - Titular `APRO` (aprovado), `CONT` (pendente) ou `OTHE` (recusado) · CPF `12345678909`
3. Aprovado: volta para a página de sucesso, a reserva aparece como *Paga* no admin e chegam o e-mail e o WhatsApp. Logs: *Cloudflare → Workers & Pages → aconchegoeventos → Logs* (ou `wrangler tail`).
4. Tudo certo: troque `MP_MODO` para `producao`.

---

**Data**: Novembro 2026 · **Criado por**: Claude com Camilla Paschoal
