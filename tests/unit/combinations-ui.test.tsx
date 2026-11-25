// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

function buildAnalyzeMockResponse() {
  return {
    lottery_code: 'mega-sena',
    universe_size: 60,
    drawn_count: 6,
    chosen_count: 6,
    partition: {
      fixed_numbers: [1],
      excluded_numbers: [60],
      explicit_excluded_numbers: [60],
      variable_numbers: Array.from({ length: 58 }, (_, i) => i + 2),
      fixed_count: 1,
      excluded_count: 1,
      variable_count: 58,
      remaining_slots: 5,
    },
    combinatorics: {
      total_unrestricted_combinations: '50063860',
      total_simple_space_combinations: '50063860',
      restricted_combinations: '4582116',
      restricted_share_exact_numerator: '4582116',
      restricted_share_exact_denominator: '50063860',
      restricted_share_percentage: '9.15254%',
      reduction_factor: 10.9259,
      equivalent_simple_bets_per_game: '1',
      permutations_k_from_m: '720',
      internal_bet_permutations_m_factorial: '720',
      permutations_applicability_note:
        'Em loterias numéricas sem ordem de extração, a contagem usa C(m, k).',
      formula: '|Ω_restrito| = C(N − |E| − |F|, m − |F|)',
      substituted_formula: 'C(60 − 1 − 1, 6 − 1) = C(58, 5) = 4582116',
    },
    budget_and_costs: {
      simple_bet_price_cents: 600,
      unit_bet_cost_cents: '600',
      price_updated_at: '2025-07-10T00:00:00.000Z',
      price_source: 'CAIXA',
      desired_games_count: 10,
      feasible_desired_games: '10',
      max_budget_cents: '12000',
      affordable_games_count: '20',
      planned_games_count: '10',
      planned_total_cost_cents: '6000',
      remaining_budget_cents: '6000',
      left_out_by_budget: '0',
      left_out_from_restricted_space: '4582106',
      full_restricted_closure_cost_cents: '2749269600',
      planned_vs_restricted_fraction: '10 / 4582116',
      planned_vs_restricted_percentage: '0.000218%',
      planned_nominal_simple_combinations: '10',
      upper_bound_simple_space_fraction: '10 / 50063860',
    },
    bet_set_analysis: {
      lottery_code: 'mega-sena',
      universe_size: 60,
      drawn_count: 6,
      chosen_count: 6,
      counts: {
        submitted_bets_count: 2,
        distinct_bets_count: 2,
        repeated_bets_count: 0,
        duplicate_groups: [],
        constraint_violations: [],
        all_bets_respect_constraints: true,
      },
      intersections: {
        distinct_pair_count: 1,
        min_overlap: 2,
        max_overlap: 2,
        avg_overlap: 2,
        avg_overlap_exact: '2/1',
        disjoint_pairs_count: 0,
        overlap_histogram: { '2': 1 },
        top_overlapping_pairs: [{ bet_a: 1, bet_b: 2, overlap: 2 }],
      },
      redundancy: {
        simple_combinations_per_bet: '1',
        nominal_simple_combinations: '2',
        exact_simple_expansion_computed: true,
        distinct_simple_combinations: '2',
        redundant_simple_combinations: '0',
        redundancy_rate_percentage: '0%',
        main_prize_exact: null,
      },
      distribution: {
        used_numbers_count: 10,
        unused_numbers_count: 50,
        unused_numbers: [],
        number_frequency: Array.from({ length: 60 }, (_, i) => ({
          number: i + 1,
          count: i < 10 ? 1 : 0,
          pct_of_bets: i < 10 ? 50 : 0,
        })),
        sum_min: 21,
        sum_max: 45,
        sum_avg: 33,
        even_min: 3,
        even_max: 3,
        even_avg: 3,
      },
      costs: {
        simple_bet_price_cents: 600,
        unit_bet_cost_cents: '600',
        total_submitted_cost_cents: '1200',
        distinct_only_cost_cents: '1200',
        wasted_on_duplicates_cents: '0',
        price_updated_at: '2025-07-10T00:00:00.000Z',
        price_source: 'CAIXA',
      },
      axiom_notice: 'ok',
      execution_source: 'python_fastapi_engine',
    },
    axiom_notice: 'ok',
    execution_source: 'python_fastapi_engine',
  };
}

