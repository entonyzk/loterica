import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMathRouter } from '../../server/modules/math-bridge/router.ts';
import type { ModalityRuleRepository } from '../../server/modules/math-bridge/modality-validator.ts';
import {
  validatePythonCombinationsAnalyzeIntegrity,
  validatePythonCompareIntegrity,
  validatePythonCoverageIntegrity,
  validatePythonGenerateIntegrity,
} from '../../server/modules/math-bridge/combinations-client.ts';
import { MathEngineError, exactCombinationsBigInt } from '../../server/modules/math-bridge/client.ts';

function buildMockRepo(): ModalityRuleRepository {
  return {
    async findLotteryById(id: number) {
      if (id === 1) return { id: 1, code: 'mega-sena', name: 'Mega-Sena', status: 'active' };
      if (id === 3) return { id: 3, code: 'quina', name: 'Quina', status: 'awaiting_rules' };
      return null;
    },
    async findLotteryByCode(code: string) {
      if (code === 'mega-sena') {
        return { id: 1, code: 'mega-sena', name: 'Mega-Sena', status: 'active' };
      }
      if (code === 'quina') {
        return { id: 3, code: 'quina', name: 'Quina', status: 'awaiting_rules' };
      }
      return null;
    },
    async findRuleVersionsByLotteryId(lotteryTypeId: number) {
      if (lotteryTypeId !== 1) return [];
      return [
        {
          id: 10,
          lotteryTypeId: 1,
          versionNumber: 1,
          minNumbersToChoose: 6,
          maxNumbersToChoose: 20,
          numberUniverseMin: 1,
          numberUniverseMax: 60,
          drawnNumbersCount: 6,
          mathModelType: 'hypergeometric_single_group',
          simpleBetPriceCents: 600,
          priceUpdatedAt: new Date('2025-07-10T00:00:00.000Z'),
          priceSource: 'https://loterias.caixa.gov.br',
          prizeTiersConfig: [
            { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
            { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
            { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
          ],
          officialSource: 'Caixa Econômica Federal',
          isVerified: true,
          isLocked: false,
          validFrom: new Date('2020-01-01T00:00:00.000Z'),
          validTo: null,
        },
      ];
    },
  };
}

async function postJson(app: express.Express, path: string, body: unknown) {
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, body: json };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('Unitários — Etapa 3: Bridge Node.js e Auditoria Combinatória (BigInt)', () => {
  const originalUrl = process.env.MATH_ENGINE_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.MATH_ENGINE_URL;
    else process.env.MATH_ENGINE_URL = originalUrl;
  });

  it('rejeita modalidade awaiting_rules e generic-reference nos endpoints da Etapa 3', async () => {
    process.env.MATH_ENGINE_URL = 'http://127.0.0.1:19999';
    const app = express();
    app.use(express.json());
    app.use('/api/math', createMathRouter(buildMockRepo()));

    const genericRes = await postJson(app, '/api/math/python/combinations/analyze', {
      lotteryCode: 'generic-reference',
      chosenCount: 6,
      desiredGamesCount: 5,
    });
    expect(genericRes.status).toBe(400);
    expect(genericRes.body.error).toBe('GENERIC_CODE_NOT_ALLOWED');

    const awaitingRes = await postJson(app, '/api/math/python/combinations/generate', {
      lotteryCode: 'quina',
      chosenCount: 5,
      desiredGamesCount: 5,
      method: 'uniform_sampling',
    });
    expect(awaitingRes.status).toBe(409);
    expect(awaitingRes.body.error).toBe('MODALITY_AWAITING_CONFIGURATION');
  });

  it('retorna 503 explícito quando o motor Python está indisponível sem fallback local', async () => {
    process.env.MATH_ENGINE_URL = 'http://127.0.0.1:19999';
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('http://127.0.0.1:19999')) {
        throw new Error('ECONNREFUSED');
      }
      return originalFetch(input, init);
    });

    const app = express();
    app.use(express.json());
    app.use('/api/math', createMathRouter(buildMockRepo()));

    const res = await postJson(app, '/api/math/python/combinations/analyze', {
      lotteryCode: 'mega-sena',
      chosenCount: 6,
      fixedNumbers: [1, 2],
      excludedNumbers: [60],
      desiredGamesCount: 5,
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('MATH_ENGINE_UNAVAILABLE');
  });

  it('valida integridade BigInt em analyze, coverage, generate e compare (rejeita adulterações com 502)', () => {
    const c60_6 = exactCombinationsBigInt(60, 6).toString();
    const c57_4 = exactCombinationsBigInt(57, 4).toString();

    // Adulteração em analyze: restricted_combinations inválido
    expect(() =>
      validatePythonCombinationsAnalyzeIntegrity(
        {
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
          simpleBetPriceCents: 600,
        },
        {
          lottery_code: 'mega-sena',
          universe_size: 60,
          drawn_count: 6,
          chosen_count: 6,
          partition: {
            fixed_numbers: [1, 2],
            excluded_numbers: [60],
            explicit_excluded_numbers: [60],
            variable_numbers: Array.from({ length: 57 }, (_, i) => i + 3),
            fixed_count: 2,
            excluded_count: 1,
            variable_count: 57,
            remaining_slots: 4,
          },
          combinatorics: {
            total_unrestricted_combinations: c60_6,
            total_simple_space_combinations: c60_6,
            restricted_combinations: '999', // adulterado (esperado c57_4)
            restricted_share_exact_numerator: '1',
            restricted_share_exact_denominator: '1',
            restricted_share_percentage: '1%',
            reduction_factor: 1,
            equivalent_simple_bets_per_game: '1',
            permutations_k_from_m: '720',
            internal_bet_permutations_m_factorial: '720',
            permutations_applicability_note: 'ok',
            formula: 'f',
            substituted_formula: 's',
          },
          budget_and_costs: {
            simple_bet_price_cents: 600,
            unit_bet_cost_cents: '600',
            price_updated_at: null,
            price_source: null,
            desired_games_count: 1,
            feasible_desired_games: '1',
            max_budget_cents: null,
            affordable_games_count: null,
            planned_games_count: '1',
            planned_total_cost_cents: '600',
            remaining_budget_cents: null,
            left_out_by_budget: '0',
            left_out_from_restricted_space: c57_4,
            full_restricted_closure_cost_cents: '600',
            planned_vs_restricted_fraction: '1/1',
            planned_vs_restricted_percentage: '1%',
            planned_nominal_simple_combinations: '1',
            upper_bound_simple_space_fraction: '1/1',
          },
          bet_set_analysis: null,
          axiom_notice: 'ok',
          execution_source: 'python_fastapi_engine',
        }
      )
    ).toThrow(MathEngineError);

    // Adulteração em coverage: covered + uncovered != total
    expect(() =>
      validatePythonCoverageIntegrity(
        {
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
          targetSubsetSize: 2,
          submittedBetsCount: 1,
        },
        {
          lottery_code: 'mega-sena',
          universe_size: 60,
          drawn_count: 6,
          chosen_count: 6,
          target_subset_size: 2,
          pool_size: 6,
          pool_numbers: [1, 2, 3, 4, 5, 6],
          submitted_bets_count: 1,
          distinct_bets_count: 1,
          coverage: {
            total_pool_subsets: '15',
            total_universe_subsets: '1770',
            covered_subsets_count: '14',
            uncovered_subsets_count: '0', // adulterado (14 + 0 != 15)
            coverage_fraction: '14 / 15',
            coverage_exact_numerator: '14',
            coverage_exact_denominator: '15',
            coverage_percentage: 93.33,
            universe_coverage_percentage: 0.79,
            is_full_coverage_proven: false,
            enumeration_mode: 'exhaustive',
          },
          redundancy: {
            subsets_per_bet: '15',
            nominal_subset_appearances: '15',
            repeated_subset_appearances: '0',
            multiplicity_histogram: { '1': 15 },
          },
          covered_sample: [],
          uncovered_sample: [],
          coverage_vs_guarantee_notice: 'ok',
          execution_source: 'python_fastapi_engine',
        }
      )
    ).toThrow(MathEngineError);

    // Adulteração em generate: duplicata ou heurística rotulada como ótima comprovada
    expect(() =>
      validatePythonGenerateIntegrity(
        {
          lotteryCode: 'mega-sena',
          universeSize: 60,
          drawnCount: 6,
          chosenCount: 6,
          fixedNumbers: [1],
          excludedNumbers: [60],
          desiredGamesCount: 2,
          method: 'coverage_heuristic',
          maxBudgetCents: 1200,
          simpleBetPriceCents: 600,
        },
        {
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
          method: 'coverage_heuristic',
          seed: 1,
          method_classification: {
            method_nature: 'heuristic',
            label: 'Heurística',
            is_exact_solution: true, // adulterado!
            is_proven_optimal_covering: false,
            is_full_t_coverage_proven: false,
            disclaimer: 'ok',
          },
          generation_summary: {
            desired_games_count: 2,
            generated_count: 1,
            duplicates_count: 0,
            rejected_by_composition_filters: 0,
            restricted_space_combinations: '100',
            total_filtered_space: null,
            left_out_from_desired: '1',
            left_out_from_restricted_space: '99',
          },
          budget_summary: {
            simple_bet_price_cents: 600,
            unit_bet_cost_cents: '600',
            max_budget_cents: '1200',
            affordable_games_limit: '2',
            total_cost_cents: '600',
            remaining_budget_cents: '600',
            price_updated_at: null,
            price_source: null,
          },
          coverage_summary: {
            lottery_code: 'mega-sena',
            universe_size: 60,
            drawn_count: 6,
            chosen_count: 6,
            target_subset_size: 2,
            pool_size: 59,
            pool_numbers: Array.from({ length: 59 }, (_, i) => i + 1),
            submitted_bets_count: 1,
            distinct_bets_count: 1,
            coverage: {
              total_pool_subsets: '1711',
              total_universe_subsets: '1770',
              covered_subsets_count: '15',
              uncovered_subsets_count: '1696',
              coverage_fraction: '15 / 1711',
              coverage_exact_numerator: '15',
              coverage_exact_denominator: '1711',
              coverage_percentage: 0.87,
              universe_coverage_percentage: 0.84,
              is_full_coverage_proven: false,
              enumeration_mode: 'exhaustive',
            },
            redundancy: {
              subsets_per_bet: '15',
              nominal_subset_appearances: '15',
              repeated_subset_appearances: '0',
              multiplicity_histogram: { '1': 15 },
            },
            covered_sample: [],
            uncovered_sample: [],
            coverage_vs_guarantee_notice: 'ok',
            execution_source: 'python_fastapi_engine',
          },
          generated_bets: [[1, 2, 3, 4, 5, 6]],
          bet_set_analysis: {
            lottery_code: 'mega-sena',
            universe_size: 60,
            drawn_count: 6,
            chosen_count: 6,
            counts: {
              submitted_bets_count: 1,
              distinct_bets_count: 1,
              repeated_bets_count: 0,
              duplicate_groups: [],
              constraint_violations: [],
              all_bets_respect_constraints: true,
            },
            intersections: {
              distinct_pair_count: 0,
              min_overlap: 0,
              max_overlap: 0,
              avg_overlap: 0,
              avg_overlap_exact: '0/1',
              disjoint_pairs_count: 0,
              overlap_histogram: {},
              top_overlapping_pairs: [],
            },
            redundancy: {
              simple_combinations_per_bet: '1',
              nominal_simple_combinations: '1',
              exact_simple_expansion_computed: true,
              distinct_simple_combinations: '1',
              redundant_simple_combinations: '0',
              redundancy_rate_percentage: '0%',
              main_prize_exact: null,
            },
            distribution: {
              used_numbers_count: 6,
              unused_numbers_count: 54,
              unused_numbers: [],
              number_frequency: [],
              sum_min: 21,
              sum_max: 21,
              sum_avg: 21,
              even_min: 3,
              even_max: 3,
              even_avg: 3,
            },
            costs: {
              simple_bet_price_cents: 600,
              unit_bet_cost_cents: '600',
              total_submitted_cost_cents: '600',
              distinct_only_cost_cents: '600',
              wasted_on_duplicates_cents: '0',
              price_updated_at: null,
              price_source: null,
            },
            axiom_notice: 'ok',
            execution_source: 'python_fastapi_engine',
          },
          execution_source: 'python_fastapi_engine',
        }
      )
    ).toThrow(MathEngineError);

    // Adulteração em compare: delta_vs_baseline.cost_cents errado
    expect(() =>
      validatePythonCompareIntegrity(
        { lotteryCode: 'mega-sena', universeSize: 60, drawnCount: 6, strategiesCount: 2 },
        {
          lottery_code: 'mega-sena',
          universe_size: 60,
          drawn_count: 6,
          simple_bet_price_cents: 600,
          price_updated_at: null,
          price_source: null,
          strategies_count: 2,
          strategies: [
            {
              index: 1,
              name: 'S1',
              chosen_count: 6,
              method: 'uniform_sampling',
              is_exact_method: false,
              generation_classification: null,
              bets_count: 2,
              distinct_bets_count: 2,
              repeated_bets_count: 0,
              total_cost_cents: '1200',
              distinct_simple_combinations: '2',
              redundant_simple_combinations: '0',
              intersections: { min_overlap: 0, max_overlap: 1, avg_overlap: 0.5 },
              coverage: {
                target_subset_size: 2,
                pool_size: 60,
                covered_subsets_count: '30',
                total_pool_subsets: '1770',
                coverage_percentage: 1.69,
                coverage_fraction: '1 / 59',
                is_full_coverage_proven: false,
              },
              probabilities: {
                main_prize_exact: null,
                exact_any_prize: null,
                exact_union_status: 'not_computed_for_large_or_multiple_set',
              },
              delta_vs_baseline: {
                cost_cents: '0',
                coverage_percentage_points: 0,
                distinct_simple_combinations: '0',
              },
              sample_bets: [],
            },
            {
              index: 2,
              name: 'S2',
              chosen_count: 6,
              method: 'coverage_heuristic',
              is_exact_method: false,
              generation_classification: null,
              bets_count: 3,
              distinct_bets_count: 3,
              repeated_bets_count: 0,
              total_cost_cents: '1800',
              distinct_simple_combinations: '3',
              redundant_simple_combinations: '0',
              intersections: { min_overlap: 0, max_overlap: 1, avg_overlap: 0.5 },
              coverage: {
                target_subset_size: 2,
                pool_size: 60,
                covered_subsets_count: '45',
                total_pool_subsets: '1770',
                coverage_percentage: 2.54,
                coverage_fraction: '3 / 118',
                is_full_coverage_proven: false,
              },
              probabilities: {
                main_prize_exact: null,
                exact_any_prize: null,
                exact_union_status: 'not_computed_for_large_or_multiple_set',
              },
              delta_vs_baseline: {
                cost_cents: '999', // adulterado! esperado 600
                coverage_percentage_points: 0.85,
                distinct_simple_combinations: '1',
              },
              sample_bets: [],
            },
          ],
          axiom_notice: 'ok',
          execution_source: 'python_fastapi_engine',
        }
      )
    ).toThrow(MathEngineError);
  });
});
