import { z } from 'zod';
import {
  MathEngineError,
  exactCombinationsBigInt,
  gcdBigInt,
  getMathEngineTimeoutMs,
  resolvePythonBaseUrl,
  validateCombinatorialParams,
} from './client.ts';

export type GenerationMethod =
  | 'exhaustive'
  | 'uniform_sampling'
  | 'coverage_heuristic'
  | 'combinatorial_search';

const integerStringSchema = z.string().regex(/^\d+$/);
const signedIntegerStringSchema = z.string().regex(/^-?\d+$/);

const prizeTierInputSchema = z.object({
  hits: z.number().int(),
  tierName: z.string(),
  tierOrder: z.number().int(),
  isMainPrize: z.boolean(),
});

const partitionSchema = z.object({
  fixed_numbers: z.array(z.number().int()),
  excluded_numbers: z.array(z.number().int()),
  explicit_excluded_numbers: z.array(z.number().int()),
  variable_numbers: z.array(z.number().int()),
  fixed_count: z.number().int().min(0),
  excluded_count: z.number().int().min(0),
  variable_count: z.number().int().min(0),
  remaining_slots: z.number().int().min(0),
});

const betSetAnalysisSchema = z.object({
  lottery_code: z.string(),
  universe_size: z.number().int(),
  drawn_count: z.number().int(),
  chosen_count: z.number().int(),
  counts: z.object({
    submitted_bets_count: z.number().int().min(1),
    distinct_bets_count: z.number().int().min(1),
    repeated_bets_count: z.number().int().min(0),
    duplicate_groups: z.array(
      z.object({
        bet: z.array(z.number().int()),
        occurrences: z.number().int().min(2),
      })
    ),
    constraint_violations: z.array(
      z.object({
        bet_index: z.number().int(),
        missing_fixed: z.array(z.number().int()),
        used_excluded: z.array(z.number().int()),
      })
    ),
    all_bets_respect_constraints: z.boolean(),
  }),
  intersections: z.object({
    distinct_pair_count: z.number().int().min(0),
    min_overlap: z.number().int().min(0),
    max_overlap: z.number().int().min(0),
    avg_overlap: z.number().finite().min(0),
    avg_overlap_exact: z.string(),
    disjoint_pairs_count: z.number().int().min(0),
    overlap_histogram: z.record(z.string(), z.number().int().min(0)),
    top_overlapping_pairs: z.array(
      z.object({
        bet_a: z.number().int(),
        bet_b: z.number().int(),
        overlap: z.number().int().min(0),
      })
    ),
  }),
  redundancy: z.object({
    simple_combinations_per_bet: integerStringSchema,
    nominal_simple_combinations: integerStringSchema,
    exact_simple_expansion_computed: z.boolean(),
    distinct_simple_combinations: integerStringSchema.nullable(),
    redundant_simple_combinations: integerStringSchema.nullable(),
    redundancy_rate_percentage: z.string().nullable(),
    main_prize_exact: z
      .object({
        raw_numerator: integerStringSchema,
        raw_denominator: integerStringSchema,
        exact_numerator: integerStringSchema,
        exact_denominator: integerStringSchema,
        probability: z.number().finite().min(0).max(1),
        percentage: z.string(),
        scientific_notation: z.string(),
        odds_one_in: integerStringSchema.nullable(),
      })
      .nullable(),
  }),
  distribution: z.object({
    used_numbers_count: z.number().int().min(0),
    unused_numbers_count: z.number().int().min(0),
    unused_numbers: z.array(z.number().int()),
    number_frequency: z.array(
      z.object({
        number: z.number().int(),
        count: z.number().int().min(0),
        pct_of_bets: z.number().finite().min(0).max(100),
      })
    ),
    sum_min: z.number().int(),
    sum_max: z.number().int(),
    sum_avg: z.number().finite(),
    even_min: z.number().int().min(0),
    even_max: z.number().int().min(0),
    even_avg: z.number().finite().min(0),
  }),
  costs: z.object({
    simple_bet_price_cents: z.number().int().nullable(),
    unit_bet_cost_cents: integerStringSchema.nullable(),
    total_submitted_cost_cents: integerStringSchema.nullable(),
    distinct_only_cost_cents: integerStringSchema.nullable(),
    wasted_on_duplicates_cents: integerStringSchema.nullable(),
    price_updated_at: z.string().nullable(),
    price_source: z.string().nullable(),
  }),
  axiom_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
});

