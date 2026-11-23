// Dados fictícios e ferramentas dos três agentes.
// Regra de ouro: conta e regra ficam no código; o modelo decide a ordem e explica.

const DIA = 86_400_000;
export const hojeISO = (agora = new Date()) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10); // horário de Brasília
const somaDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DIA).toISOString().slice(0, 10);
const difDias = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / DIA);
const r2 = x => Math.round(x * 100) / 100;
const erro = (msg) => ({ erro: msg });

/* ---------------- 1. Distribuição de demandas ---------------- */
export const DEMANDAS = [
  { id: 'D-01', tipo: 'Regulatório', descricao: 'Resposta a órgão regulador sobre cobrança em duplicidade', esforco_min: 90, prazo_horas: 6 },
  { id: 'D-02', tipo: 'Reembolso', descricao: 'Cliente pede devolução de mensalidade paga após cancelamento', esforco_min: 30, prazo_horas: 24 },
  { id: 'D-03', tipo: 'Reclamação', descricao: 'Atendimento por telefone encerrado sem solução', esforco_min: 40, prazo_horas: 12 },
  { id: 'D-04', tipo: 'Cadastro', descricao: 'Atualização de endereço não refletida no sistema', esforco_min: 20, prazo_horas: 48 },
  { id: 'D-05', tipo: 'Dúvida', descricao: 'Como emitir segunda via do contrato', esforco_min: 15, prazo_horas: 48 },
  { id: 'D-06', tipo: 'Regulatório', descricao: 'Manifestação recebida pelo Consumidor.gov com prazo curto', esforco_min: 60, prazo_horas: 8 },
  { id: 'D-07', tipo: 'Reclamação', descricao: 'Cliente relata produto contratado sem autorização', esforco_min: 50, prazo_horas: 10 },
  { id: 'D-08', tipo: 'Reembolso', descricao: 'Estorno de tarifa cobrada indevidamente', esforco_min: 25, prazo_horas: 24 },
  { id: 'D-09', tipo: 'Cadastro', descricao: 'Correção de nome no contrato', esforco_min: 20, prazo_horas: 72 },
  { id: 'D-10', tipo: 'Dúvida', descricao: 'Prazo de carência de um plano', esforco_min: 15, prazo_horas: 24 },
  { id: 'D-11', tipo: 'Reclamação', descricao: 'Demora na análise de um pedido aberto há 20 dias', esforco_min: 45, prazo_horas: 16 },
  { id: 'D-12', tipo: 'Reembolso', descricao: 'Reembolso parcial contestado pelo cliente', esforco_min: 35, prazo_horas: 36 },
];
export const EQUIPE = [
  { pessoa: 'Ana', especialidades: ['Regulatório', 'Reclamação'], minutos_livres: 200 },
  { pessoa: 'Bruno', especialidades: ['Reembolso', 'Cadastro'], minutos_livres: 150 },
  { pessoa: 'Carla', especialidades: ['Reclamação', 'Dúvida'], minutos_livres: 120 },
  { pessoa: 'Diego', especialidades: ['Cadastro', 'Dúvida', 'Reembolso', 'Regulatório'], minutos_livres: 150 },
];

export function avaliarPlano(atribuicoes) {
  if (!Array.isArray(atribuicoes)) return erro('Envie uma lista de atribuições.');
  const problemas = [], carga = Object.fromEntries(EQUIPE.map(p => [p.pessoa, 0])), vistos = new Set();
  for (const a of atribuicoes) {
    const d = DEMANDAS.find(x => x.id === a?.demanda_id), p = EQUIPE.find(x => x.pessoa === a?.pessoa);
    if (!d) { problemas.push(`Demanda inexistente: ${a?.demanda_id}`); continue; }
    if (!p) { problemas.push(`Pessoa inexistente: ${a?.pessoa}`); continue; }
    if (vistos.has(d.id)) problemas.push(`${d.id} foi atribuída mais de uma vez`);
    vistos.add(d.id);
    if (!p.especialidades.includes(d.tipo)) problemas.push(`${p.pessoa} não atende ${d.tipo} (${d.id})`);
    carga[p.pessoa] += d.esforco_min;
  }
  for (const p of EQUIPE) if (carga[p.pessoa] > p.minutos_livres) problemas.push(`${p.pessoa} ficaria com ${carga[p.pessoa]} min, acima dos ${p.minutos_livres} livres`);
  const faltando = DEMANDAS.filter(d => !vistos.has(d.id)).map(d => d.id);
  if (faltando.length) problemas.push(`Sem responsável: ${faltando.join(', ')}`);
  return { ok: problemas.length === 0, problemas, carga_min_por_pessoa: carga };
}

