import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Database, Layers, ShieldCheck, Sigma } from 'lucide-react';
import { buildHypergeometricDistribution } from '../probabilities/combinatorics';

export type NavSectionId =
  | 'inicio'
  | 'loterias'
  | 'estatisticas'
  | 'laboratorio'
  | 'simulador'
  | 'gerador'
  | 'fechamentos'
  | 'historico'
  | 'conta'
  | 'admin';

interface HealthSummary {
  status: string;
  stage: string;
  database: string;
  axiom: string;
  mathEngine: {
    mode: string;
    configuredUrl: string | null;
    availableInLocalSandbox: boolean;
    reason: string;
  };
  aiLayer: {
    provider: string;
    configured: boolean;
    isolatedFromMathCalculations: boolean;
  };
}

interface OverviewDashboardProps {
  onNavigate: (section: NavSectionId) => void;
}

const MODULE_ROADMAP = [
  {
    name: 'Banco Relacional PostgreSQL (14 entidades)',
    module: 'Dados & Persistência',
    stage: 'Etapa 1',
    status: 'Implementado',
  },
  {
    name: 'Catálogo Flexível de Modalidades e Eventos Especiais',
    module: 'Modalidades',
    stage: 'Etapa 1',
    status: 'Implementado',
  },
  {
    name: 'Autenticação Firebase + Sincronização PostgreSQL + RBAC',
    module: 'Segurança & Usuários',
    stage: 'Etapa 1',
    status: 'Implementado',
  },
  {
    name: 'Estrutura Multiplataforma Web + PWA + Capacitor Android',
    module: 'Interface & Mobile',
    stage: 'Etapa 1',
    status: 'Implementado',
  },
  {
    name: 'Motor Matemático Especializado (Mega-Sena e Lotofácil)',
    module: 'Probabilidades & Combinatória',
    stage: 'Etapa 2',
    status: 'Implementado',
  },
  {
    name: 'Ingestão de Resultados Históricos e Concursos Oficiais',
    module: 'Dados Históricos & Concursos',
    stage: 'Etapa 3',
    status: 'Planejado',
  },
  {
    name: 'Frequências Descritivas e Análise Probabilística',
    module: 'Estatísticas & Probabilidades',
    stage: 'Etapa 3',
    status: 'Planejado',
  },
  {
    name: 'Simulador Monte Carlo com Semente Reproduzível',
    module: 'Simulações',
    stage: 'Etapa 4',
    status: 'Planejado',
  },
  {
    name: 'Motor de Backtesting, Gerador e Fechamentos Combinatórios',
    module: 'Estratégias & Fechamentos',
    stage: 'Etapas 5–6',
    status: 'Planejado',
  },
];

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ onNavigate }) => {
  const [lotteriesCount, setLotteriesCount] = useState<number | null>(null);
  const [specialEventsCount, setSpecialEventsCount] = useState<number | null>(null);
  const [contestsCount, setContestsCount] = useState<number | null>(null);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      try {
        const [lotRes, conRes, healthRes] = await Promise.all([
          fetch('/api/lotteries'),
          fetch('/api/contests'),
          fetch('/api/health'),
        ]);
        if (!lotRes.ok || !conRes.ok || !healthRes.ok) {
          throw new Error('Falha ao consultar APIs da fundação.');
        }
        const [lotJson, conJson, healthJson] = await Promise.all([
          lotRes.json(),
          conRes.json(),
          healthRes.json(),
        ]);

        if (!active) return;
        setLotteriesCount(lotJson.total ?? 0);
        const eventsTotal = Array.isArray(lotJson.items)
          ? lotJson.items.reduce(
              (acc: number, item: { specialEvents?: unknown[] }) =>
                acc + (item.specialEvents?.length ?? 0),
              0
            )
          : 0;
        setSpecialEventsCount(eventsTotal);
        setContestsCount(conJson.total ?? 0);
        setHealth(healthJson);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar visão geral.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadOverview();
    return () => {
      active = false;
    };
  }, []);

  // Curva teórica ilustrativa pura (amostragem hipergeométrica genérica N=50, k=5, m=5)
  const theoreticalCurve = useMemo(() => buildHypergeometricDistribution(50, 5, 5), []);
  const maxProb = useMemo(
    () => Math.max(...theoreticalCurve.map((p) => p.probability), 0.01),
    [theoreticalCurve]
  );

  return (
    <div className="space-y-8">
      {/* Focal Anchor: Hero Arquitetural + Gráfico Teórico */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col justify-between rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-7 lg:p-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="text-[#E5C158] font-medium">Etapa 2</span>
              <span aria-hidden="true">·</span>
              <span>Motor Matemático Especializado e Combinatória Verificável</span>
            </div>

            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F1F2F4] sm:text-3xl text-balance">
              Inteligência matemática, estatística descritiva e simulação auditável.
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-neutral-300">
              A plataforma LOTUS AI separa rigorosamente probabilidade teórica, frequência
              histórica observada, simulações Monte Carlo e interpretação conceitual por IA.
              Nenhum cálculo probabilístico é delegado a modelos generativos e nenhum resultado
              de sorteio é simulado sem fonte oficial validada.
            </p>
          </div>

          <div className="mt-6 border-t border-white/8 pt-5">
            <p className="text-xs font-medium text-[#E5C158]">
              Axioma Fundamental de Independência
            </p>
            <p className="mt-1.5 font-mono-tabular text-xs leading-relaxed text-neutral-300">
              {health?.axiom ??
                'Em sorteios justos e independentes, resultados anteriores não alteram a probabilidade matemática dos próximos resultados.'}
            </p>
          </div>
        </div>

        {/* Gráfico SVG Moderno: Distribuição Hipergeométrica Teórica de Referência */}
        <div className="flex flex-col justify-between rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Modelo Hipergeométrico de Referência
              </h2>
              <span className="font-mono-tabular text-xs text-[#8B5CF6]">P(X = h)</span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Exemplo teórico puro (N=50, k=5, m=5) · Sem dados de concursos reais
            </p>
          </div>

          <div className="my-5">
            <svg
              viewBox="0 0 360 150"
              className="w-full overflow-visible"
              role="img"
              aria-label="Gráfico de distribuição teórica hipergeométrica de referência"
            >
              {/* Grid lines */}
              {[0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = 122 - ratio * 98;
                return (
                  <line
                    key={ratio}
                    x1="28"
                    y1={y}
                    x2="348"
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="3 3"
                  />
                );
              })}

              {/* Bars */}
              {theoreticalCurve.map((point, idx) => {
                const barWidth = 34;
                const gap = 18;
                const x = 40 + idx * (barWidth + gap);
                const height = Math.max(3, (point.probability / maxProb) * 98);
                const y = 122 - height;
                const isZeroOrLow = idx <= 1;
                return (
                  <g key={point.hits}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx={4}
                      fill={isZeroOrLow ? '#7C3AED' : '#D4AF37'}
                      fillOpacity={isZeroOrLow ? 0.8 : 0.9}
                    />
                    <text
                      x={x + barWidth / 2}
                      y={140}
                      textAnchor="middle"
                      className="fill-neutral-400 text-[10px]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {point.hits} ac.
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="fill-neutral-300 text-[9px]"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {(point.probability * 100).toFixed(2)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="flex items-center justify-between border-t border-white/8 pt-4">
            <span className="text-xs text-neutral-400">Combinatória exata em BigInt</span>
            <button
              type="button"
              onClick={() => onNavigate('laboratorio')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#E5C158] hover:text-[#F6E299] cursor-pointer whitespace-nowrap"
            >
              Abrir Laboratório
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Strip de Métricas Estruturais (4 Colunas) */}
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-[#12141A] p-4 text-sm text-red-300">
          {error}
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/8 bg-[#12141A] p-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Modalidades Cadastradas</span>
              <Layers className="h-4 w-4 text-[#D4AF37]" aria-hidden="true" />
            </div>
            <p className="mt-3 font-mono-tabular text-2xl font-semibold text-[#F1F2F4]">
              {loading ? '—' : lotteriesCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {loading ? 'Consultando PostgreSQL' : `${specialEventsCount ?? 0} eventos especiais vinculados`}
            </p>
          </div>

          <div className="rounded-xl border border-white/8 bg-[#12141A] p-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Concursos Verificados</span>
              <Database className="h-4 w-4 text-[#8B5CF6]" aria-hidden="true" />
            </div>
            <p className="mt-3 font-mono-tabular text-2xl font-semibold text-[#F1F2F4]">
              {loading ? '—' : contestsCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Ingestão histórica prevista na Etapa 3
            </p>
          </div>

          <div className="rounded-xl border border-white/8 bg-[#12141A] p-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Entidades Relacionais</span>
              <ShieldCheck className="h-4 w-4 text-[#D4AF37]" aria-hidden="true" />
            </div>
            <p className="mt-3 font-mono-tabular text-2xl font-semibold text-[#F1F2F4]">14</p>
            <p className="mt-1 text-xs text-neutral-400">
              PostgreSQL Cloud SQL com FKs e índices
            </p>
          </div>

          <div className="rounded-xl border border-white/8 bg-[#12141A] p-5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Motor Matemático</span>
              <Sigma className="h-4 w-4 text-[#8B5CF6]" aria-hidden="true" />
            </div>
            <p className="mt-3 font-mono-tabular text-2xl font-semibold text-[#F1F2F4]">
              Python
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Desacoplado via contrato REST externo
            </p>
          </div>
        </section>
      )}

      {/* Últimos Resultados (Somente quando houver fonte de dados válida) */}
      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
              Últimos Resultados Oficiais
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Exibição condicional estrita à validação de fonte oficial em `data_sources`
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('historico')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E5C158] hover:text-[#F6E299] cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            Ver histórico de concursos
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 border-t border-white/8 pt-5">
          <p className="text-sm text-neutral-300">
            Nenhum resultado oficial carregado nesta etapa.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">
            Por diretriz de integridade científica do LOTUS AI, resultados de loterias não são
            inventados nem preenchidos com dados fictícios. Regras verificadas de Mega-Sena e
            Lotofácil já estão ativas no Laboratório Matemático; a série histórica de concursos será
            ingerida na Etapa 3.
          </p>
        </div>
      </section>

      {/* Tabela de Estado da Arquitetura por Módulo */}
      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
              Mapa de Implementação da Plataforma
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Transparência de entregas até a Etapa 2 (atual) e etapas seguintes
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 hover:text-white cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            Inspecionar OpenAPI e Painel Admin
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-xs text-neutral-400">
                <th className="py-2.5 pr-4 font-medium">Capacidade Arquitetural</th>
                <th className="py-2.5 px-4 font-medium">Módulo</th>
                <th className="py-2.5 px-4 font-medium">Etapa</th>
                <th className="py-2.5 pl-4 text-right font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {MODULE_ROADMAP.map((row) => (
                <tr key={row.name} className="hover:bg-white/[0.02]">
                  <td className="py-3 pr-4 text-neutral-200">{row.name}</td>
                  <td className="py-3 px-4 text-xs text-neutral-400 whitespace-nowrap">
                    {row.module}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-xs text-neutral-400 whitespace-nowrap">
                    {row.stage}
                  </td>
                  <td
                    className={`py-3 pl-4 text-right text-xs font-medium whitespace-nowrap ${
                      row.status === 'Implementado' ? 'text-[#E5C158]' : 'text-neutral-400'
                    }`}
                  >
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
