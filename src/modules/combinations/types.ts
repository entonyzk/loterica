export type GenerationMethod =
  | 'exhaustive'
  | 'uniform_sampling'
  | 'coverage_heuristic'
  | 'combinatorial_search';

export interface ModalityRuleVersionItem {
  id: number;
  versionNumber: number;
  minNumbersToChoose: number | null;
  maxNumbersToChoose: number | null;
  numberUniverseMin: number | null;
  numberUniverseMax: number | null;
  drawnNumbersCount: number | null;
  mathModelType?: string | null;
  simpleBetPriceCents?: number | null;
  priceUpdatedAt?: string | null;
  priceSource?: string | null;
  prizeTiersConfig?: Array<{
    hits: number;
    tierName: string;
    tierOrder: number;
    isMainPrize: boolean;
  }> | null;
  officialSource: string;
  isVerified: boolean;
  isLocked: boolean;
  validFrom: string;
  validTo: string | null;
}

export interface ModalitySummaryItem {
  id: number;
  name: string;
  code: string;
  description: string;
  status: string;
  ruleVersionsCount?: number;
}

export interface ModalityDetailResponse extends ModalitySummaryItem {
  ruleVersions: ModalityRuleVersionItem[];
}

export interface ContestRefItem {
  id: number;
  lotteryTypeId: number;
  ruleVersionId: number | null;
  contestNumber: number;
  drawDate: string | null;
  status: string;
}

export interface CombinationsModalityContext {
  mode: 'modality';
  lotteryId: number;
  lotteryCode: string;
  lotteryName: string;
  ruleVersionId: number;
  ruleVersionNumber: number;
  ruleValidFrom: string;
  ruleValidTo: string | null;
  referenceDate: string;
  referenceSource: string;
  universeSize: number;
  drawnCount: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  chosenCount: number;
  simpleBetPriceCents: number | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  officialSource: string;
}

export interface PartitionInfo {
  fixed_numbers: number[];
  excluded_numbers: number[];
  explicit_excluded_numbers: number[];
  variable_numbers: number[];
  fixed_count: number;
  excluded_count: number;
  variable_count: number;
  remaining_slots: number;
}

export interface BetSetAnalysisResult {
  lottery_code: string;
  universe_size: number;
  drawn_count: number;
  chosen_count: number;
  counts: {
    submitted_bets_count: number;
    distinct_bets_count: number;
    repeated_bets_count: number;
    duplicate_groups: Array<{ bet: number[]; occurrences: number }>;
    constraint_violations: Array<{
      bet_index: number;
      missing_fixed: number[];
      used_excluded: number[];
    }>;
    all_bets_respect_constraints: boolean;
  };
  intersections: {
    distinct_pair_count: number;
    min_overlap: number;
    max_overlap: number;
    avg_overlap: number;
    avg_overlap_exact: string;
    disjoint_pairs_count: number;
    overlap_histogram: Record<string, number>;
    top_overlapping_pairs: Array<{ bet_a: number; bet_b: number; overlap: number }>;
  };
  redundancy: {
    simple_combinations_per_bet: string;
    nominal_simple_combinations: string;
    exact_simple_expansion_computed: boolean;
    distinct_simple_combinations: string | null;
    redundant_simple_combinations: string | null;
    redundancy_rate_percentage: string | null;
    main_prize_exact: {
      raw_numerator: string;
      raw_denominator: string;
      exact_numerator: string;
      exact_denominator: string;
      probability: number;
      percentage: string;
      scientific_notation: string;
      odds_one_in: string | null;
    } | null;
  };
  distribution: {
    used_numbers_count: number;
    unused_numbers_count: number;
    unused_numbers: number[];
    number_frequency: Array<{ number: number; count: number; pct_of_bets: number }>;
    sum_min: number;
    sum_max: number;
    sum_avg: number;
    even_min: number;
    even_max: number;
    even_avg: number;
  };
  costs: {
    simple_bet_price_cents: number | null;
    unit_bet_cost_cents: string | null;
    total_submitted_cost_cents: string | null;
    distinct_only_cost_cents: string | null;
    wasted_on_duplicates_cents: string | null;
    price_updated_at: string | null;
    price_source: string | null;
  };
  axiom_notice: string;
  execution_source: 'python_fastapi_engine';
}

