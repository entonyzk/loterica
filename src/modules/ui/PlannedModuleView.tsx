import React from 'react';

export interface PlannedModuleSpec {
  title: string;
  targetStage: string;
  summary: string;
  mathematicalScope: string[];
  databaseTablesPrepared: string[];
  plannedEndpoints: string[];
}

export const PLANNED_MODULES: Record<
  'estatisticas' | 'simulador' | 'gerador' | 'fechamentos',
  PlannedModuleSpec
> = {
  estatisticas: {
    title: 'Estatísticas Descritivas',
    targetStage: 'Planejado · Etapa 3',
    summary:
      'Análise descritiva transparente de frequências absolutas, relativas, atrasos observados e distribuição de paridade/soma sobre concursos oficiais verificados, sem confundir frequência histórica com probabilidade futura.',
    mathematicalScope: [
      'Frequência histórica observada (Pandas / NumPy) separada da probabilidade teórica.',
      'Testes de aderência Qui-Quadrado (SciPy) sobre séries históricas verificadas.',
      'Proibição estrita de percentuais preditivos gerados por IA.',
    ],
    databaseTablesPrepared: ['contests', 'drawn_numbers', 'analysis_history'],
    plannedEndpoints: ['GET /api/statistics/:lotteryId', 'POST /api/analyses'],
  },
  simulador: {
    title: 'Simulador Monte Carlo',
    targetStage: 'Planejado · Etapa 4',
    summary:
      'Execução de simulações estocásticas em larga escala com semente aleatória explícita e reproduzível para avaliar variância, retorno esperado e dispersão estatística de estratégias.',
    mathematicalScope: [
      'Geração pseudoaleatória auditável via `random_seed` armazenada no PostgreSQL.',
      'Separação clara entre resultados simulados e concursos oficiais reais.',
      'Execução isolada no motor Python (`math_engine`).',
    ],
    databaseTablesPrepared: ['simulations', 'lottery_rule_versions', 'strategies'],
    plannedEndpoints: ['POST /api/simulations'],
  },
  gerador: {
    title: 'Gerador de Jogos',
    targetStage: 'Planejado · Etapa 6',
    summary:
      'Construção paramétrica de combinações respeitando integralmente as regras versionadas da modalidade selecionada e critérios matemáticos verificáveis pelo usuário.',
    mathematicalScope: [
      'Validação rígida contra `lottery_rule_versions` vigente.',
      'Transparência sobre equivalência probabilística de combinações individuais em sorteios justos.',
      'Registro opcional em `user_bets` para conferência futura.',
    ],
    databaseTablesPrepared: ['lottery_rule_versions', 'user_bets', 'strategies'],
    plannedEndpoints: ['Contratos a definir na Etapa 6'],
  },
  fechamentos: {
    title: 'Fechamentos Combinatórios',
    targetStage: 'Planejado · Etapa 6',
    summary:
      'Matrizes de cobertura combinatória (wheeling systems) com garantia matemática condicional explícita (v, k, t, m) e custo total calculado antes do registro.',
    mathematicalScope: [
      'Cobertura determinística de subconjuntos para garantia de acerto mínimo condicional.',
      'Verificação formal da garantia matemática antes da exposição ao usuário.',
      'Backtesting histórico compatível com `backtest_runs`.',
    ],
    databaseTablesPrepared: ['strategies', 'backtest_runs', 'user_bets'],
    plannedEndpoints: ['Contratos a definir na Etapa 6'],
  },
};

export const PlannedModuleView: React.FC<{ spec: PlannedModuleSpec }> = ({ spec }) => {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="text-[#8B5CF6] font-medium">{spec.targetStage}</span>
          <span aria-hidden="true">·</span>
          <span>Módulo em Desenvolvimento Arquitetural</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[#F1F2F4]">
          {spec.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-300">{spec.summary}</p>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-2">
          <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Diretrizes Matemáticas e Funcionais Previstas
          </h2>
          <ul className="mt-4 space-y-3 border-t border-white/8 pt-4 text-sm text-neutral-300">
            {spec.mathematicalScope.map((item) => (
              <li key={item} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-5">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
              Tabelas PostgreSQL Preparadas
            </h2>
            <ul className="mt-3 space-y-1.5 font-mono-tabular text-xs text-[#E5C158]">
              {spec.databaseTablesPrepared.map((tbl) => (
                <li key={tbl}>{tbl}</li>
              ))}
            </ul>
          </div>

          <div className="border-t border-white/8 pt-4">
            <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
              Contratos de API Planejados
            </h3>
            <ul className="mt-3 space-y-1.5 font-mono-tabular text-xs text-neutral-300">
              {spec.plannedEndpoints.map((ep) => (
                <li key={ep}>{ep}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-white/8 bg-[#12141A] p-5 text-xs text-neutral-400">
        Nota de integridade da Etapa 1: Este módulo está identificado como planejado. Controles
        de execução não foram expostos antecipadamente para evitar simular funcionalidades ainda
        não implementadas.
      </div>
    </div>
  );
};