function buildGenerateMockResponse() {
  const analyze = buildAnalyzeMockResponse();
  return {
    lottery_code: 'mega-sena',
    universe_size: 60,
    drawn_count: 6,
    chosen_count: 6,
    partition: analyze.partition,
    method: 'coverage_heuristic',
    seed: 202603,
    method_classification: {
      method_nature: 'heuristic',
      label: 'Heurística Gulosa de Cobertura (não garante conjunto mínimo ótimo)',
      is_exact_solution: false,
      is_proven_optimal_covering: false,
      is_full_t_coverage_proven: false,
      disclaimer:
        'Solução heurística ou amostral: não constitui cobertura mínima ótima comprovada e não prevê sorteios.',
    },
    generation_summary: {
      desired_games_count: 10,
      generated_count: 2,
      duplicates_count: 0,
      rejected_by_composition_filters: 0,
      restricted_space_combinations: '4582116',
      total_filtered_space: null,
      left_out_from_desired: '8',
      left_out_from_restricted_space: '4582114',
    },
    budget_summary: {
      simple_bet_price_cents: 600,
      unit_bet_cost_cents: '600',
      max_budget_cents: '12000',
      affordable_games_limit: '20',
      total_cost_cents: '1200',
      remaining_budget_cents: '10800',
      price_updated_at: '2025-07-10T00:00:00.000Z',
      price_source: 'CAIXA',
    },
    coverage_summary: {
      lottery_code: 'mega-sena',
      universe_size: 60,
      drawn_count: 6,
      chosen_count: 6,
      target_subset_size: 3,
      pool_size: 59,
      pool_numbers: Array.from({ length: 59 }, (_, i) => i + 1),
      submitted_bets_count: 2,
      distinct_bets_count: 2,
      coverage: {
        total_pool_subsets: '32509',
        total_universe_subsets: '34220',
        covered_subsets_count: '38',
        uncovered_subsets_count: '32471',
        coverage_fraction: '38 / 32509',
        coverage_exact_numerator: '38',
        coverage_exact_denominator: '32509',
        coverage_percentage: 0.116891,
        universe_coverage_percentage: 0.111046,
        is_full_coverage_proven: false,
        enumeration_mode: 'exhaustive',
      },
      redundancy: {
        subsets_per_bet: '20',
        nominal_subset_appearances: '40',
        repeated_subset_appearances: '2',
        multiplicity_histogram: { '0': 32471, '1': 36, '2': 2 },
      },
      covered_sample: [{ subset: [1, 2, 3], occurrences: 1 }],
      uncovered_sample: [[4, 5, 11]],
      coverage_vs_guarantee_notice:
        'Cobertura de subconjuntos NÃO equivale a garantia de premiação.',
      execution_source: 'python_fastapi_engine',
    },
    generated_bets: [
      [1, 2, 3, 4, 5, 6],
      [1, 2, 7, 8, 9, 10],
    ],
    bet_set_analysis: analyze.bet_set_analysis,
    execution_source: 'python_fastapi_engine',
  };
}