export interface CombinationsAnalyzeResponse {
  lottery_code: string;
  universe_size: number;
  drawn_count: number;
  chosen_count: number;
  partition: PartitionInfo;
  combinatorics: {
    total_unrestricted_combinations: string;
    total_simple_space_combinations: string;
    restricted_combinations: string;
    restricted_share_exact_numerator: string;
    restricted_share_exact_denominator: string;
    restricted_share_percentage: string;
    reduction_factor: number;
    equivalent_simple_bets_per_game: string;
    permutations_k_from_m: string;
    internal_bet_permutations_m_factorial: string | null;
    permutations_applicability_note: string;
    formula: string;
    substituted_formula: string;
  };
  budget_and_costs: {
    simple_bet_price_cents: number | null;
    unit_bet_cost_cents: string | null;
    price_updated_at: string | null;
    price_source: string | null;
    desired_games_count: number;
    feasible_desired_games: string;
    max_budget_cents: string | null;
    affordable_games_count: string | null;
    planned_games_count: string;
    planned_total_cost_cents: string | null;
    remaining_budget_cents: string | null;
    left_out_by_budget: string;
    left_out_from_restricted_space: string;
    full_restricted_closure_cost_cents: string | null;
    planned_vs_restricted_fraction: string;
    planned_vs_restricted_percentage: string;
    planned_nominal_simple_combinations: string;
    upper_bound_simple_space_fraction: string;
  };
  bet_set_analysis: BetSetAnalysisResult | null;
  axiom_notice: string;
  execution_source: 'python_fastapi_engine';
  modalityContext?: CombinationsModalityContext;
}

export interface CombinationsCoverageResponse {
  lottery_code: string;
  universe_size: number;
  drawn_count: number;
  chosen_count: number;
  target_subset_size: number;
  fixed_numbers?: number[];
  excluded_numbers?: number[];
  pool_size: number;
  pool_numbers: number[];
  submitted_bets_count: number;
  distinct_bets_count: number;
  coverage: {
    total_pool_subsets: string;
    total_universe_subsets: string;
    covered_subsets_count: string;
    uncovered_subsets_count: string;
    coverage_fraction: string;
    coverage_exact_numerator: string;
    coverage_exact_denominator: string;
    coverage_percentage: number;
    universe_coverage_percentage: number;
    is_full_coverage_proven: boolean;
    enumeration_mode: 'exhaustive' | 'sampled_missing';
  };
  redundancy: {
    subsets_per_bet: string;
    nominal_subset_appearances: string;
    repeated_subset_appearances: string;
    multiplicity_histogram: Record<string, number>;
  };
  covered_sample: Array<{ subset: number[]; occurrences: number }>;
  uncovered_sample: number[][];
  coverage_vs_guarantee_notice: string;
  execution_source: 'python_fastapi_engine';
  modalityContext?: CombinationsModalityContext;
}

export interface CombinationsGenerateResponse {
  lottery_code: string;
  universe_size: number;
  drawn_count: number;
  chosen_count: number;
  partition: PartitionInfo;
  method: GenerationMethod;
  seed: number | null;
  method_classification: {
    method_nature: string;
    label: string;
    is_exact_solution: boolean;
    is_proven_optimal_covering: boolean;
    is_full_t_coverage_proven: boolean;
    disclaimer: string;
  };
  generation_summary: {
    desired_games_count: number;
    generated_count: number;
    duplicates_count: number;
    rejected_by_composition_filters: number;
    restricted_space_combinations: string;
    total_filtered_space: string | null;
    left_out_from_desired: string;
    left_out_from_restricted_space: string;
  };
  budget_summary: {
    simple_bet_price_cents: number | null;
    unit_bet_cost_cents: string | null;
    max_budget_cents: string | null;
    affordable_games_limit: string | null;
    total_cost_cents: string | null;
    remaining_budget_cents: string | null;
    price_updated_at: string | null;
    price_source: string | null;
  };
  coverage_summary: CombinationsCoverageResponse;
  generated_bets: number[][];
  bet_set_analysis: BetSetAnalysisResult;
  execution_source: 'python_fastapi_engine';
  modalityContext?: CombinationsModalityContext;
}

