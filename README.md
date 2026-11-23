# Portfólio AI Builder · Kelvin de Souza Silva

Site: https://portfolioaibuilder.vercel.app/

## Agentes de IA ao vivo (`/agentes`)

Quatro agentes reais, com dados fictícios. O Gemini decide quais ferramentas chamar (function calling); o código faz as contas, confere as regras e só aceita a entrega se ela passar; uma pessoa aprova no fim.

| Agente | Ferramentas | O que o código confere |
|---|---|---|
| Distribuição de demandas | `listar_demandas`, `listar_equipe`, `avaliar_plano`, `entregar_plano` | Especialidade, carga de cada pessoa, demanda sem responsável |
| Controle de prazos | `calcular_prazos`, `detalhar_processo`, `entregar_briefing` | Dias restantes; vencidos e urgentes não podem ficar de fora |
| Análise de vendas | `info_base`, `resumo_periodo`, `top_produtos`, `comparar_periodos`, `vendas_por_dia_da_semana`, `entregar_resposta` | Todas as contas; cada número da resposta traz a origem |
| Layout de site | `listar_secoes`, `listar_fontes`, `verificar_contraste`, `entregar_proposta` | Seções do catálogo, fontes válidas, contraste WCAG ≥ 4,5:1 |

- `api/agente.js`: função serverless na Vercel com o laço do agente (até 8 passos).
- `api/_agentes.js`: dados fictícios, ferramentas e regras.
- `agentes/index.html`: a página, com o caminho do agente e o botão de aprovação.

### Variáveis na Vercel

| Nome | Para quê |
|---|---|
| `GEMINI_API_KEY` | Liga os agentes (Production e Preview) |
| `GEMINI_MODEL` | Opcional. Padrão `gemini-3.5-flash-lite` |

### Testes

```bash
npm test
```