function installCombinationsFetchMock(options?: {
  withVerifiedRule?: boolean;
  pythonUnavailable?: boolean;
  heterogeneousCompare?: boolean;
}) {
  const withVerifiedRule = options?.withVerifiedRule ?? true;
  const pythonUnavailable = options?.pythonUnavailable ?? false;
  const heterogeneousCompare = options?.heterogeneousCompare ?? false;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/math/python/combinations/')) {
        if (pythonUnavailable) {
          return new Response(
            JSON.stringify({
              error: 'MATH_ENGINE_UNAVAILABLE',
              message: 'Motor matemático Python indisponível.',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.endsWith('/analyze')) {
          return new Response(JSON.stringify(buildAnalyzeMockResponse()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/generate')) {
          return new Response(JSON.stringify(buildGenerateMockResponse()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/coverage')) {
          return new Response(
            JSON.stringify(buildGenerateMockResponse().coverage_summary),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.endsWith('/compare')) {
          return new Response(
            JSON.stringify({
              lottery_code: 'mega-sena',
              universe_size: 60,
              drawn_count: 6,
              simple_bet_price_cents: 600,
              price_updated_at: '2025-07-10T00:00:00.000Z',
              price_source: 'CAIXA',
              strategies_count: 2,
              has_heterogeneous_universes: heterogeneousCompare,
              universe_comparison_notice: heterogeneousCompare
                ? 'As estratégias usam universos restritos ou subconjuntos t distintos; deltas de cobertura foram omitidos.'
                : null,
              strategies: [
                {
                  index: 1,
                  name: 'Base Simples (Amostragem)',
                  chosen_count: 6,
                  method: 'uniform_sampling',
                  is_exact_method: false,
                  generation_classification: null,
                  restrictions: {
                    fixed_numbers: [],
                    excluded_numbers: [],
                    variable_count: 60,
                    restricted_combinations: '50063860',
                    pool_size: 60,
                    pool_numbers: Array.from({ length: 60 }, (_, i) => i + 1),
                  },
                  bets_count: 10,
                  distinct_bets_count: 10,
                  repeated_bets_count: 0,
                  total_cost_cents: '6000',
                  distinct_simple_combinations: '10',
                  redundant_simple_combinations: '0',
                  intersections: { min_overlap: 0, max_overlap: 2, avg_overlap: 0.6 },
                  coverage: {
                    target_subset_size: 3,
                    pool_size: 60,
                    covered_subsets_count: '185',
                    total_pool_subsets: '34220',
                    coverage_percentage: 0.5406,
                    coverage_fraction: '185 / 34220',
                    is_full_coverage_proven: false,
                  },
                  coverage_comparable_with_baseline: true,
                  probabilities: {
                    main_prize_exact: null,
                    exact_any_prize: null,
                    exact_union_status: 'exact_union_computed',
                  },
                  delta_vs_baseline: {
                    cost_cents: '0',
                    coverage_percentage_points: 0,
                    distinct_simple_combinations: '0',
                  },
                  sample_bets: [[1, 2, 3, 4, 5, 6]],
                },
                {
                  index: 2,
                  name: 'Heurística de Cobertura',
                  chosen_count: 6,
                  method: 'coverage_heuristic',
                  is_exact_method: false,
                  generation_classification: null,
                  restrictions: heterogeneousCompare
                    ? {
                        fixed_numbers: [1],
                        excluded_numbers: [59, 60],
                        variable_count: 57,
                        restricted_combinations: '4187106',
                        pool_size: 58,
                        pool_numbers: Array.from({ length: 58 }, (_, i) => i + 1),
                      }
                    : {
                        fixed_numbers: [],
                        excluded_numbers: [],
                        variable_count: 60,
                        restricted_combinations: '50063860',
                        pool_size: 60,
                        pool_numbers: Array.from({ length: 60 }, (_, i) => i + 1),
                      },
                  bets_count: 10,
                  distinct_bets_count: 10,
                  repeated_bets_count: 0,
                  total_cost_cents: '6000',
                  distinct_simple_combinations: '10',
                  redundant_simple_combinations: '0',
                  intersections: { min_overlap: 0, max_overlap: 1, avg_overlap: 0.3 },
                  coverage: {
                    target_subset_size: 3,
                    pool_size: heterogeneousCompare ? 58 : 60,
                    covered_subsets_count: '198',
                    total_pool_subsets: heterogeneousCompare ? '30856' : '34220',
                    coverage_percentage: heterogeneousCompare ? 0.6417 : 0.5786,
                    coverage_fraction: heterogeneousCompare ? '198 / 30856' : '198 / 34220',
                    is_full_coverage_proven: false,
                  },
                  coverage_comparable_with_baseline: !heterogeneousCompare,
                  probabilities: {
                    main_prize_exact: null,
                    exact_any_prize: null,
                    exact_union_status: 'exact_union_computed',
                  },
                  delta_vs_baseline: {
                    cost_cents: '0',
                    coverage_percentage_points: heterogeneousCompare ? null : 0.038,
                    distinct_simple_combinations: '0',
                  },
                  sample_bets: [[7, 8, 9, 10, 11, 12]],
                },
              ],
              axiom_notice: 'ok',
              execution_source: 'python_fastapi_engine',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (url.endsWith('/api/lotteries/1')) {
        return new Response(
          JSON.stringify({
            id: 1,
            name: 'Mega-Sena',
            code: 'mega-sena',
            description: 'Modalidade numérica principal',
            status: withVerifiedRule ? 'active' : 'awaiting_rules',
            ruleVersions: withVerifiedRule
              ? [
                  {
                    id: 10,
                    versionNumber: 1,
                    minNumbersToChoose: 6,
                    maxNumbersToChoose: 20,
                    numberUniverseMin: 1,
                    numberUniverseMax: 60,
                    drawnNumbersCount: 6,
                    mathModelType: 'hypergeometric_single_group',
                    simpleBetPriceCents: 600,
                    priceUpdatedAt: '2025-07-10T00:00:00.000Z',
                    priceSource: 'CAIXA',
                    prizeTiersConfig: [
                      { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
                    ],
                    officialSource: 'CAIXA',
                    isVerified: true,
                    isLocked: false,
                    validFrom: '2020-01-01T00:00:00.000Z',
                    validTo: null,
                  },
                ]
              : [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/lotteries')) {
        return new Response(
          JSON.stringify({
            total: 1,
            items: [
              {
                id: 1,
                name: 'Mega-Sena',
                code: 'mega-sena',
                description: 'Modalidade principal',
                status: withVerifiedRule ? 'active' : 'awaiting_rules',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/contests')) {
        return new Response(JSON.stringify({ total: 0, items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/health')) {
        return new Response(JSON.stringify({ status: 'operational', axiom: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Unitários UI — Etapa 3: Laboratório de Combinações', () => {
  it('bloqueia modalidade aguardando configuração oficial sem inventar parâmetros', async () => {
    installCombinationsFetchMock({ withVerifiedRule: false });
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Laboratório de Combinações' }));
    expect(
      await screen.findByText(/Modalidade aguardando configuração oficial \(Mega-Sena\)/i)
    ).toBeInTheDocument();
  });

  it('opera matriz de fixos/excluídos, universo restrito, gerador controlado, cobertura e comparador de estratégias', async () => {
    installCombinationsFetchMock({ withVerifiedRule: true });
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Laboratório de Combinações' }));
    expect(
      await screen.findByRole('heading', { name: 'Laboratório de Combinações' })
    ).toBeInTheDocument();

    // Marca dezena 01 como Fixa e dezena 60 como Excluída
    const btn01 = await screen.findByRole('button', { name: /Dezena 01 \(Livre\)/i });
    fireEvent.click(btn01);
    expect(screen.getByRole('button', { name: /Dezena 01 \(Fixa\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar Excluído' }));
    fireEvent.click(screen.getByRole('button', { name: /Dezena 60 \(Livre\)/i }));
    expect(screen.getByRole('button', { name: /Dezena 60 \(Excluída\)/i })).toBeInTheDocument();

    // Executa análise do espaço restrito e orçamento
    fireEvent.click(screen.getByRole('button', { name: /Calcular Espaço & Orçamento/i }));
    expect(await screen.findByText('4.582.116')).toBeInTheDocument();
    expect(screen.getByText(/\|Ω_restrito\| = C\(N − \|E\| − \|F\|, m − \|F\|\)/i)).toBeInTheDocument();

    // Sub-aba Gerador Controlado
    fireEvent.click(screen.getByRole('tab', { name: 'Gerador Controlado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Combinações' }));
    expect(
      await screen.findByText(/Heurística Gulosa de Cobertura \(não garante conjunto mínimo ótimo\)/i)
    ).toBeInTheDocument();

    // Envia apostas geradas diretamente para Cobertura & Análise de Conjunto
    fireEvent.click(screen.getByRole('button', { name: /Analisar Cobertura Completa/i }));
    expect(
      await screen.findByText(/Cobertura de subconjuntos NÃO equivale a garantia de premiação/i)
    ).toBeInTheDocument();
    expect(screen.getByText('38 / 32509')).toBeInTheDocument();

    // Sub-aba Comparador de Estratégias
    fireEvent.click(screen.getByRole('tab', { name: /Comparador de Estratégias/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar Estratégias' }));
    expect(
      await screen.findByRole('img', {
        name: /Gráfico comparativo de cobertura e custo entre estratégias/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/#1 · Base Simples \(Amostragem\)/i)).toBeInTheDocument();
  });

  it('exibe erro explícito quando o motor Python retorna 503 sem fallback silencioso', async () => {
    installCombinationsFetchMock({ withVerifiedRule: true, pythonUnavailable: true });
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Laboratório de Combinações' }));
    const calcBtn = await screen.findByRole('button', { name: /Calcular Espaço & Orçamento/i });
    fireEvent.click(calcBtn);

    expect(
      await screen.findByText(/Falha no Motor Matemático Python \(MATH_ENGINE_UNAVAILABLE\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhum cálculo foi simulado ou substituído localmente no navegador/i)
    ).toBeInTheDocument();
  });

  it('bloqueia apostas inválidas na aba Cobertura e estratégias explícitas inválidas ou acima do orçamento no Comparador', async () => {
    installCombinationsFetchMock({ withVerifiedRule: true });
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Laboratório de Combinações' }));

    // Marca 01 como Fixa e 60 como Excluída
    const btn01 = await screen.findByRole('button', { name: /Dezena 01 \(Livre\)/i });
    fireEvent.click(btn01);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar Excluído' }));
    fireEvent.click(screen.getByRole('button', { name: /Dezena 60 \(Livre\)/i }));

    // Aba Cobertura: informa aposta sem o fixo 01 e contendo excluído 60
    fireEvent.click(screen.getByRole('tab', { name: /Cobertura & Análise de Conjunto/i }));
    const covInput = screen.getByLabelText(/Apostas do Conjunto/i);
    fireEvent.change(covInput, { target: { value: '02 03 04 05 06 60' } });

    expect(screen.getByText(/Conjunto inválido \(1 aposta\(s\) com violação\)/i)).toBeInTheDocument();
    expect(screen.getByText(/contém dezena\(s\) excluída\(s\): 60/i)).toBeInTheDocument();
    expect(screen.getByText(/ausência de dezena\(s\) fixa\(s\) obrigatória\(s\): 1/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Calcular Cobertura & Interseções/i })
    ).toBeDisabled();

    // Aba Comparador: habilita apostas explícitas na Estratégia #1 acima do orçamento (2 jogos = R$ 12,00 > R$ 6,00)
    fireEvent.click(screen.getByRole('tab', { name: /Comparador de Estratégias/i }));
    const explicitCheckboxes = screen.getAllByLabelText(/Informar apostas explícitas manualmente/i);
    fireEvent.click(explicitCheckboxes[0]);

    const budgetInputs = screen.getAllByLabelText(/Orçamento \(R\$\)/i);
    fireEvent.change(budgetInputs[0], { target: { value: '6' } });

    const expTextarea = screen.getByLabelText(/Apostas explícitas da estratégia 1/i);
    fireEvent.change(expTextarea, {
      target: { value: '01 02 03 04 05 06\n01 07 08 09 10 11' },
    });

    expect(screen.getByText(/excedendo o orçamento/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comparar Estratégias' })).toBeDisabled();
  });

  it('sinaliza universos distintos e omite delta enganoso no comparador quando pools diferem', async () => {
    installCombinationsFetchMock({ withVerifiedRule: true, heterogeneousCompare: true });
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Laboratório de Combinações' }));
    await screen.findByRole('heading', { name: 'Laboratório de Combinações' });

    fireEvent.click(await screen.findByRole('tab', { name: /Comparador de Estratégias/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Comparar Estratégias' }));

    expect(
      await screen.findByText(/As estratégias usam universos restritos ou subconjuntos t distintos/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Universos distintos')).toBeInTheDocument();
  });
});