/* ---------------- 2. Controle de prazos ---------------- */
// Offsets em dias a partir de hoje: prazos sempre fazem sentido no dia em que o agente roda.
const PROC = [
  ['PR-0101', 'Pedido de informações a órgão público', -2, -9, 'Ana'],
  ['PR-0102', 'Manifestação sobre laudo pericial', 1, -6, 'Bruno'],
  ['PR-0103', 'Juntada de documentos do requerente', 2, -1, 'Carla'],
  ['PR-0104', 'Parecer sobre acordo proposto', 3, -12, 'Ana'],
  ['PR-0105', 'Resposta a ofício da delegacia', 5, -3, 'Diego'],
  ['PR-0106', 'Análise de recurso', 6, -20, 'Bruno'],
  ['PR-0107', 'Audiência: preparar pauta', 8, -2, 'Carla'],
  ['PR-0108', 'Notificação de testemunha', 10, -4, 'Diego'],
  ['PR-0109', 'Revisão de cálculo de pensão', 14, -30, 'Ana'],
  ['PR-0110', 'Encaminhamento para arquivo', 20, -1, 'Bruno'],
  ['PR-0111', 'Manifestação final em inquérito', 0, -15, 'Diego'],
  ['PR-0112', 'Pedido de diligência complementar', 25, -7, 'Carla'],
];
export function processos(hoje) {
  return PROC.map(([id, assunto, prazo, mov, responsavel]) => ({ id, assunto, responsavel, prazo_final: somaDias(hoje, prazo), ultima_movimentacao: somaDias(hoje, mov) }));
}
export function calcularPrazos(hoje) {
  return processos(hoje).map(p => {
    const dias = difDias(p.prazo_final, hoje), parado = difDias(hoje, p.ultima_movimentacao);
    const situacao = dias < 0 ? 'vencido' : dias <= 3 ? 'urgente' : dias <= 7 ? 'atenção' : 'no prazo';
    return { id: p.id, assunto: p.assunto, responsavel: p.responsavel, prazo_final: p.prazo_final, dias_restantes: dias, dias_sem_movimentacao: parado, situacao };
  }).sort((a, b) => a.dias_restantes - b.dias_restantes);
}
export function avaliarBriefing(prioridades, hoje) {
  if (!Array.isArray(prioridades)) return erro('Envie a lista de prioridades.');
  const tabela = calcularPrazos(hoje), ids = prioridades.map(p => p?.id);
  const problemas = [];
  for (const id of ids) if (!tabela.some(t => t.id === id)) problemas.push(`Processo inexistente: ${id}`);
  for (const t of tabela) if ((t.situacao === 'vencido' || t.situacao === 'urgente') && !ids.includes(t.id)) problemas.push(`${t.id} está ${t.situacao} e ficou fora das prioridades`);
  return { ok: problemas.length === 0, problemas };
}

