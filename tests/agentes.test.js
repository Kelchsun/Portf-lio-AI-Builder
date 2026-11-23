import test from 'node:test';
import assert from 'node:assert/strict';
import { rodarAgente } from '../api/agente.js';
import { avaliarPlano, calcularPrazos, avaliarBriefing, vendas, resumoPeriodo, contraste, avaliarProposta, DEMANDAS } from '../api/_agentes.js';

const HOJE = new Date('2026-11-23T15:00:00Z');
// Gemini simulado: devolve, em ordem, as chamadas de função de cada turno.
function gemini(turnos) {
  const bodies = [];
  const fetcher = async (url, opt) => {
    const body = JSON.parse(opt.body); bodies.push(body);
    const calls = turnos[bodies.length - 1] || [];
    return { ok: true, json: async () => ({ usageMetadata: { totalTokenCount: 100 }, candidates: [{ content: { role: 'model', parts: calls.map(([name, args]) => ({ functionCall: { name, args } })) } }] }) };
  };
  return { fetcher, bodies };
}
const ENV = { GEMINI_API_KEY: 'k' };

// Plano válido montado à mão para os testes.
const PLANO = [['D-01','Ana'],['D-06','Diego'],['D-07','Ana'],['D-03','Carla'],['D-11','Carla'],['D-02','Bruno'],['D-08','Bruno'],['D-12','Bruno'],['D-04','Diego'],['D-09','Diego'],['D-05','Carla'],['D-10','Diego']].map(([demanda_id,pessoa])=>({demanda_id,pessoa}));

test('avaliar_plano pega especialidade errada, sobrecarga e demanda sem responsável', () => {
  const v = avaliarPlano([{ demanda_id: 'D-01', pessoa: 'Bruno' }]);
  assert.equal(v.ok, false);
  assert.ok(v.problemas.some(p => p.includes('não atende Regulatório')));
  assert.ok(v.problemas.some(p => p.startsWith('Sem responsável')));
});

test('o plano de referência é válido', () => {
  const v = avaliarPlano(PLANO);
  assert.deepEqual(v.problemas, []);
  assert.equal(PLANO.length, DEMANDAS.length);
});

test('agente de demandas: recusa plano ruim, corrige e entrega', async () => {
  const { fetcher, bodies } = gemini([
    [['listar_demandas', {}], ['listar_equipe', {}]],
    [['entregar_plano', { atribuicoes: PLANO.slice(0, 3), resumo: 'incompleto' }]],
    [['entregar_plano', { atribuicoes: PLANO, resumo: 'Prazos curtos primeiro.' }]],
  ]);
  const r = await rodarAgente({ agente: 'demandas', env: ENV, fetcher, agora: HOJE });
  assert.equal(r.entrega.atribuicoes.length, 12);
  assert.equal(r.passos.length, 4);
  assert.ok(r.passos[2].resultado.problemas.length > 0); // recusa registrada no rastro
  const last = bodies.at(-1);
  assert.ok(last.tools[0].functionDeclarations.some(f => f.name === 'avaliar_plano'));
  assert.equal(last.toolConfig.functionCallingConfig.mode, 'ANY');
  assert.ok(last.contents.some(c => c.parts.some(p => p.functionResponse?.response?.recusado)));
});

test('prazos são calculados pelo código e o briefing exige vencidos e urgentes', () => {
  const t = calcularPrazos('2026-11-23');
  assert.equal(t[0].id, 'PR-0101');
  assert.equal(t[0].situacao, 'vencido');
  assert.equal(avaliarBriefing([{ id: 'PR-0101' }], '2026-11-23').ok, false);
  const urg = t.filter(x => ['vencido', 'urgente'].includes(x.situacao)).map(x => ({ id: x.id }));
  assert.equal(avaliarBriefing(urg, '2026-11-23').ok, true);
});

test('agente de prazos entrega com dias calculados', async () => {
  const urg = calcularPrazos('2026-11-23').filter(x => ['vencido', 'urgente'].includes(x.situacao)).map(x => ({ id: x.id, acao: 'agir', responsavel: x.responsavel }));
  const { fetcher } = gemini([[['calcular_prazos', {}]], [['entregar_briefing', { prioridades: urg, resumo: 'ok' }]]]);
  const r = await rodarAgente({ agente: 'prazos', env: ENV, fetcher, agora: HOJE });
  assert.equal(r.entrega.prioridades[0].dias_restantes, -2);
});

test('vendas: base de 90 dias, sempre igual e contas certas', () => {
  const a = vendas('2026-11-23'), b = vendas('2026-11-23');
  assert.deepEqual(a, b);
  assert.equal(a[0].data, '2026-08-25');
  assert.equal(a.at(-1).data, '2026-11-22');
  const s = resumoPeriodo(a, '2026-11-22', '2026-11-22');
  assert.equal(s.receita_total, Math.round(a.filter(r => r.data === '2026-11-22').reduce((x, r) => x + r.receita, 0) * 100) / 100);
  assert.ok(resumoPeriodo(a, 'ontem', 'hoje').erro);
});

test('agente de vendas usa ferramentas e entrega números com origem', async () => {
  const { fetcher } = gemini([[['info_base', {}]], [['top_produtos', { inicio: '2026-11-01', fim: '2026-11-22', n: 3 }]], [['entregar_resposta', { resposta: 'Foque no café.', numeros: [{ valor: '1.234,00', origem: 'top_produtos' }] }]]]);
  const r = await rodarAgente({ agente: 'vendas', pergunta: 'Qual produto mais vende em novembro?', env: ENV, fetcher, agora: HOJE });
  assert.equal(r.passos[1].resultado.length, 3);
  assert.equal(r.entrega.numeros[0].origem, 'top_produtos');
});

test('contraste segue a regra WCAG', () => {
  assert.equal(contraste('#000000', '#ffffff').razao, 21);
  assert.equal(contraste('#777777', '#ffffff').texto_normal_ok, false);
});

test('proposta de layout recusa contraste baixo e seção inventada', () => {
  const base = { secoes: [{ tipo: 'hero' }, { tipo: 'servicos' }, { tipo: 'faq' }, { tipo: 'mapa_contato' }], paleta: { fundo: '#ffffff', texto: '#111111', destaque: '#0d6b64', texto_no_destaque: '#ffffff' }, fonte_titulo: 'Fraunces', fonte_texto: 'Inter' };
  assert.equal(avaliarProposta(base).ok, true);
  assert.equal(avaliarProposta({ ...base, paleta: { ...base.paleta, texto: '#cccccc' } }).ok, false);
  assert.equal(avaliarProposta({ ...base, secoes: [...base.secoes, { tipo: 'carrossel_3d' }] }).ok, false);
});

test('sem chave, avisa como configurar', async () => {
  await assert.rejects(rodarAgente({ agente: 'demandas', env: {} }), /GEMINI_API_KEY/);
});

test('para depois de 8 passos sem entrega', async () => {
  const { fetcher } = gemini(Array(9).fill([['listar_equipe', {}]]));
  await assert.rejects(rodarAgente({ agente: 'demandas', env: ENV, fetcher, agora: HOJE }), /8 passos/);
});