export const pythonCombinationsAnalyzeResponseSchema = z.object({
  lottery_code: z.string(),
  universe_size: z.number().int().min(1).max(1000),
  drawn_count: z.number().int().min(1).max(1000),
  chosen_count: z.number().int().min(1).max(1000),
  partition: partitionSchema,
  combinatorics: z.object({
    total_unrestricted_combinations: integerStringSchema,
    total_simple_space_combinations: integerStringSchema,
    restricted_combinations: integerStringSchema,
    restricted_share_exact_numerator: integerStringSchema,
    restricted_share_exact_denominator: integerStringSchema,
    restricted_share_percentage: z.string(),
    reduction_factor: z.number().finite().min(0),
    equivalent_simple_bets_per_game: integerStringSchema,
    permutations_k_from_m: integerStringSchema,
    internal_bet_permutations_m_factorial: integerStringSchema.nullable(),
    permutations_applicability_note: z.string(),
    formula: z.string(),
    substituted_formula: z.string(),
  }),
  budget_and_costs: z.object({
    simple_bet_price_cents: z.number().int().nullable(),
    unit_bet_cost_cents: integerStringSchema.nullable(),
    price_updated_at: z.string().nullable(),
    price_source: z.string().nullable(),
    desired_games_count: z.number().int().min(1),
    feasible_desired_games: integerStringSchema,
    max_budget_cents: integerStringSchema.nullable(),
    affordable_games_count: integerStringSchema.nullable(),
    planned_games_count: integerStringSchema,
    planned_total_cost_cents: integerStringSchema.nullable(),
    remaining_budget_cents: integerStringSchema.nullable(),
    left_out_by_budget: integerStringSchema,
    left_out_from_restricted_space: integerStringSchema,
    full_restricted_closure_cost_cents: integerStringSchema.nullable(),
    planned_vs_restricted_fraction: z.string(),
    planned_vs_restricted_percentage: z.string(),
    planned_nominal_simple_combinations: integerStringSchema,
    upper_bound_simple_space_fraction: z.string(),
  }),
  bet_set_analysis: betSetAnalysisSchema.nullable(),
  axiom_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
});

export const pythonCoverageResponseSchema = z.object({
  lottery_code: z.string(),
  universe_size: z.number().int().min(1).max(1000),
  drawn_count: z.number().int().min(1).max(1000),
  chosen_count: z.number().int().min(1).max(1000),
  target_subset_size: z.number().int().min(1).max(100),
  fixed_numbers: z.array(z.number().int()).default([]),
  excluded_numbers: z.array(z.number().int()).default([]),
  pool_size: z.number().int().min(1),
  pool_numbers: z.array(z.number().int()),
  submitted_bets_count: z.number().int().min(1),
  distinct_bets_count: z.number().int().min(1),
  coverage: z.object({
    total_pool_subsets: integerStringSchema,
    total_universe_subsets: integerStringSchema,
    covered_subsets_count: integerStringSchema,
    uncovered_subsets_count: integerStringSchema,
    coverage_fraction: z.string(),
    coverage_exact_numerator: integerStringSchema,
    coverage_exact_denominator: integerStringSchema,
    coverage_percentage: z.number().finite().min(0).max(100),
    universe_coverage_percentage: z.number().finite().min(0).max(100),
    is_full_coverage_proven: z.boolean(),
    enumeration_mode: z.enum(['exhaustive', 'sampled_missing']),
  }),
  redundancy: z.object({
    subsets_per_bet: integerStringSchema,
    nominal_subset_appearances: integerStringSchema,
    repeated_subset_appearances: integerStringSchema,
    multiplicity_histogram: z.record(z.string(), z.number().int().min(0)),
  }),
  covered_sample: z.array(
    z.object({
      subset: z.array(z.number().int()),
      occurrences: z.number().int().min(1),
    })
  ),
  uncovered_sample: z.array(z.array(z.number().int())),
  coverage_vs_guarantee_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
});

export const pythonGenerateResponseSchema = z.object({
  lottery_code: z.string(),
  universe_size: z.number().int().min(1).max(1000),
  drawn_count: z.number().int().min(1).max(1000),
  chosen_count: z.number().int().min(1).max(1000),
  partition: partitionSchema,
  method: z.enum(['exhaustive', 'uniform_sampling', 'coverage_heuristic', 'combinatorial_search']),
  seed: z.number().int().nullable(),
  method_classification: z.object({
    method_nature: z.string(),
    label: z.string(),
    is_exact_solution: z.boolean(),
    is_proven_optimal_covering: z.boolean(),
    is_full_t_coverage_proven: z.boolean(),
    disclaimer: z.string(),
  }),
  generation_summary: z.object({
    desired_games_count: z.number().int().min(1),
    generated_count: z.number().int().min(1),
    duplicates_count: z.number().int().min(0),
    rejected_by_composition_filters: z.number().int().min(0),
    restricted_space_combinations: integerStringSchema,
    total_filtered_space: integerStringSchema.nullable(),
    left_out_from_desired: integerStringSchema,
    left_out_from_restricted_space: integerStringSchema,
  }),
  budget_summary: z.object({
    simple_bet_price_cents: z.number().int().nullable(),
    unit_bet_cost_cents: integerStringSchema.nullable(),
    max_budget_cents: integerStringSchema.nullable(),
    affordable_games_limit: integerStringSchema.nullable(),
    total_cost_cents: integerStringSchema.nullable(),
    remaining_budget_cents: integerStringSchema.nullable(),
    price_updated_at: z.string().nullable(),
    price_source: z.string().nullable(),
  }),
  coverage_summary: pythonCoverageResponseSchema,
  generated_bets: z.array(z.array(z.number().int())),
  bet_set_analysis: betSetAnalysisSchema,
  execution_source: z.literal('python_fastapi_engine'),
});