/* ---------------- 3. Análise de vendas ---------------- */
export const PRODUTOS = [
  ['Café torrado 250 g', 'Mercearia', 22.9], ['Pão de queijo 1 kg', 'Congelados', 34.5], ['Queijo minas 500 g', 'Frios', 29.9],
  ['Granola 400 g', 'Mercearia', 18.7], ['Suco integral 1 L', 'Bebidas', 14.9], ['Mel 300 g', 'Mercearia', 26.0],
  ['Doce de leite 400 g', 'Mercearia', 16.5], ['Kombucha 500 ml', 'Bebidas', 12.9],
];
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function vendas(hoje) {
  // 90 dias até ontem, gerados sempre iguais para a mesma data (semente fixa por dia do ano).
  const out = [];
  for (let k = 90; k >= 1; k--) {
    const dia = somaDias(hoje, -k), dow = new Date(dia + 'T12:00:00Z').getUTCDay();
    const rand = rng(Number(dia.replaceAll('-', '')));
    const base = dow === 6 ? 1.6 : dow === 0 ? 0.6 : dow === 5 ? 1.3 : 1;
    const tendencia = 1 + (90 - k) * 0.004; // leve crescimento no período
    PRODUTOS.forEach(([produto, categoria, preco], i) => {
      const qtd = Math.round((3 + rand() * 9) * base * tendencia * (i === 7 && k < 30 ? 1.8 : 1));
      if (qtd > 0) out.push({ data: dia, produto, categoria, quantidade: qtd, receita: r2(qtd * preco) });
    });
  }
  return out;
}
const DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const noPeriodo = (rows, ini, fim) => rows.filter(r => (!ini || r.data >= ini) && (!fim || r.data <= fim));
const validData = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export function resumoPeriodo(rows, ini, fim) {
  if (!validData(ini) || !validData(fim)) return erro('Use datas no formato AAAA-MM-DD.');
  const p = noPeriodo(rows, ini, fim), dias = new Set(p.map(r => r.data)).size;
  const receita = r2(p.reduce((s, r) => s + r.receita, 0)), itens = p.reduce((s, r) => s + r.quantidade, 0);
  return { inicio: ini, fim, dias_com_venda: dias, receita_total: receita, itens_vendidos: itens, receita_media_por_dia: dias ? r2(receita / dias) : 0 };
}
export function topProdutos(rows, ini, fim, n = 5) {
  if (!validData(ini) || !validData(fim)) return erro('Use datas no formato AAAA-MM-DD.');
  const m = {};
  for (const r of noPeriodo(rows, ini, fim)) { m[r.produto] ??= { produto: r.produto, receita: 0, quantidade: 0 }; m[r.produto].receita += r.receita; m[r.produto].quantidade += r.quantidade; }
  return Object.values(m).map(x => ({ ...x, receita: r2(x.receita) })).sort((a, b) => b.receita - a.receita).slice(0, Math.max(1, Math.min(8, n | 0 || 5)));
}
export function compararPeriodos(rows, a, b) {
  const A = resumoPeriodo(rows, a?.inicio, a?.fim), B = resumoPeriodo(rows, b?.inicio, b?.fim);
  if (A.erro || B.erro) return erro('Use datas no formato AAAA-MM-DD nos dois períodos.');
  const v = (x, y) => (x ? r2(((y - x) / x) * 100) : null);
  return { periodo_a: A, periodo_b: B, variacao_receita_por_dia_pct: v(A.receita_media_por_dia, B.receita_media_por_dia) };
}
export function porDiaDaSemana(rows, ini, fim) {
  if (!validData(ini) || !validData(fim)) return erro('Use datas no formato AAAA-MM-DD.');
  const m = DOW.map(d => ({ dia: d, receita: 0, dias: new Set() }));
  for (const r of noPeriodo(rows, ini, fim)) { const x = m[new Date(r.data + 'T12:00:00Z').getUTCDay()]; x.receita += r.receita; x.dias.add(r.data); }
  return m.map(x => ({ dia: x.dia, receita_media: x.dias.size ? r2(x.receita / x.dias.size) : 0 }));
}

/* ---------------- Definição dos agentes para o Gemini ---------------- */
const O = (props, req = []) => ({ type: 'OBJECT', properties: props, required: req });
const S = d => ({ type: 'STRING', description: d });

