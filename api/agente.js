// Agentes de IA do portfólio: o Gemini escolhe as ferramentas, o código executa e confere.
// A chave do Gemini fica só aqui, no servidor (variável GEMINI_API_KEY na Vercel).
import { AGENTES, FINAL, hojeISO, previa } from './_agentes.js';

const MAX_PASSOS = 8;
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = hits.get(ip)?.filter(t => now - t < 60_000) || [];
  win.push(now); hits.set(ip, win);
  if (hits.size > 5000) hits.clear();
  return win.length > 6;
}
const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};
const fail = (message, status) => Object.assign(new Error(message), { status });

export async function rodarAgente({ agente, pergunta = '', env = process.env, fetcher = fetch, agora = new Date() }) {
  const A = AGENTES[agente];
  if (!A) throw fail('Agente desconhecido.', 400);
  const key = env.GEMINI_API_KEY;
  if (!key) throw fail('Configure GEMINI_API_KEY na Vercel para ligar os agentes.', 503);
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  if (!/^[a-zA-Z0-9.-]{1,100}$/.test(model)) throw fail('GEMINI_MODEL inválido.', 503);
  const hoje = hojeISO(agora);
  const contents = [{ role: 'user', parts: [{ text: A.tarefa(pergunta, hoje) + (agente === 'vendas' ? `\n(Hoje é ${hoje}.)` : '') }] }];
  const passos = [], t0 = Date.now();
  let tokens = 0;

  for (let i = 0; i < MAX_PASSOS; i++) {
    let r;
    try {
      r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: A.sistema }] },
          contents,
          tools: [{ functionDeclarations: A.ferramentas }],
          toolConfig: { functionCallingConfig: { mode: 'ANY' } },
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch { throw fail('O Gemini demorou para responder. Tente novamente.', 504); }
    if (!r.ok) throw fail(r.status === 429 ? 'Cota do Gemini esgotada no momento. Tente mais tarde.' : 'O Gemini está indisponível no momento.', 502);
    const data = await r.json().catch(() => null);
    tokens += data?.usageMetadata?.totalTokenCount || 0;
    const content = data?.candidates?.[0]?.content;
    const calls = (content?.parts || []).filter(p => p.functionCall);
    if (!calls.length) throw fail('O agente parou sem entregar. Tente novamente.', 502);
    contents.push(content); // devolve as partes como vieram (inclui assinaturas de raciocínio)

    const respostas = [];
    for (const { functionCall: fc } of calls) {
      const args = fc.args || {};
      if (fc.name === FINAL[agente]) {
        const fim = A.finalizar(args, hoje);
        passos.push({ ferramenta: fc.name, args, resultado: fim.ok ? 'aceito' : fim });
        if (fim.ok) return { agente, nome: A.nome, hoje, passos, entrega: fim.entrega, modelo: model, ms: Date.now() - t0, tokens };
        respostas.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: { recusado: fim } } });
      } else {
        const out = A.executar(fc.name, args, hoje);
        passos.push({ ferramenta: fc.name, args, resultado: out });
        const txt = JSON.stringify(out);
        respostas.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: txt.length > 6000 ? { resultado_resumido: txt.slice(0, 6000) } : { resultado: out } } });
      }
    }
    contents.push({ role: 'user', parts: respostas });
  }
  throw fail('O agente não chegou a uma entrega aceita em 8 passos. Tente novamente.', 502);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const d = previa(String(req.query?.agente || ''), hojeISO());
    return d ? send(res, 200, d) : send(res, 404, { message: 'Agente desconhecido.' });
  }
  if (req.method !== 'POST') return send(res, 405, { message: 'Use GET ou POST.' });
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { message: 'Origem não permitida.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local';
  if (limited(ip)) return send(res, 429, { message: 'Muitas execuções seguidas. Aguarde um minuto.' });
  const agente = String(req.body?.agente || '');
  const pergunta = typeof req.body?.pergunta === 'string' ? req.body.pergunta.trim().slice(0, 300) : '';
  if ((agente === 'vendas' || agente === 'layout') && pergunta.length < 5) return send(res, 422, { message: agente === 'vendas' ? 'Escreva uma pergunta sobre as vendas.' : 'Descreva o negócio do site.' });
  try {
    return send(res, 200, await rodarAgente({ agente, pergunta }));
  } catch (e) {
    return send(res, e.status || 500, { message: e.status ? e.message : 'Erro inesperado no agente.' });
  }
}