const strategyEvaluatedSchema = z.object({
  index: z.number().int().min(1),
  name: z.string(),
  chosen_count: z.number().int().min(1),
  method: z.string(),
  is_exact_method: z.boolean(),
  generation_classification: z
    .object({
      method_nature: z.string(),
      label: z.string(),
      is_exact_solution: z.boolean(),
      is_proven_optimal_covering: z.boolean(),
      is_full_t_coverage_proven: z.boolean(),
      disclaimer: z.string(),
    })
    .nullable(),
  restrictions: z.object({
    fixed_numbers: z.array(z.number().int()),
    excluded_numbers: z.array(z.number().int()),
    variable_count: z.number().int().min(0),
    restricted_combinations: integerStringSchema,
    pool_size: z.number().int().min(1),
    pool_numbers: z.array(z.number().int()),
  }),
  bets_count: z.number().int().min(1),
  distinct_bets_count: z.number().int().min(1),
  repeated_bets_count: z.number().int().min(0),
  total_cost_cents: integerStringSchema.nullable(),
  distinct_simple_combinations: integerStringSchema.nullable(),
  redundant_simple_combinations: integerStringSchema.nullable(),
  intersections: z.object({
    min_overlap: z.number().int().min(0),
    max_overlap: z.number().int().min(0),
    avg_overlap: z.number().finite().min(0),
  }),
  coverage: z.object({
    target_subset_size: z.number().int().min(1),
    pool_size: z.number().int().min(1),
    covered_subsets_count: integerStringSchema,
    total_pool_subsets: integerStringSchema,
    coverage_percentage: z.number().finite().min(0).max(100),
    coverage_fraction: z.string(),
    is_full_coverage_proven: z.boolean(),
  }),
  coverage_comparable_with_baseline: z.boolean(),
  probabilities: z.object({
    main_prize_exact: z
      .object({
        raw_numerator: integerStringSchema,
        raw_denominator: integerStringSchema,
        exact_numerator: integerStringSchema,
        exact_denominator: integerStringSchema,
        probability: z.number().finite().min(0).max(1),
        percentage: z.string(),
        scientific_notation: z.string(),
        odds_one_in: integerStringSchema.nullable(),
      })
      .nullable(),
    exact_any_prize: z
      .object({
        raw_numerator: integerStringSchema,
        raw_denominator: integerStringSchema,
        exact_numerator: integerStringSchema,
        exact_denominator: integerStringSchema,
        probability: z.number().finite().min(0).max(1),
        scientific_notation: z.string(),
        odds_one_in: integerStringSchema.nullable(),
      })
      .nullable(),
    exact_union_status: z.string(),
  }),
  delta_vs_baseline: z.object({
    cost_cents: signedIntegerStringSchema.nullable(),
    coverage_percentage_points: z.number().finite().nullable(),
    distinct_simple_combinations: signedIntegerStringSchema.nullable(),
  }),
  sample_bets: z.array(z.array(z.number().int())),
});

export const pythonCompareResponseSchema = z.object({
  lottery_code: z.string(),
  universe_size: z.number().int().min(1).max(1000),
  drawn_count: z.number().int().min(1).max(1000),
  simple_bet_price_cents: z.number().int().nullable(),
  price_updated_at: z.string().nullable(),
  price_source: z.string().nullable(),
  strategies_count: z.number().int().min(1).max(5),
  has_heterogeneous_universes: z.boolean(),
  universe_comparison_notice: z.string().nullable(),
  strategies: z.array(strategyEvaluatedSchema).min(1).max(5),
  axiom_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
});

export type PythonCombinationsAnalyzeResponse = z.infer<
  typeof pythonCombinationsAnalyzeResponseSchema
>;
export type PythonCoverageResponse = z.infer<typeof pythonCoverageResponseSchema>;
export type PythonGenerateResponse = z.infer<typeof pythonGenerateResponseSchema>;
export type PythonCompareResponse = z.infer<typeof pythonCompareResponseSchema>;

