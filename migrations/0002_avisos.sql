-- Avisos mostrados no painel da dona (pedidos novos, pagamentos, conflitos)
CREATE TABLE avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT UNIQUE,              -- evita aviso repetido da mesma reserva/situação
  em INTEGER NOT NULL,
  tipo TEXT NOT NULL,             -- pedido | paga | conflito
  texto TEXT NOT NULL,
  reserva_id TEXT,
  lido INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX avisos_em ON avisos (em);