export const AGENTES = {
  demandas: {
    nome: 'Distribuição de demandas diárias',
    sistema: `Você é um agente que distribui as demandas do dia de uma equipe de atendimento (dados fictícios).
Objetivo: atribuir TODAS as demandas, cada uma a uma pessoa que tenha a especialidade do tipo da demanda, sem passar dos minutos livres de ninguém, priorizando as de menor prazo.
Passos: 1) chame listar_demandas e listar_equipe; 2) monte um plano e teste com avaliar_plano; 3) corrija até não haver problemas; 4) chame entregar_plano. Nunca invente demandas ou pessoas. Escreva em português do Brasil.`,
    tarefa: () => 'Distribua as demandas de hoje entre a equipe.',
    ferramentas: [
      { name: 'listar_demandas', description: 'Lista as demandas do dia com tipo, esforço em minutos e prazo em horas.', parameters: O({}) },
      { name: 'listar_equipe', description: 'Lista a equipe com especialidades e minutos livres hoje.', parameters: O({}) },
      { name: 'avaliar_plano', description: 'Confere um plano de atribuições: especialidade, carga e demandas sem responsável.', parameters: O({ atribuicoes: { type: 'ARRAY', items: O({ demanda_id: S('Ex.: D-01'), pessoa: S('Nome da pessoa') }, ['demanda_id', 'pessoa']) } }, ['atribuicoes']) },
      { name: 'entregar_plano', description: 'Entrega o plano final para aprovação humana. Só é aceito se passar na avaliação.', parameters: O({ atribuicoes: { type: 'ARRAY', items: O({ demanda_id: S('Ex.: D-01'), pessoa: S('Nome') }, ['demanda_id', 'pessoa']) }, resumo: S('Explique o critério em até 3 frases.') }, ['atribuicoes', 'resumo']) },
    ],
    executar(nome, args) {
      if (nome === 'listar_demandas') return DEMANDAS;
      if (nome === 'listar_equipe') return EQUIPE;
      if (nome === 'avaliar_plano') return avaliarPlano(args?.atribuicoes);
      return erro('Ferramenta desconhecida.');
    },
    finalizar(args) {
      const v = avaliarPlano(args?.atribuicoes);
      return v.ok ? { ok: true, entrega: { atribuicoes: args.atribuicoes, resumo: String(args.resumo || '').slice(0, 600), carga_min_por_pessoa: v.carga_min_por_pessoa } } : v;
    },
  },
  prazos: {
    nome: 'Controle de prazos',
    sistema: `Você é um agente que acompanha prazos de processos de um setor jurídico (dados fictícios).
Objetivo: montar o briefing do dia com as prioridades, começando pelos vencidos e urgentes, e dizer quem precisa agir.
Passos: 1) chame calcular_prazos; 2) se precisar, use detalhar_processo; 3) chame entregar_briefing com todos os vencidos e urgentes nas prioridades. Os dias são calculados pelo código: nunca recalcule nem invente datas. Escreva em português do Brasil.`,
    tarefa: (_, hoje) => `Hoje é ${hoje}. Monte o briefing de prazos do dia.`,
    ferramentas: [
      { name: 'calcular_prazos', description: 'Calcula dias restantes, dias sem movimentação e a situação de cada processo, do mais urgente ao menos urgente.', parameters: O({}) },
      { name: 'detalhar_processo', description: 'Mostra os dados de um processo.', parameters: O({ id: S('Ex.: PR-0101') }, ['id']) },
      { name: 'entregar_briefing', description: 'Entrega o briefing para aprovação humana. Recusado se faltar algum vencido ou urgente.', parameters: O({ prioridades: { type: 'ARRAY', items: O({ id: S('Processo'), acao: S('O que fazer hoje, em uma frase'), responsavel: S('Quem') }, ['id', 'acao', 'responsavel']) }, resumo: S('Resumo do dia em até 3 frases.') }, ['prioridades', 'resumo']) },
    ],
    executar(nome, args, hoje) {
      if (nome === 'calcular_prazos') return calcularPrazos(hoje);
      if (nome === 'detalhar_processo') return processos(hoje).find(p => p.id === args?.id) || erro('Processo não encontrado.');
      return erro('Ferramenta desconhecida.');
    },
    finalizar(args, hoje) {
      const v = avaliarBriefing(args?.prioridades, hoje);
      if (!v.ok) return v;
      const t = calcularPrazos(hoje);
      return { ok: true, entrega: { prioridades: args.prioridades.map(p => ({ ...p, ...(t.find(x => x.id === p.id) || {}) })), resumo: String(args.resumo || '').slice(0, 600) } };
    },
  },
  vendas: {
    nome: 'Análise de dados de vendas',
    sistema: `Você é um agente que analisa as vendas de uma loja fictícia de produtos naturais, para ajudar o dono a decidir.
Regras: toda conta é feita pelas ferramentas. Use SOMENTE números que vieram delas e cite de qual ferramenta veio cada número. Se a base não responde a pergunta, diga isso. Comece por info_base para saber o período disponível. Termine sempre com entregar_resposta. Escreva em português do Brasil, de forma curta e prática.`,
    tarefa: (pergunta) => pergunta,
    ferramentas: [
      { name: 'info_base', description: 'Período disponível, produtos e categorias.', parameters: O({}) },
      { name: 'resumo_periodo', description: 'Receita total, itens vendidos e receita média por dia num período.', parameters: O({ inicio: S('AAAA-MM-DD'), fim: S('AAAA-MM-DD') }, ['inicio', 'fim']) },
      { name: 'top_produtos', description: 'Produtos que mais faturaram num período.', parameters: O({ inicio: S('AAAA-MM-DD'), fim: S('AAAA-MM-DD'), n: { type: 'INTEGER', description: 'Quantos, de 1 a 8' } }, ['inicio', 'fim']) },
      { name: 'comparar_periodos', description: 'Compara dois períodos pela receita média por dia.', parameters: O({ a: O({ inicio: S('AAAA-MM-DD'), fim: S('AAAA-MM-DD') }, ['inicio', 'fim']), b: O({ inicio: S('AAAA-MM-DD'), fim: S('AAAA-MM-DD') }, ['inicio', 'fim']) }, ['a', 'b']) },
      { name: 'vendas_por_dia_da_semana', description: 'Receita média por dia da semana num período.', parameters: O({ inicio: S('AAAA-MM-DD'), fim: S('AAAA-MM-DD') }, ['inicio', 'fim']) },
      { name: 'entregar_resposta', description: 'Entrega a resposta final para o dono da loja.', parameters: O({ resposta: S('Resposta curta, com recomendação.'), numeros: { type: 'ARRAY', items: O({ valor: S('Número citado'), origem: S('Ferramenta de onde veio') }, ['valor', 'origem']) } }, ['resposta', 'numeros']) },
    ],
    executar(nome, args, hoje) {
      const rows = vendas(hoje);
      if (nome === 'info_base') return { inicio: rows[0].data, fim: rows.at(-1).data, produtos: PRODUTOS.map(p => ({ produto: p[0], categoria: p[1], preco: p[2] })), observacao: 'Dados fictícios, gerados para a demonstração.' };
      if (nome === 'resumo_periodo') return resumoPeriodo(rows, args?.inicio, args?.fim);
      if (nome === 'top_produtos') return topProdutos(rows, args?.inicio, args?.fim, args?.n);
      if (nome === 'comparar_periodos') return compararPeriodos(rows, args?.a, args?.b);
      if (nome === 'vendas_por_dia_da_semana') return porDiaDaSemana(rows, args?.inicio, args?.fim);
      return erro('Ferramenta desconhecida.');
    },
    finalizar(args) {
      if (!args?.resposta) return erro('Escreva a resposta.');
      const nums = Array.isArray(args.numeros) ? args.numeros.slice(0, 12) : [];
      return { ok: true, entrega: { resposta: String(args.resposta).slice(0, 1500), numeros: nums } };
    },
  },
};
/* ---------------- 4. Layout de sites ---------------- */
export const SECOES = {
  hero: 'Abertura com título, frase e botão principal',
  prova_social: 'Depoimentos, números ou logos de clientes',
  servicos: 'Lista de serviços ou produtos com preço ou chamada',
  como_funciona: 'Passo a passo em 3 ou 4 etapas',
  galeria: 'Fotos do espaço, do produto ou de trabalhos',
  cardapio: 'Itens com preço, por categoria',
  agenda: 'Horários, datas ou botão de agendamento',
  sobre: 'Quem está por trás do negócio',
  faq: 'Perguntas frequentes',
  mapa_contato: 'Endereço, horário e contato',
  cta_final: 'Chamada final para ação',
};
export const FONTES = ['Inter', 'Manrope', 'DM Sans', 'Space Grotesk', 'Bricolage Grotesque', 'Fraunces', 'Playfair Display', 'Archivo Black', 'Sora', 'Outfit', 'Lora', 'IBM Plex Sans'];
const hex = s => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
function lum(h) {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a, b) {
  if (!hex(a) || !hex(b)) return erro('Use cores no formato #RRGGBB.');
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  const razao = r2((x + 0.05) / (y + 0.05));
  return { cor_a: a, cor_b: b, razao, texto_normal_ok: razao >= 4.5, texto_grande_ok: razao >= 3 };
}
export function avaliarProposta(p) {
  const problemas = [];
  const secs = Array.isArray(p?.secoes) ? p.secoes : [];
  if (secs.length < 4 || secs.length > 8) problemas.push('Use de 4 a 8 seções.');
  for (const s of secs) if (!SECOES[s?.tipo]) problemas.push(`Seção desconhecida: ${s?.tipo}`);
  if (secs[0]?.tipo !== 'hero') problemas.push('A primeira seção deve ser hero.');
  const c = p?.paleta || {};
  for (const k of ['fundo', 'texto', 'destaque', 'texto_no_destaque']) if (!hex(c[k])) problemas.push(`Cor ${k} inválida (use #RRGGBB).`);
  if (!problemas.length) {
    if (!contraste(c.texto, c.fundo).texto_normal_ok) problemas.push(`Contraste texto/fundo ${contraste(c.texto, c.fundo).razao}:1, abaixo de 4,5:1.`);
    if (!contraste(c.texto_no_destaque, c.destaque).texto_normal_ok) problemas.push(`Contraste do botão ${contraste(c.texto_no_destaque, c.destaque).razao}:1, abaixo de 4,5:1.`);
  }
  for (const f of [p?.fonte_titulo, p?.fonte_texto]) if (!FONTES.includes(f)) problemas.push(`Fonte fora do catálogo: ${f}`);
  return { ok: problemas.length === 0, problemas };
}
AGENTES.layout = {
  nome: 'Ideias de layout de site',
  sistema: `Você é um agente que propõe o layout da página inicial de um site para um pequeno negócio.
Objetivo: uma proposta específica para aquele negócio, não genérica: ordem das seções, textos curtos de cada seção, paleta e fontes, com contraste acessível.
Passos: 1) chame listar_secoes e listar_fontes; 2) escolha cores e confira cada par com verificar_contraste (texto sobre fundo e texto sobre o botão, mínimo 4,5:1); 3) chame entregar_proposta. Se for recusada, corrija. Escreva em português do Brasil.`,
  tarefa: (pergunta) => `Negócio: ${pergunta}`,
  ferramentas: [
    { name: 'listar_secoes', description: 'Catálogo de seções de página que o site pode usar.', parameters: O({}) },
    { name: 'listar_fontes', description: 'Fontes disponíveis.', parameters: O({}) },
    { name: 'verificar_contraste', description: 'Calcula o contraste entre duas cores (regra WCAG).', parameters: O({ cor_a: S('#RRGGBB'), cor_b: S('#RRGGBB') }, ['cor_a', 'cor_b']) },
    { name: 'entregar_proposta', description: 'Entrega a proposta para aprovação humana. Recusada se tiver seção fora do catálogo, contraste baixo ou fonte inválida.', parameters: O({
      nome_do_site: S('Nome curto'),
      conceito: S('A ideia do layout em até 2 frases'),
      secoes: { type: 'ARRAY', items: O({ tipo: S('Tipo do catálogo'), titulo: S('Título da seção'), texto: S('Texto curto, até 25 palavras') }, ['tipo', 'titulo', 'texto']) },
      paleta: O({ fundo: S('#RRGGBB'), texto: S('#RRGGBB'), destaque: S('#RRGGBB'), texto_no_destaque: S('#RRGGBB') }, ['fundo', 'texto', 'destaque', 'texto_no_destaque']),
      fonte_titulo: S('Fonte do catálogo'), fonte_texto: S('Fonte do catálogo'),
      botao_principal: S('Texto do botão do hero'),
    }, ['nome_do_site', 'conceito', 'secoes', 'paleta', 'fonte_titulo', 'fonte_texto', 'botao_principal']) },
  ],
  executar(nome, args) {
    if (nome === 'listar_secoes') return SECOES;
    if (nome === 'listar_fontes') return FONTES;
    if (nome === 'verificar_contraste') return contraste(args?.cor_a, args?.cor_b);
    return erro('Ferramenta desconhecida.');
  },
  finalizar(args) {
    const v = avaliarProposta(args);
    if (!v.ok) return v;
    const c = args.paleta;
    return { ok: true, entrega: { ...args, contraste_texto: contraste(c.texto, c.fundo).razao, contraste_botao: contraste(c.texto_no_destaque, c.destaque).razao } };
  },
};

export const FINAL = { demandas: 'entregar_plano', prazos: 'entregar_briefing', vendas: 'entregar_resposta', layout: 'entregar_proposta' };

// Dados que a página mostra antes de rodar o agente.
export function previa(agente, hoje) {
  if (agente === 'demandas') return { demandas: DEMANDAS, equipe: EQUIPE };
  if (agente === 'prazos') return { hoje, processos: processos(hoje) };
  if (agente === 'vendas') { const v = vendas(hoje); return { inicio: v[0].data, fim: v.at(-1).data, linhas: v.length, produtos: PRODUTOS.map(p => ({ produto: p[0], categoria: p[1], preco: p[2] })) }; }
  if (agente === 'layout') return { secoes: SECOES, fontes: FONTES };
  return null;
}