function assertPositiveDenominatorAndIrreducible(
  rawNum: bigint,
  rawDen: bigint,
  exactNum: bigint,
  exactDen: bigint,
  context: string
) {
  if (rawDen <= 0n || exactDen <= 0n) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Denominador inválido na resposta Python (${context}).`
    );
  }
  if (gcdBigInt(exactNum, exactDen) !== 1n || exactNum * rawDen !== rawNum * exactDen) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Fração irredutível inconsistente na resposta Python (${context}).`
    );
  }
}

export function validatePythonCombinationsAnalyzeIntegrity(
  params: {
    lotteryCode: string;
    universeSize: number;
    drawnCount: number;
    chosenCount: number;
    simpleBetPriceCents: number | null;
    maxBudgetCents?: number | null;
    submittedBetsCount?: number;
  },
  data: PythonCombinationsAnalyzeResponse
): void {
  if (
    data.lottery_code !== params.lotteryCode ||
    data.universe_size !== params.universeSize ||
    data.drawn_count !== params.drawnCount ||
    data.chosen_count !== params.chosenCount
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Parâmetros ecoados pelo motor Python em /combinations/analyze divergem dos enviados.'
    );
  }

  const expectedUnrestricted = exactCombinationsBigInt(params.universeSize, params.chosenCount);
  const expectedSimpleSpace = exactCombinationsBigInt(params.universeSize, params.drawnCount);
  const expectedRestricted = exactCombinationsBigInt(
    data.partition.variable_count,
    data.partition.remaining_slots
  );

  if (
    BigInt(data.combinatorics.total_unrestricted_combinations) !== expectedUnrestricted ||
    BigInt(data.combinatorics.total_simple_space_combinations) !== expectedSimpleSpace ||
    BigInt(data.combinatorics.restricted_combinations) !== expectedRestricted
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Contagens combinatórias retornadas pelo motor Python divergem do cálculo exato BigInt.'
    );
  }

  assertPositiveDenominatorAndIrreducible(
    expectedRestricted,
    expectedUnrestricted,
    BigInt(data.combinatorics.restricted_share_exact_numerator),
    BigInt(data.combinatorics.restricted_share_exact_denominator),
    'participação do espaço restrito'
  );

  const expectedEqSimple =
    params.chosenCount >= params.drawnCount
      ? exactCombinationsBigInt(params.chosenCount, params.drawnCount)
      : 0n;
  if (BigInt(data.combinatorics.equivalent_simple_bets_per_game) !== expectedEqSimple) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Apostas simples equivalentes C(m, k) divergem na resposta Python.'
    );
  }

  if (params.simpleBetPriceCents !== null) {
    const expectedUnitCost = expectedEqSimple * BigInt(params.simpleBetPriceCents);
    if (
      data.budget_and_costs.unit_bet_cost_cents === null ||
      BigInt(data.budget_and_costs.unit_bet_cost_cents) !== expectedUnitCost
    ) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Custo unitário da aposta diverge do preço oficial verificado.'
      );
    }
    if (params.maxBudgetCents !== undefined && params.maxBudgetCents !== null) {
      const plannedCost = BigInt(data.budget_and_costs.planned_total_cost_cents ?? '0');
      const remaining = BigInt(data.budget_and_costs.remaining_budget_cents ?? '-1');
      if (plannedCost > BigInt(params.maxBudgetCents) || remaining < 0n) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          'Orçamento planejado violado ou saldo restante negativo na resposta Python.'
        );
      }
    }
  }

  if (data.bet_set_analysis) {
    const counts = data.bet_set_analysis.counts;
    if (counts.distinct_bets_count + counts.repeated_bets_count !== counts.submitted_bets_count) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Contagem de apostas distintas + repetidas diverge do total enviado.'
      );
    }
    if (
      params.submittedBetsCount !== undefined &&
      counts.submitted_bets_count !== params.submittedBetsCount
    ) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Quantidade de apostas analisadas diverge das apostas enviadas.'
      );
    }
  }
}

