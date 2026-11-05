/* GET /api/disponibilidade?mes=AAAA-MM
   Agenda da dona + reservas → estado de cada dia e período, com preço só dos livres.
   Não devolve nada sobre os clientes. */
import { RE_MES, hojeSP, somaMeses, diasDoMes, json, lerConfig, lerExcecoes, listarReservas, montarDia } from '../lib/comum.js';

export default async (req) => {
  if (req.method !== 'GET') return json({ erro: 'Método não permitido.' }, 405);
  const agora = Date.now();
  const hoje = hojeSP(agora);
  const pedido = new URL(req.url).searchParams.get('mes');
  const mes = RE_MES.test(pedido || '') ? pedido : hoje.slice(0, 7);
  try {
    const [config, excecoes, reservas] = await Promise.all([lerConfig(), lerExcecoes(mes), listarReservas(mes)]);
    const dias = diasDoMes(mes).map((d) => montarDia(d, { config, excecoes, reservas, hoje, agora }));
    return json({
      mes,
      hoje,
      de: hoje.slice(0, 7),
      ate: somaMeses(hoje.slice(0, 7), config.mesesAFrente),
      maxConvidados: config.maxConvidados,
      periodos: config.periodos.map(({ id, nome, horario }) => ({ id, nome, horario })),
      dias,
    });
  } catch (e) {
    console.error('disponibilidade:', e);
    return json({ erro: 'Não foi possível carregar a agenda.' }, 500);
  }
};
