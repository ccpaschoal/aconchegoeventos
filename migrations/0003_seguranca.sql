-- Segurança: limite de pedidos por pessoa e de tentativas de senha no painel.
-- Guarda só um resumo (hash) do IP, nunca o IP em si.
ALTER TABLE reservas ADD COLUMN ip_hash TEXT;
CREATE INDEX reservas_ip ON reservas (ip_hash, status);

CREATE TABLE tentativas (
  ip_hash TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX tentativas_ip ON tentativas (ip_hash, em);