export function validatePythonCoverageIntegrity(
  params: {
    lotteryCode: string;
    universeSize: number;
    drawnCount: number;
    chosenCount: number;
    targetSubsetSize: number;
    submittedBetsCount: number;
    fixedNumbers?: number[];
    excludedNumbers?: number[];
  },
  data: PythonCoverageResponse
): void {
  if (
    data.lottery_code !== params.lotteryCode ||
    data.universe_size !== params.universeSize ||
    data.drawn_count !== params.drawnCount ||
    data.chosen_count !== params.chosenCount ||
    data.target_subset_size !== params.targetSubsetSize ||
    data.submitted_bets_count !== params.submittedBetsCount
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Parâmetros ecoados pelo motor Python em /combinations/coverage divergem.'
    );
  }

  const poolSet = new Set(data.pool_numbers);
  if (params.fixedNumbers) {
    for (const f of params.fixedNumbers) {
      if (!poolSet.has(f)) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Dezena fixa obrigatória (${f}) ausente no pool de cobertura.`
        );
      }
    }
  }
  if (params.excludedNumbers) {
    for (const e of params.excludedNumbers) {
      if (poolSet.has(e)) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Dezena excluída (${e}) encontrada indevidamente no pool de cobertura.`
        );
      }
    }
  }

  const expectedPoolSubsets = exactCombinationsBigInt(
    data.pool_size,
    params.targetSubsetSize
  );
  const covered = BigInt(data.coverage.covered_subsets_count);
  const uncovered = BigInt(data.coverage.uncovered_subsets_count);
  const totalPool = BigInt(data.coverage.total_pool_subsets);

  if (totalPool !== expectedPoolSubsets || covered + uncovered !== totalPool) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Invariante cobertos + descobertos = C(|P|, t) violada na resposta de cobertura.'
    );
  }

  assertPositiveDenominatorAndIrreducible(
    covered,
    totalPool,
    BigInt(data.coverage.coverage_exact_numerator),
    BigInt(data.coverage.coverage_exact_denominator),
    'fração de cobertura'
  );

  if (data.coverage.is_full_coverage_proven !== (uncovered === 0n)) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Classificação de cobertura integral (100%) inconsistente com contagem de descobertos.'
    );
  }
}

export function validatePythonGenerateIntegrity(
  params: {
    lotteryCode: string;
    universeSize: number;
    drawnCount: number;
    chosenCount: number;
    fixedNumbers: number[];
    excludedNumbers: number[];
    desiredGamesCount: number;
    method: GenerationMethod;
    maxBudgetCents?: number | null;
    simpleBetPriceCents: number | null;
  },
  data: PythonGenerateResponse
): void {
  if (
    data.lottery_code !== params.lotteryCode ||
    data.universe_size !== params.universeSize ||
    data.drawn_count !== params.drawnCount ||
    data.chosen_count !== params.chosenCount ||
    data.method !== params.method
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Parâmetros ecoados pelo motor Python em /combinations/generate divergem.'
    );
  }

  if (data.generation_summary.duplicates_count !== 0) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Motor Python reportou duplicatas em geração com garantia zero-duplicata.'
    );
  }

  if (data.generated_bets.length !== data.generation_summary.generated_count) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Quantidade de apostas geradas diverge do resumo.'
    );
  }

  if (data.generated_bets.length > params.desiredGamesCount) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Motor Python retornou mais jogos do que o limite solicitado.'
    );
  }

  if (
    params.method !== 'exhaustive' &&
    (data.method_classification.is_exact_solution ||
      data.method_classification.is_proven_optimal_covering)
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Método heurístico ou amostral não pode ser classificado como solução exata/ótima comprovada.'
    );
  }

  const fixedSet = new Set(params.fixedNumbers);
  const excludedSet = new Set(params.excludedNumbers);
  const seenBets = new Set<string>();

  for (const bet of data.generated_bets) {
    if (bet.length !== params.chosenCount) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Aposta gerada possui quantidade de dezenas divergente da solicitada.'
      );
    }
    const uniq = new Set(bet);
    if (uniq.size !== params.chosenCount) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Aposta gerada contém dezenas repetidas internamente.'
      );
    }
    for (const n of bet) {
      if (n < 1 || n > params.universeSize || excludedSet.has(n)) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Aposta gerada contém dezena inválida ou excluída (${n}).`
        );
      }
    }
    for (const f of fixedSet) {
      if (!uniq.has(f)) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Aposta gerada não contém a dezena obrigatória ${f}.`
        );
      }
    }
    const key = [...bet].sort((a, b) => a - b).join(',');
    if (seenBets.has(key)) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Apostas geradas contêm duplicata não detectada pelo motor Python.'
      );
    }
    seenBets.add(key);
  }

  if (
    params.simpleBetPriceCents !== null &&
    params.maxBudgetCents !== undefined &&
    params.maxBudgetCents !== null
  ) {
    const totalCost = BigInt(data.budget_summary.total_cost_cents ?? '0');
    if (totalCost > BigInt(params.maxBudgetCents)) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Custo total das apostas geradas excede o orçamento máximo informado.'
      );
    }
  }
}