export interface StrategyEvaluatedItem {
  index: number;
  name: string;
  chosen_count: number;
  method: string;
  is_exact_method: boolean;
  generation_classification: CombinationsGenerateResponse['method_classification'] | null;
  restrictions: {
    fixed_numbers: number[];
    excluded_numbers: number[];
    variable_count: number;
    restricted_combinations: string;
    pool_size: number;
    pool_numbers: number[];
  };
  bets_count: number;
  distinct_bets_count: number;
  repeated_bets_count: number;
  total_cost_cents: string | null;
  distinct_simple_combinations: string | null;
  redundant_simple_combinations: string | null;
  intersections: {
    min_overlap: number;
    max_overlap: number;
    avg_overlap: number;
  };
  coverage: {
    target_subset_size: number;
    pool_size: number;
    covered_subsets_count: string;
    total_pool_subsets: string;
    coverage_percentage: number;
    coverage_fraction: string;
    is_full_coverage_proven: boolean;
  };
  coverage_comparable_with_baseline: boolean;
  probabilities: {
    main_prize_exact: {
      raw_numerator: string;
      raw_denominator: string;
      exact_numerator: string;
      exact_denominator: string;
      probability: number;
      percentage: string;
      scientific_notation: string;
      odds_one_in: string | null;
    } | null;
    exact_any_prize: {
      raw_numerator: string;
      raw_denominator: string;
      exact_numerator: string;
      exact_denominator: string;
      probability: number;
      scientific_notation: string;
      odds_one_in: string | null;
    } | null;
    exact_union_status: string;
  };
  delta_vs_baseline: {
    cost_cents: string | null;
    coverage_percentage_points: number | null;
    distinct_simple_combinations: string | null;
  };
  sample_bets: number[][];
}

export interface CombinationsCompareResponse {
  lottery_code: string;
  universe_size: number;
  drawn_count: number;
  simple_bet_price_cents: number | null;
  price_updated_at: string | null;
  price_source: string | null;
  strategies_count: number;
  has_heterogeneous_universes: boolean;
  universe_comparison_notice: string | null;
  strategies: StrategyEvaluatedItem[];
  axiom_notice: string;
  execution_source: 'python_fastapi_engine';
  modalityContext?: CombinationsModalityContext;
}

export function formatBigIntPtBr(value: string | number): string {
  try {
    return BigInt(value).toLocaleString('pt-BR');
  } catch {
    return String(value);
  }
}

export function formatBrlFromCents(cents: string | number | null | undefined): string {
  if (cents === null || cents === undefined) return 'Não cadastrado';
  const num = Number(cents);
  if (!Number.isFinite(num)) return 'Indisponível';
  return (num / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function parseBetsInput(raw: string): number[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split(/[\s,;.\-/]+/)
        .filter(Boolean)
        .map((tok) => Number(tok))
    );
}

export function parseNumberListInput(
  raw: string,
  universeSize: number,
  label: string
): { numbers: number[]; errors: string[] } {
  const trimmed = raw.trim();
  if (!trimmed) return { numbers: [], errors: [] };

  const tokens = trimmed.split(/[\s,;.\-/]+/).filter(Boolean);
  const errors: string[] = [];
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) {
      errors.push(`${label}: valor inválido "${tok}" (informe apenas inteiros).`);
      continue;
    }
    const num = Number(tok);
    if (!Number.isInteger(num) || num < 1 || num > universeSize) {
      errors.push(`${label}: dezena ${num} fora do universo [1..${universeSize}].`);
      continue;
    }
    if (seen.has(num)) {
      duplicates.add(num);
    } else {
      seen.add(num);
    }
  }

  if (duplicates.size > 0) {
    errors.push(
      `${label}: dezenas duplicadas (${Array.from(duplicates)
        .sort((a, b) => a - b)
        .join(', ')}).`
    );
  }

  return {
    numbers: Array.from(seen).sort((a, b) => a - b),
    errors,
  };
}

