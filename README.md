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
├── netlify/functions/  # disponibilidade, criar-reserva, webhook-mp, admin
├── netlify/lib/        # regras da agenda, Mercado Pago e alertas
├── assets/img/         # fotos do espaço, logo, favicon e imagem de compartilhamento
├── netlify.toml        # configuração do Netlify
├── package.json        # dependências das functions
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

## Publicar no Netlify

**Pelo GitHub (atualiza sozinho a cada mudança):**
1. No GitHub Desktop: *File → Add local repository*, escolha a pasta `aconchego-site` e clique em *create a repository* se ele pedir
2. Clique em *Publish repository*
3. No Netlify: *Add new site → Import an existing project → GitHub* e escolha `aconchego-site`
4. Deixe *Build command* vazio e *Publish directory* como `.`

**Jeito rápido (arrastar a pasta):** não serve mais, porque as reservas precisam das Netlify Functions, que só são instaladas quando o site é publicado pelo GitHub (ou pelo Netlify CLI).

**Nome do site**: *Site configuration → Change site name* (ex.: `aconchegoeventos.netlify.app`).
**Domínio próprio** (ex.: aconchegoeventos.com.br): *Domain management → Add a domain*.

## Reservas

Reserva online com pagamento pelo **Mercado Pago (Checkout Pro: Pix e cartão)**, sem servidor nem banco pago: **Netlify Functions + Netlify Blobs**. Só funciona publicado no **Netlify** (no GitHub Pages a tela Reservar mostra o aviso para reservar pelo WhatsApp).

**Como funciona**
1. O cliente abre a tela *Reservar*, escolhe o dia (azul = disponível, listrado = reservado, vazado = indisponível), o período e preenche nome, WhatsApp e convidados.
2. `criar-reserva` confere a data de novo, segura como **pendente por 30 min** e manda o cliente para o Mercado Pago. Se não pagar em 30 min, a data volta sozinha.
3. O Mercado Pago avisa o `webhook-mp`, que confere a assinatura, consulta o pagamento na API e marca a reserva como **paga**.
4. A dona recebe **e-mail** (Resend) e **WhatsApp** (CallMeBot), uma vez só por reserva.

**Painel da dona**: `https://SEU-SITE.netlify.app/admin.html`
- *Agenda*: clique num dia para abrir/fechar o dia ou um período, mudar o preço só daquela data (feriado) ou **bloquear** uma reserva fechada pelo WhatsApp.
- *Reservas*: pagas, aguardando pagamento e bloqueios, com link para o WhatsApp do cliente. "Cancelar" libera a data (o dinheiro se devolve no painel do Mercado Pago).
- *Padrões*: períodos (nome, horário, preço, "ocupa o dia todo" para a Diária), dias da semana abertos, antecedência mínima, até quantos meses a agenda abre e máximo de convidados.
- **Período com preço 0 não aparece no site**: depois de publicar, entre no admin e defina os preços.
- Status *Conflito: devolver* = alguém pagou depois que a reserva expirou e a data já era de outra pessoa (ou pagou valor menor). Devolva pelo Mercado Pago.

### Variáveis de ambiente

No Netlify: *Site configuration → Environment variables → Add a variable*. Depois de criar ou mudar, faça *Deploys → Trigger deploy*.

| Variável | Para quê |
|---|---|
| `ADMIN_PASSWORD` | Senha do admin.html (use uma senha longa) |
| `MP_ACCESS_TOKEN` | Access Token **de produção** do Mercado Pago (`APP_USR-...`) |
| `MP_ACCESS_TOKEN_TESTE` | Access Token **de teste** (`TEST-...` ou o da conta vendedora de teste) |
| `MP_MODO` | `teste` usa o token de teste; vazio ou `producao` usa o de produção |
| `MP_WEBHOOK_SECRET` | Assinatura secreta do webhook do Mercado Pago |
| `RESEND_API_KEY` | Chave da Resend (`re_...`) |
| `EMAIL_DONA` | E-mail que recebe os alertas (vários separados por vírgula) |
| `EMAIL_REMETENTE` | Opcional. Ex.: `Reservas Aconchego <reservas@seudominio.com.br>`; sem ele usa `onboarding@resend.dev` |
| `CALLMEBOT_PHONE` | WhatsApp da dona com país e DDD, ex.: `+5562994127148` |
| `CALLMEBOT_APIKEY` | Chave que o CallMeBot manda no WhatsApp |
| `SITE_URL` | Opcional. Endereço público (ex.: domínio próprio); sem ele usa o endereço do Netlify |

Nenhuma chave fica no código. Os dados ficam no Netlify Blobs (*Site → Blobs*), lojas `agenda`, `reservas` e `alertas`.

### Credenciais

**Mercado Pago**
1. Entre em https://www.mercadopago.com.br/developers/panel/app com a conta que vai receber e clique em *Criar aplicação* (tipo: pagamentos online, Checkout Pro).
2. *Credenciais de produção* → copie o **Access Token** para `MP_ACCESS_TOKEN` (pode pedir para ativar as credenciais preenchendo dados do negócio).
3. *Credenciais de teste* → copie o **Access Token** para `MP_ACCESS_TOKEN_TESTE`. Se o painel pedir, crie em *Contas de teste* um **vendedor** e um **comprador**; o token de teste também pode ser o de produção da conta vendedora de teste.
4. *Webhooks → Configurar notificações*: URL (produção e teste) `https://SEU-SITE.netlify.app/.netlify/functions/webhook-mp?source_news=webhooks`, evento **Pagamentos**, salvar. Copie a **Assinatura secreta** para `MP_WEBHOOK_SECRET`.

**Resend (e-mail)**
1. Crie a conta em https://resend.com, **de preferência com o e-mail da dona**: sem domínio verificado, a Resend só entrega para o e-mail da própria conta.
2. *API Keys → Create API Key* (permissão *Sending access*) → `RESEND_API_KEY`.
3. Opcional: *Domains → Add domain* para enviar de um endereço próprio (`EMAIL_REMETENTE`).

**CallMeBot (WhatsApp, grátis para o próprio número)**
1. No celular da dona, salve o número do CallMeBot que aparece em https://www.callmebot.com/blog/free-api-whatsapp-messages/.
2. Mande para ele, pelo WhatsApp: `I allow callmebot to send me messages`.
3. A resposta traz a **apikey** → `CALLMEBOT_APIKEY`. O número da dona vai em `CALLMEBOT_PHONE`.

### Testar no sandbox do Mercado Pago

1. Configure `MP_MODO=teste` e `MP_ACCESS_TOKEN_TESTE`, faça um novo deploy.
2. No admin, defina preço para pelo menos um período.
3. Numa **janela anônima**, reserve uma data no site. No Mercado Pago, entre com o **comprador de teste** (se pedir) e pague com cartão de teste:
   - Mastercard `5031 4332 1540 6351` · Visa `4235 6477 2802 5682` · CVV `123` · validade `11/30`
   - Nome do titular: `APRO` (aprovado), `CONT` (pendente) ou `OTHE` (recusado) · CPF `12345678909`
4. Aprovado: volta para `sucesso.html`, a reserva aparece como *Paga* no admin e chegam o e-mail e o WhatsApp. Os logs ficam em *Logs → Functions → webhook-mp*.
5. Tudo certo: troque `MP_MODO` para `producao` (ou apague) e faça novo deploy.

---

**Data**: Novembro 2026 · **Criado por**: Claude com Camilla Paschoal
