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
├── styles/style.css    # cores, fundo, fontes e layout
├── scripts/app.js      # transição de garrafas e carrossel
├── assets/img/         # fotos do espaço, logo, favicon e imagem de compartilhamento
├── netlify.toml        # configuração do Netlify
└── README.md
```

## Modificações rápidas

**Cores e fundo** (`styles/style.css`, bloco `:root` no topo):
```css
--azul: #1876D6;
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

**Jeito rápido (arrastar a pasta):**
1. Entre em https://app.netlify.com/drop
2. Arraste a pasta `aconchego-site` inteira para a página

**Nome do site**: *Site configuration → Change site name* (ex.: `aconchegoeventos.netlify.app`).
**Domínio próprio** (ex.: aconchegoeventos.com.br): *Domain management → Add a domain*.

---

**Data**: Novembro 2026 · **Criado por**: Claude com Camilla Paschoal