export interface BetValidationIssue {
  betIndex: number;
  reasons: string[];
}

export function validateBetsClient(params: {
  rawText?: string;
  explicitBets?: number[][];
  chosenCount: number;
  universeSize: number;
  fixedNumbers: number[];
  excludedNumbers: number[];
}): {
  validBets: number[][];
  errors: BetValidationIssue[];
  isEmpty: boolean;
} {
  const fixedSet = new Set(params.fixedNumbers);
  const excludedSet = new Set(params.excludedNumbers);
  const errors: BetValidationIssue[] = [];
  const validBets: number[][] = [];

  let candidateRows: Array<{ index: number; values: number[]; invalidTokens: string[] }> = [];

  if (params.explicitBets !== undefined) {
    candidateRows = params.explicitBets.map((bet, i) => ({
      index: i + 1,
      values: bet,
      invalidTokens: [],
    }));
  } else {
    const lines = (params.rawText ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    candidateRows = lines.map((line, i) => {
      const tokens = line.split(/[\s,;.\-/]+/).filter(Boolean);
      const values: number[] = [];
      const invalidTokens: string[] = [];
      for (const tok of tokens) {
        if (!/^\d+$/.test(tok)) {
          invalidTokens.push(tok);
        } else {
          values.push(Number(tok));
        }
      }
      return { index: i + 1, values, invalidTokens };
    });
  }

  if (candidateRows.length === 0) {
    return { validBets: [], errors: [], isEmpty: true };
  }

  for (const row of candidateRows) {
    const reasons: string[] = [];

    if (row.invalidTokens.length > 0) {
      reasons.push(`valores não inteiros (${row.invalidTokens.join(', ')})`);
    }

    const totalNumbers = row.values.length + row.invalidTokens.length;
    if (totalNumbers !== params.chosenCount) {
      reasons.push(
        `quantidade incorreta de dezenas (${totalNumbers} informadas, esperado ${params.chosenCount})`
      );
    }

    const outOfRange = row.values.filter(
      (n) => !Number.isInteger(n) || n < 1 || n > params.universeSize
    );
    if (outOfRange.length > 0) {
      reasons.push(
        `dezena(s) fora do universo [1..${params.universeSize}]: ${outOfRange.join(', ')}`
      );
    }

    const seen = new Set<number>();
    const repeated = new Set<number>();
    for (const n of row.values) {
      if (seen.has(n)) repeated.add(n);
      seen.add(n);
    }
    if (repeated.size > 0) {
      reasons.push(
        `dezena(s) repetida(s): ${Array.from(repeated)
          .sort((a, b) => a - b)
          .join(', ')}`
      );
    }

    const usedExcluded = Array.from(seen)
      .filter((n) => excludedSet.has(n))
      .sort((a, b) => a - b);
    if (usedExcluded.length > 0) {
      reasons.push(`contém dezena(s) excluída(s): ${usedExcluded.join(', ')}`);
    }

    const missingFixed = Array.from(fixedSet)
      .filter((f) => !seen.has(f))
      .sort((a, b) => a - b);
    if (missingFixed.length > 0) {
      reasons.push(`ausência de dezena(s) fixa(s) obrigatória(s): ${missingFixed.join(', ')}`);
    }

    if (reasons.length > 0) {
      errors.push({ betIndex: row.index, reasons });
    } else {
      validBets.push(Array.from(seen).sort((a, b) => a - b));
    }
  }

  return {
    validBets: errors.length === 0 ? validBets : [],
    errors,
    isEmpty: false,
  };
}
