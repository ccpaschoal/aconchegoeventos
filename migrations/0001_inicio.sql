-- Aconchego · banco D1 das reservas

-- Configuração geral (preços, dias da semana, limites) em JSON
CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Ajustes de uma data feitos pela dona: abrir/fechar, marcar/desmarcar feriado, preço só daquele dia
CREATE TABLE dias (
  data TEXT PRIMARY KEY,          -- AAAA-MM-DD
  aberto INTEGER,                 -- 1 aberto, 0 fechado, NULL segue o dia da semana
  feriado INTEGER,                -- 1 é feriado, 0 não é, NULL segue a lista automática
  preco REAL                      -- NULL usa o preço padrão
);

-- Reservas (pagas, pendentes, bloqueios manuais, canceladas...)
CREATE TABLE reservas (
  id TEXT PRIMARY KEY,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  datas TEXT NOT NULL,            -- JSON com os dias
  nome TEXT NOT NULL,
  whatsapp TEXT,
  convidados INTEGER,
  valor REAL NOT NULL DEFAULT 0,
  detalhe TEXT,                   -- como o valor foi calculado
  status TEXT NOT NULL,           -- pendente | paga | bloqueio | conflito | cancelada | estornada | substituida
  criada_em INTEGER NOT NULL,
  expira_em INTEGER,
  pagamento_id TEXT,
  metodo TEXT,
  valor_pago REAL,
  pago_em INTEGER,
  obs TEXT,
  ambiente TEXT
);
CREATE INDEX reservas_fim ON reservas (fim);

-- Um dia só pode ter uma reserva ativa: a chave primária impede reserva dupla
CREATE TABLE ocupacao (
  data TEXT PRIMARY KEY,
  reserva_id TEXT NOT NULL,
  expira_em INTEGER               -- NULL = definitivo (paga ou bloqueio); número = pendente até esse horário
);
CREATE INDEX ocupacao_reserva ON ocupacao (reserva_id);

-- Trava para não avisar a dona duas vezes
CREATE TABLE alertas (
  chave TEXT PRIMARY KEY,
  em INTEGER NOT NULL
);