export function validatePythonCompareIntegrity(
  params: {
    lotteryCode: string;
    universeSize: number;
    drawnCount: number;
    strategiesCount: number;
    strategies?: Array<{ maxBudgetCents?: number | null; chosenCount: number }>;
  },
  data: PythonCompareResponse
): void {
  if (
    data.lottery_code !== params.lotteryCode ||
    data.universe_size !== params.universeSize ||
    data.drawn_count !== params.drawnCount ||
    data.strategies_count !== params.strategiesCount ||
    data.strategies.length !== params.strategiesCount
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Metadados ou quantidade de estratégias divergem na resposta do comparador Python.'
    );
  }

  const base = data.strategies[0];
  for (let i = 0; i < data.strategies.length; i += 1) {
    const s = data.strategies[i];
    const reqStrat = params.strategies?.[i];

    if (s.distinct_bets_count + s.repeated_bets_count !== s.bets_count) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Contagem inconsistente de apostas na estratégia "${s.name}".`
      );
    }
    if (s.restrictions.pool_size !== s.coverage.pool_size) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Tamanho do pool divergente entre restrições e cobertura na estratégia "${s.name}".`
      );
    }
    if (
      !s.coverage_comparable_with_baseline &&
      s.delta_vs_baseline.coverage_percentage_points !== null
    ) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Delta percentual de cobertura informado para universos incompatíveis na estratégia "${s.name}".`
      );
    }
    if (
      reqStrat?.maxBudgetCents !== undefined &&
      reqStrat?.maxBudgetCents !== null &&
      s.total_cost_cents !== null &&
      BigInt(s.total_cost_cents) > BigInt(reqStrat.maxBudgetCents)
    ) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Estratégia "${s.name}" excedeu o teto orçamentário informado.`
      );
    }
    if (s.coverage.total_pool_subsets !== '0') {
      const covered = BigInt(s.coverage.covered_subsets_count);
      const total = BigInt(s.coverage.total_pool_subsets);
      if (covered > total) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Subconjuntos cobertos excedem o pool na estratégia "${s.name}".`
        );
      }
      if (s.coverage.is_full_coverage_proven !== (covered === total)) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Sinalização de cobertura integral inválida na estratégia "${s.name}".`
        );
      }
    }
    if (base.total_cost_cents !== null && s.total_cost_cents !== null) {
      const expectedDelta = BigInt(s.total_cost_cents) - BigInt(base.total_cost_cents);
      if (
        s.delta_vs_baseline.cost_cents === null ||
        BigInt(s.delta_vs_baseline.cost_cents) !== expectedDelta
      ) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Delta de custo vs. estratégia base inconsistente em "${s.name}".`
        );
      }
    }
  }
}

async function postPythonCombinationsEndpoint<T>(
  path: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>
): Promise<T> {
  const baseUrl = resolvePythonBaseUrl();
  const timeoutMs = getMathEngineTimeoutMs();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error(`[math-bridge] Python ${path} request failed:`, error);
    throw new MathEngineError(
      isTimeout ? 'MATH_ENGINE_TIMEOUT' : 'MATH_ENGINE_UNAVAILABLE',
      isTimeout ? 504 : 503,
      isTimeout
        ? `Motor matemático Python excedeu o tempo limite de ${timeoutMs}ms.`
        : 'Motor matemático Python indisponível. Nenhuma operação combinatória foi simulada localmente.',
      { cause: error }
    );
  }

  if (response.status === 404) {
    const errBody = await response.json().catch(() => ({}));
    throw new MathEngineError(
      'LOTTERY_NOT_REGISTERED',
      404,
      typeof errBody.detail === 'string'
        ? errBody.detail
        : 'Modalidade não registrada no motor matemático Python.'
    );
  }

  if (response.status === 422 || response.status === 501) {
    const errBody = await response.json().catch(() => ({}));
    throw new MathEngineError(
      response.status === 501 ? 'MATH_MODEL_NOT_IMPLEMENTED' : 'MATH_ENGINE_VALIDATION_ERROR',
      response.status,
      typeof errBody.detail === 'string'
        ? errBody.detail
        : 'Parâmetros rejeitados pelo motor matemático Python.'
    );
  }

  if (!response.ok) {
    throw new MathEngineError(
      'MATH_ENGINE_UPSTREAM_ERROR',
      502,
      `Motor matemático Python respondeu com erro HTTP ${response.status}.`
    );
  }

  const rawJson = await response.json().catch((err) => {
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_RESPONSE',
      502,
      'Motor matemático Python retornou JSON malformado.',
      { cause: err }
    );
  });

  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    console.error(`[math-bridge] Invalid Python response on ${path}:`, parsed.error.issues);
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_RESPONSE',
      502,
      'Resposta do motor matemático Python não atende ao contrato validado.'
    );
  }

  return parsed.data;
}

export type PrizeTierInput = z.infer<typeof prizeTierInputSchema>;

export async function requestPythonCombinationsAnalyze(params: {
  lotteryCode: string;
  mathModelType: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  prizeTiers: PrizeTierInput[];
  simpleBetPriceCents: number | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  fixedNumbers: number[];
  excludedNumbers: number[];
  variableNumbers?: number[];
  desiredGamesCount: number;
  maxBudgetCents?: number | null;
  bets?: number[][];
}) {
  validateCombinatorialParams(params.universeSize, params.drawnCount, params.chosenCount);
  const data = await postPythonCombinationsEndpoint(
    '/v1/combinations/analyze',
    {
      lottery_code: params.lotteryCode,
      math_model_type: params.mathModelType,
      universe_size: params.universeSize,
      drawn_count: params.drawnCount,
      chosen_count: params.chosenCount,
      min_numbers_to_choose: params.minNumbersToChoose,
      max_numbers_to_choose: params.maxNumbersToChoose,
      prize_tiers: params.prizeTiers.map((t) => ({
        hits: t.hits,
        tier_name: t.tierName,
        tier_order: t.tierOrder,
        is_main_prize: t.isMainPrize,
      })),
      simple_bet_price_cents: params.simpleBetPriceCents,
      price_updated_at: params.priceUpdatedAt,
      price_source: params.priceSource,
      fixed_numbers: params.fixedNumbers,
      excluded_numbers: params.excludedNumbers,
      ...(params.variableNumbers !== undefined ? { variable_numbers: params.variableNumbers } : {}),
      desired_games_count: params.desiredGamesCount,
      ...(params.maxBudgetCents !== undefined ? { max_budget_cents: params.maxBudgetCents } : {}),
      ...(params.bets !== undefined ? { bets: params.bets } : {}),
    },
    pythonCombinationsAnalyzeResponseSchema
  );

  validatePythonCombinationsAnalyzeIntegrity(
    {
      lotteryCode: params.lotteryCode,
      universeSize: params.universeSize,
      drawnCount: params.drawnCount,
      chosenCount: params.chosenCount,
      simpleBetPriceCents: params.simpleBetPriceCents,
      maxBudgetCents: params.maxBudgetCents,
      submittedBetsCount: params.bets?.length,
    },
    data
  );
  return data;
}

export async function requestPythonCombinationsCoverage(params: {
  lotteryCode: string;
  mathModelType: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  prizeTiers: PrizeTierInput[];
  bets: number[][];
  targetSubsetSize: number;
  poolNumbers?: number[];
  fixedNumbers?: number[];
  excludedNumbers?: number[];
}) {
  validateCombinatorialParams(params.universeSize, params.drawnCount, params.chosenCount);
  const fixedNumbers = params.fixedNumbers ?? [];
  const excludedNumbers = params.excludedNumbers ?? [];
  const data = await postPythonCombinationsEndpoint(
    '/v1/combinations/coverage',
    {
      lottery_code: params.lotteryCode,
      math_model_type: params.mathModelType,
      universe_size: params.universeSize,
      drawn_count: params.drawnCount,
      chosen_count: params.chosenCount,
      min_numbers_to_choose: params.minNumbersToChoose,
      max_numbers_to_choose: params.maxNumbersToChoose,
      prize_tiers: params.prizeTiers.map((t) => ({
        hits: t.hits,
        tier_name: t.tierName,
        tier_order: t.tierOrder,
        is_main_prize: t.isMainPrize,
      })),
      bets: params.bets,
      target_subset_size: params.targetSubsetSize,
      fixed_numbers: fixedNumbers,
      excluded_numbers: excludedNumbers,
      ...(params.poolNumbers !== undefined ? { pool_numbers: params.poolNumbers } : {}),
    },
    pythonCoverageResponseSchema
  );

  validatePythonCoverageIntegrity(
    {
      lotteryCode: params.lotteryCode,
      universeSize: params.universeSize,
      drawnCount: params.drawnCount,
      chosenCount: params.chosenCount,
      targetSubsetSize: params.targetSubsetSize,
      submittedBetsCount: params.bets.length,
      fixedNumbers,
      excludedNumbers,
    },
    data
  );
  return data;
}

export async function requestPythonCombinationsGenerate(params: {
  lotteryCode: string;
  mathModelType: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  prizeTiers: PrizeTierInput[];
  simpleBetPriceCents: number | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  fixedNumbers: number[];
  excludedNumbers: number[];
  variableNumbers?: number[];
  desiredGamesCount: number;
  method: GenerationMethod;
  coverageTargetT?: number;
  seed?: number;
  maxBudgetCents?: number | null;
  minEven?: number;
  maxEven?: number;
  minSum?: number;
  maxSum?: number;
  maxConsecutive?: number;
}) {
  validateCombinatorialParams(params.universeSize, params.drawnCount, params.chosenCount);
  const data = await postPythonCombinationsEndpoint(
    '/v1/combinations/generate',
    {
      lottery_code: params.lotteryCode,
      math_model_type: params.mathModelType,
      universe_size: params.universeSize,
      drawn_count: params.drawnCount,
      chosen_count: params.chosenCount,
      min_numbers_to_choose: params.minNumbersToChoose,
      max_numbers_to_choose: params.maxNumbersToChoose,
      prize_tiers: params.prizeTiers.map((t) => ({
        hits: t.hits,
        tier_name: t.tierName,
        tier_order: t.tierOrder,
        is_main_prize: t.isMainPrize,
      })),
      simple_bet_price_cents: params.simpleBetPriceCents,
      price_updated_at: params.priceUpdatedAt,
      price_source: params.priceSource,
      fixed_numbers: params.fixedNumbers,
      excluded_numbers: params.excludedNumbers,
      ...(params.variableNumbers !== undefined ? { variable_numbers: params.variableNumbers } : {}),
      desired_games_count: params.desiredGamesCount,
      method: params.method,
      ...(params.coverageTargetT !== undefined ? { coverage_target_t: params.coverageTargetT } : {}),
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
      ...(params.maxBudgetCents !== undefined ? { max_budget_cents: params.maxBudgetCents } : {}),
      ...(params.minEven !== undefined ? { min_even: params.minEven } : {}),
      ...(params.maxEven !== undefined ? { max_even: params.maxEven } : {}),
      ...(params.minSum !== undefined ? { min_sum: params.minSum } : {}),
      ...(params.maxSum !== undefined ? { max_sum: params.maxSum } : {}),
      ...(params.maxConsecutive !== undefined ? { max_consecutive: params.maxConsecutive } : {}),
    },
    pythonGenerateResponseSchema
  );

  validatePythonGenerateIntegrity(
    {
      lotteryCode: params.lotteryCode,
      universeSize: params.universeSize,
      drawnCount: params.drawnCount,
      chosenCount: params.chosenCount,
      fixedNumbers: params.fixedNumbers,
      excludedNumbers: params.excludedNumbers,
      desiredGamesCount: params.desiredGamesCount,
      method: params.method,
      maxBudgetCents: params.maxBudgetCents,
      simpleBetPriceCents: params.simpleBetPriceCents,
    },
    data
  );
  return data;
}

export async function requestPythonCombinationsCompare(params: {
  lotteryCode: string;
  mathModelType: string;
  universeSize: number;
  drawnCount: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  prizeTiers: PrizeTierInput[];
  simpleBetPriceCents: number | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  strategies: Array<{
    name: string;
    chosenCount: number;
    fixedNumbers?: number[];
    excludedNumbers?: number[];
    desiredGamesCount?: number;
    method?: GenerationMethod;
    coverageTargetT?: number;
    seed?: number;
    maxBudgetCents?: number | null;
    bets?: number[][];
  }>;
}) {
  const data = await postPythonCombinationsEndpoint(
    '/v1/combinations/compare',
    {
      lottery_code: params.lotteryCode,
      math_model_type: params.mathModelType,
      universe_size: params.universeSize,
      drawn_count: params.drawnCount,
      min_numbers_to_choose: params.minNumbersToChoose,
      max_numbers_to_choose: params.maxNumbersToChoose,
      prize_tiers: params.prizeTiers.map((t) => ({
        hits: t.hits,
        tier_name: t.tierName,
        tier_order: t.tierOrder,
        is_main_prize: t.isMainPrize,
      })),
      simple_bet_price_cents: params.simpleBetPriceCents,
      price_updated_at: params.priceUpdatedAt,
      price_source: params.priceSource,
      strategies: params.strategies.map((s) => ({
        name: s.name,
        chosen_count: s.chosenCount,
        fixed_numbers: s.fixedNumbers ?? [],
        excluded_numbers: s.excludedNumbers ?? [],
        desired_games_count: s.desiredGamesCount ?? 5,
        method: s.method ?? 'coverage_heuristic',
        ...(s.coverageTargetT !== undefined ? { coverage_target_t: s.coverageTargetT } : {}),
        ...(s.seed !== undefined ? { seed: s.seed } : {}),
        ...(s.maxBudgetCents !== undefined ? { max_budget_cents: s.maxBudgetCents } : {}),
        ...(s.bets !== undefined ? { bets: s.bets } : {}),
      })),
    },
    pythonCompareResponseSchema
  );

  validatePythonCompareIntegrity(
    {
      lotteryCode: params.lotteryCode,
      universeSize: params.universeSize,
      drawnCount: params.drawnCount,
      strategiesCount: params.strategies.length,
      strategies: params.strategies.map((s) => ({
        maxBudgetCents: s.maxBudgetCents,
        chosenCount: s.chosenCount,
      })),
    },
    data
  );
  return data;
}
