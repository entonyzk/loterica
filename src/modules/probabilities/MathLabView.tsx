import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  buildHypergeometricDistribution,
  exactCombinationsBigInt,
  hypergeometricDetail,
} from './combinatorics';
import {
  classifyRuleTemporalStatus,
  selectActiveVerifiedRuleVersion,
} from './rule-validity';
import type {
  CalculationMemoryEntry,
  ExactUnionAnalysis,
  LotteryMathModelType,
  PrizeTierConfigItem,
  SpecializedHitPoint,
  SpecializedModalityAnalysis,
  TierAtLeastOneWin,
} from './specialized';

interface PythonExecutionState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  totalCombinations?: string;
  executionSource?: string;
  distributionSum?: number;
  referenceDate?: string;
  endpointUsed?: 'theoretical' | 'specialized';
}

interface SpecializedFetchState {
  status: 'idle' | 'loading' | 'success' | 'error';
  errorCode?: string;
  errorMessage?: string;
  executionSource?: string;
  distributionSum?: number;
}

interface LotterySummaryItem {
  id: number;
  name: string;
  code: string;
  description: string;
  status: string;
  ruleVersionsCount?: number;
}

interface RuleVersionItem {
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
  prizeTiersConfig?: PrizeTierConfigItem[] | null;
  officialSource: string;
  isVerified: boolean;
  isLocked: boolean;
  validFrom: string;
  validTo: string | null;
}

interface LotteryDetailResponse extends LotterySummaryItem {
  ruleVersions: RuleVersionItem[];
}

interface ContestReferenceItem {
  id: number;
  lotteryTypeId: number;
  ruleVersionId: number | null;
  contestNumber: number;
  drawDate: string | null;
  status: string;
}

type CalculationMode = 'free' | 'modality';
type ReferenceMode = 'current' | 'date' | 'contest';
type SpecializedTab = 'probabilities' | 'simple_vs_multiple' | 'comparator';

function formatBigIntPtBr(value: string): string {
  try {
    return BigInt(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function formatBrlFromCentsStr(centsStr: string | number | null | undefined): string {
  if (centsStr === null || centsStr === undefined) return 'Preço não cadastrado';
  const num = Number(centsStr);
  if (!Number.isFinite(num)) return 'Preço indisponível';
  return (num / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatOddsDisplay(probability: number, oddsOneIn: string | null): string {
  if (!oddsOneIn || probability <= 0) return 'Impossível';
  if (probability > 0.05) {
    const exactRatio = 1 / probability;
    return `1 em ${exactRatio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
  }
  return `1 em ${formatBigIntPtBr(oddsOneIn)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMemory(raw: any): CalculationMemoryEntry {
  return {
    title: String(raw.title),
    formula: String(raw.formula),
    substitutedParameters: String(raw.substituted_parameters),
    rawNumerator: String(raw.raw_numerator),
    rawDenominator: String(raw.raw_denominator),
    simplifiedFraction: String(raw.simplified_fraction),
    decimalProbability: Number(raw.decimal_probability),
    percentageFormatted: String(raw.percentage_formatted),
    scientificNotation: String(raw.scientific_notation),
    oddsOneIn: raw.odds_one_in != null ? String(raw.odds_one_in) : null,
    plainExplanation: String(raw.plain_explanation),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAtLeastOneWin(raw: any): TierAtLeastOneWin | undefined {
  if (!raw) return undefined;
  return {
    triggeringVolanteHits: Array.isArray(raw.triggering_volante_hits)
      ? raw.triggering_volante_hits.map(Number)
      : [],
    probability: Number(raw.probability),
    rawNumerator: String(raw.raw_numerator),
    rawDenominator: String(raw.raw_denominator),
    exactNumerator: String(raw.exact_numerator),
    exactDenominator: String(raw.exact_denominator),
    scientificNotation: String(raw.scientific_notation),
    oddsOneIn: raw.odds_one_in != null ? String(raw.odds_one_in) : null,
    precisionClassification: raw.precision_classification,
    memory: mapMemory(raw.memory),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSpecializedHitPoint(raw: any): SpecializedHitPoint {
  return {
    hits: Number(raw.hits),
    probability: Number(raw.probability),
    rawNumerator: String(raw.raw_numerator),
    rawDenominator: String(raw.raw_denominator),
    exactNumerator: String(raw.exact_numerator),
    exactDenominator: String(raw.exact_denominator),
    scientificNotation: String(raw.scientific_notation),
    oddsOneIn: raw.odds_one_in != null ? String(raw.odds_one_in) : null,
    isImpossible: Boolean(raw.is_impossible),
    precisionClassification: raw.precision_classification,
    tierName: raw.tier_name != null ? String(raw.tier_name) : null,
    isPrizeTier: Boolean(raw.is_prize_tier),
    isMainPrize: Boolean(raw.is_main_prize),
    embeddedSimpleWins: Array.isArray(raw.embedded_simple_wins)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw.embedded_simple_wins.map((w: any) => ({
          tierName: String(w.tier_name),
          targetHits: Number(w.target_hits),
          winningSimpleCombinations: String(w.winning_simple_combinations),
        }))
      : [],
    expectedEmbeddedWinsPerDraw:
      raw.expected_embedded_wins_per_draw != null
        ? Number(raw.expected_embedded_wins_per_draw)
        : undefined,
    atLeastOneWin: mapAtLeastOneWin(raw.at_least_one_win),
    memory: mapMemory(raw.memory),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapExactUnionAnalysis(raw: any): ExactUnionAnalysis | null {
  if (!raw) return null;
  return {
    gamesCount: Number(raw.games_count),
    pairwiseOverlapSummary: {
      pairCount: Number(raw.pairwise_overlap_summary.pair_count),
      minOverlap: Number(raw.pairwise_overlap_summary.min_overlap),
      maxOverlap: Number(raw.pairwise_overlap_summary.max_overlap),
      avgOverlap: Number(raw.pairwise_overlap_summary.avg_overlap),
      disjointPairsCount: Number(raw.pairwise_overlap_summary.disjoint_pairs_count),
    },
    mainPrizeUnion: {
      rawNumerator: String(raw.main_prize_union.raw_numerator),
      rawDenominator: String(raw.main_prize_union.raw_denominator),
      exactNumerator: String(raw.main_prize_union.exact_numerator),
      exactDenominator: String(raw.main_prize_union.exact_denominator),
      probability: Number(raw.main_prize_union.probability),
      scientificNotation: String(raw.main_prize_union.scientific_notation),
      oddsOneIn:
        raw.main_prize_union.odds_one_in != null ? String(raw.main_prize_union.odds_one_in) : null,
    },
    anyPrizeUnion: {
      rawNumerator: String(raw.any_prize_union.raw_numerator),
      rawDenominator: String(raw.any_prize_union.raw_denominator),
      exactNumerator: String(raw.any_prize_union.exact_numerator),
      exactDenominator: String(raw.any_prize_union.exact_denominator),
      probability: Number(raw.any_prize_union.probability),
      scientificNotation: String(raw.any_prize_union.scientific_notation),
      oddsOneIn:
        raw.any_prize_union.odds_one_in != null ? String(raw.any_prize_union.odds_one_in) : null,
      memory: mapMemory(raw.any_prize_union.memory),
    },
    secondaryPrizeUnion: {
      rawNumerator: String(raw.secondary_prize_union.raw_numerator),
      rawDenominator: String(raw.secondary_prize_union.raw_denominator),
      exactNumerator: String(raw.secondary_prize_union.exact_numerator),
      exactDenominator: String(raw.secondary_prize_union.exact_denominator),
      probability: Number(raw.secondary_prize_union.probability),
      scientificNotation: String(raw.secondary_prize_union.scientific_notation),
      oddsOneIn:
        raw.secondary_prize_union.odds_one_in != null
          ? String(raw.secondary_prize_union.odds_one_in)
          : null,
      memory: mapMemory(raw.secondary_prize_union.memory),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPythonSpecializedToAnalysis(payload: any): SpecializedModalityAnalysis {
  const distEntries = Object.values(payload.distribution_by_hits ?? {})
    .map(mapSpecializedHitPoint)
    .sort((a, b) => a.hits - b.hits);

  return {
    lotteryCode: String(payload.lottery_code),
    mathModelType: payload.math_model_type as LotteryMathModelType,
    universeSize: Number(payload.universe_size),
    drawnCount: Number(payload.drawn_count),
    chosenCount: Number(payload.chosen_count),
    totalSpaceSimpleCombinations: String(payload.total_space_simple_combinations),
    totalChosenCombinations: String(payload.total_combinations),
    anyPrize: {
      label: String(payload.any_prize.label),
      probability: Number(payload.any_prize.probability),
      rawNumerator: String(payload.any_prize.raw_numerator),
      rawDenominator: String(payload.any_prize.raw_denominator),
      exactNumerator: String(payload.any_prize.exact_numerator),
      exactDenominator: String(payload.any_prize.exact_denominator),
      scientificNotation: String(payload.any_prize.scientific_notation),
      oddsOneIn: payload.any_prize.odds_one_in != null ? String(payload.any_prize.odds_one_in) : null,
      precisionClassification: payload.any_prize.precision_classification,
      memory: mapMemory(payload.any_prize.memory),
    },
    noPrize: {
      label: String(payload.no_prize.label),
      probability: Number(payload.no_prize.probability),
      rawNumerator: String(payload.no_prize.raw_numerator),
      rawDenominator: String(payload.no_prize.raw_denominator),
      exactNumerator: String(payload.no_prize.exact_numerator),
      exactDenominator: String(payload.no_prize.exact_denominator),
      scientificNotation: String(payload.no_prize.scientific_notation),
      oddsOneIn: payload.no_prize.odds_one_in != null ? String(payload.no_prize.odds_one_in) : null,
      precisionClassification: payload.no_prize.precision_classification,
      memory: mapMemory(payload.no_prize.memory),
    },
    prizeTiers: Array.isArray(payload.prize_tiers)
      ? payload.prize_tiers.map(mapSpecializedHitPoint)
      : [],
    distribution: distEntries,
    multipleBet: {
      chosenCount: Number(payload.multiple_bet.chosen_count),
      drawnCount: Number(payload.multiple_bet.drawn_count),
      isMultipleBet: Boolean(payload.multiple_bet.is_multiple_bet),
      equivalentSimpleBets: String(payload.multiple_bet.equivalent_simple_bets),
      simpleBetPriceCents:
        payload.multiple_bet.simple_bet_price_cents != null
          ? Number(payload.multiple_bet.simple_bet_price_cents)
          : null,
      totalCostCents:
        payload.multiple_bet.total_cost_cents != null
          ? String(payload.multiple_bet.total_cost_cents)
          : null,
      priceUpdatedAt:
        payload.multiple_bet.price_updated_at != null
          ? String(payload.multiple_bet.price_updated_at)
          : null,
      priceSource:
        payload.multiple_bet.price_source != null
          ? String(payload.multiple_bet.price_source)
          : null,
      combinatorialCoverage: {
        numerator: String(payload.multiple_bet.combinatorial_coverage.numerator),
        denominator: String(payload.multiple_bet.combinatorial_coverage.denominator),
        simplifiedNumerator: String(payload.multiple_bet.combinatorial_coverage.simplified_numerator),
        simplifiedDenominator: String(
          payload.multiple_bet.combinatorial_coverage.simplified_denominator
        ),
        probability: Number(payload.multiple_bet.combinatorial_coverage.probability),
        scientificNotation: String(payload.multiple_bet.combinatorial_coverage.scientific_notation),
        oddsOneIn:
          payload.multiple_bet.combinatorial_coverage.odds_one_in != null
            ? String(payload.multiple_bet.combinatorial_coverage.odds_one_in)
            : null,
      },
    },
    simpleGamesComparison: {
      simpleGamesCount: Number(payload.simple_games_comparison.simple_games_count),
      simpleBetPriceCents:
        payload.simple_games_comparison.simple_bet_price_cents != null
          ? Number(payload.simple_games_comparison.simple_bet_price_cents)
          : null,
      totalCostCents:
        payload.simple_games_comparison.total_cost_cents != null
          ? String(payload.simple_games_comparison.total_cost_cents)
          : null,
      topPrizeExact: {
        numerator: String(payload.simple_games_comparison.top_prize_exact.numerator),
        denominator: String(payload.simple_games_comparison.top_prize_exact.denominator),
        simplifiedNumerator: String(
          payload.simple_games_comparison.top_prize_exact.simplified_numerator
        ),
        simplifiedDenominator: String(
          payload.simple_games_comparison.top_prize_exact.simplified_denominator
        ),
        probability: Number(payload.simple_games_comparison.top_prize_exact.probability),
        scientificNotation: String(
          payload.simple_games_comparison.top_prize_exact.scientific_notation
        ),
        oddsOneIn:
          payload.simple_games_comparison.top_prize_exact.odds_one_in != null
            ? String(payload.simple_games_comparison.top_prize_exact.odds_one_in)
            : null,
      },
      expectedWinningGamesPerDraw: Number(
        payload.simple_games_comparison.expected_winning_games_per_draw
      ),
      expectedSecondaryWinningGamesPerDraw: Number(
        payload.simple_games_comparison.expected_secondary_winning_games_per_draw
      ),
      secondaryPrizeStatus: payload.simple_games_comparison.secondary_prize_status,
      overlapDependencyNotice: String(payload.simple_games_comparison.overlap_dependency_notice),
      exactUnionAnalysis: mapExactUnionAnalysis(
        payload.simple_games_comparison.exact_union_analysis
      ),
      illustrativeIndependentApproximation: {
        value: Number(
          payload.simple_games_comparison.illustrative_independent_approximation.value
        ),
        isExact: false,
        warning: String(
          payload.simple_games_comparison.illustrative_independent_approximation.warning
        ),
      },
      equiprobabilityNotice: String(payload.simple_games_comparison.equiprobability_notice),
    },
    comparisonRows: Array.isArray(payload.comparison_rows)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload.comparison_rows.map((r: any) => ({
          chosenCount: Number(r.chosen_count),
          isSelected: Boolean(r.is_selected),
          equivalentSimpleBets: String(r.equivalent_simple_bets),
          totalCostCents: r.total_cost_cents != null ? String(r.total_cost_cents) : null,
          totalSpaceCombinations: String(r.total_space_combinations),
          mainPrizeHits: Number(r.main_prize_hits),
          mainPrizeProbability: Number(r.main_prize_probability),
          mainPrizeOddsOneIn: r.main_prize_odds_one_in != null ? String(r.main_prize_odds_one_in) : null,
          anyPrizeProbability: Number(r.any_prize_probability),
          anyPrizeOddsOneIn: r.any_prize_odds_one_in != null ? String(r.any_prize_odds_one_in) : null,
          noPrizeProbability: Number(r.no_prize_probability),
          coverageFactorVsMinimum: String(r.coverage_factor_vs_minimum),
        }))
      : [],
    equiprobabilityAxiom: String(payload.axiom_notice ?? ''),
  };
}

function parseExplicitSimpleBetsText(
  text: string,
  universeSize: number,
  drawnCount: number
): { bets: number[][]; error: string | null } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { bets: [], error: 'Informe pelo menos 1 combinação (uma por linha).' };
  }
  if (lines.length > 12) {
    return { bets: [], error: 'Limite de 12 combinações simples para cálculo exato da união.' };
  }
  const seen = new Set<string>();
  const bets: number[][] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const tokens = lines[idx].split(/[\s,;]+/).filter(Boolean);
    const nums = tokens.map(Number);
    if (nums.length !== drawnCount) {
      return {
        bets: [],
        error: `Linha #${idx + 1}: esperada(s) ${drawnCount} dezena(s), encontradas ${nums.length}.`,
      };
    }
    const uniq = new Set<number>();
    for (const num of nums) {
      if (!Number.isInteger(num) || num < 1 || num > universeSize) {
        return {
          bets: [],
          error: `Linha #${idx + 1}: dezena "${num}" deve ser inteiro entre 1 e ${universeSize}.`,
        };
      }
      uniq.add(num);
    }
    if (uniq.size !== nums.length) {
      return {
        bets: [],
        error: `Linha #${idx + 1}: contém dezenas repetidas.`,
      };
    }
    const sorted = Array.from(uniq).sort((a, b) => a - b);
    const key = sorted.join(',');
    if (seen.has(key)) {
      return {
        bets: [],
        error: `Linha #${idx + 1}: combinação repetida; informe jogos distintos.`,
      };
    }
    seen.add(key);
    bets.push(sorted);
  }
  return { bets, error: null };
}

function formatBetsLines(bets: number[][]): string {
  return bets.map((b) => b.map((n) => String(n).padStart(2, '0')).join(' ')).join('\n');
}

const MemoryPanel: React.FC<{ memory: CalculationMemoryEntry }> = ({ memory }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[#E5C158]">
        Memória de Cálculo Racional Exato (BigInt)
      </p>
      <p className="font-mono-tabular text-neutral-300 break-all">
        <span className="text-neutral-500">Numerador exato:</span>{' '}
        {formatBigIntPtBr(memory.rawNumerator)}
      </p>
      <p className="font-mono-tabular text-neutral-300 break-all">
        <span className="text-neutral-500">Denominador exato:</span>{' '}
        {formatBigIntPtBr(memory.rawDenominator)}
      </p>
      <p className="font-mono-tabular text-neutral-200 break-all">
        <span className="text-neutral-500">Fração simplificada (MDC):</span>{' '}
        {memory.simplifiedFraction}
      </p>
      <p className="text-neutral-300 leading-relaxed pt-1">
        <span className="text-neutral-500 font-medium">Em linguagem simples:</span>{' '}
        {memory.plainExplanation}
      </p>
    </div>

    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[#8B5CF6]">
        Fórmula, Substituição & Aproximação Decimal
      </p>
      <p className="font-mono-tabular text-neutral-300 break-words">
        <span className="text-neutral-500">Fórmula:</span> {memory.formula}
      </p>
      <p className="font-mono-tabular text-neutral-300 break-words">
        <span className="text-neutral-500">Substituição:</span> {memory.substitutedParameters}
      </p>
      <p className="font-mono-tabular text-neutral-300">
        <span className="text-neutral-500">Resultado decimal / %:</span>{' '}
        {memory.decimalProbability.toPrecision(8)} ({memory.percentageFormatted})
      </p>
      <p className="font-mono-tabular text-neutral-300">
        <span className="text-neutral-500">Notação científica:</span> {memory.scientificNotation} ·{' '}
        <span className="text-neutral-500">Razão:</span>{' '}
        {formatOddsDisplay(memory.decimalProbability, memory.oddsOneIn)}
      </p>
    </div>
  </div>
);

export const MathLabView: React.FC = () => {
  const [mode, setMode] = useState<CalculationMode>('free');
  const [specializedTab, setSpecializedTab] = useState<SpecializedTab>('probabilities');

  // Parâmetros livres
  const [universeSize, setUniverseSize] = useState(50);
  const [drawnCount, setDrawnCount] = useState(5);
  const [chosenCount, setChosenCount] = useState(5);

  // Estrutura para modalidades reais e vigência temporal
  const [lotteries, setLotteries] = useState<LotterySummaryItem[]>([]);
  const [lotteriesLoading, setLotteriesLoading] = useState(false);
  const [lotteriesError, setLotteriesError] = useState<string | null>(null);
  const [selectedLotteryId, setSelectedLotteryId] = useState<number | null>(null);
  const [selectedLotteryDetail, setSelectedLotteryDetail] =
    useState<LotteryDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('current');
  const [customReferenceDate, setCustomReferenceDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [contests, setContests] = useState<ContestReferenceItem[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<number | null>(null);

  // Controles especializados (Simples vs Múltiplas & Comparador A vs B)
  const [simpleGamesCount, setSimpleGamesCount] = useState(7);
  const [simpleBetsText, setSimpleBetsText] = useState('');
  const [appliedSimpleBets, setAppliedSimpleBets] = useState<number[][] | null>(null);
  const [simpleBetsInputError, setSimpleBetsInputError] = useState<string | null>(null);
  const [compareConfigA, setCompareConfigA] = useState<number>(6);
  const [compareConfigB, setCompareConfigB] = useState<number>(7);

  // Resultado especializado remoto exclusivamente do motor Python
  const [specializedAnalysis, setSpecializedAnalysis] =
    useState<SpecializedModalityAnalysis | null>(null);
  const [specializedFetch, setSpecializedFetch] = useState<SpecializedFetchState>({
    status: 'idle',
  });
  const [specializedRefreshNonce, setSpecializedRefreshNonce] = useState(0);

  // Memória de cálculo expansível
  const [expandedHits, setExpandedHits] = useState<Record<number, boolean>>({});
  const [expandedTierAtLeastOne, setExpandedTierAtLeastOne] = useState<Record<number, boolean>>({});
  const [expandedAggregate, setExpandedAggregate] = useState<'none' | 'any' | 'no'>('none');
  const [expandedUnionMemory, setExpandedUnionMemory] = useState<'none' | 'any' | 'secondary'>(
    'none'
  );

  // Execução manual no motor Python (para modo Parâmetros Livres ou verificação teórica)
  const [pythonState, setPythonState] = useState<PythonExecutionState>({ status: 'idle' });

  // Carrega catálogo de modalidades ao entrar no laboratório
  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      setLotteriesLoading(true);
      setLotteriesError(null);
      try {
        const res = await fetch('/api/lotteries');
        if (!res.ok) {
          throw new Error(`Erro HTTP ${res.status} ao carregar modalidades.`);
        }
        const data = (await res.json()) as { items?: LotterySummaryItem[] };
        if (!active) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setLotteries(items);
        if (items.length > 0) {
          setSelectedLotteryId((prev) => prev ?? items[0].id);
        }
      } catch (err) {
        if (!active) return;
        setLotteriesError(
          err instanceof Error ? err.message : 'Falha ao consultar catálogo de modalidades.'
        );
      } finally {
        if (active) setLotteriesLoading(false);
      }
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  // Carrega versões de regra ao trocar modalidade
  useEffect(() => {
    if (selectedLotteryId == null) {
      setSelectedLotteryDetail(null);
      return;
    }
    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/lotteries/${selectedLotteryId}`);
        if (!res.ok) {
          throw new Error(`Erro HTTP ${res.status} ao carregar regras da modalidade.`);
        }
        const detail = (await res.json()) as LotteryDetailResponse;
        if (!active) return;
        setSelectedLotteryDetail(detail);
      } catch {
        if (!active) return;
        setSelectedLotteryDetail(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedLotteryId]);

  // Carrega concursos históricos (quando disponíveis) ao trocar modalidade
  useEffect(() => {
    if (selectedLotteryId == null) {
      setContests([]);
      setSelectedContestId(null);
      return;
    }
    let active = true;
    const loadContests = async () => {
      try {
        const res = await fetch(`/api/contests?lotteryId=${selectedLotteryId}&limit=50`);
        if (!res.ok) return;
        const data = (await res.json()) as { items?: ContestReferenceItem[] };
        if (!active) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setContests(list);
        setSelectedContestId(list[0]?.id ?? null);
      } catch {
        if (!active) return;
        setContests([]);
        setSelectedContestId(null);
      }
    };
    void loadContests();
    return () => {
      active = false;
    };
  }, [selectedLotteryId]);

  const selectedContest = useMemo(
    () => contests.find((c) => c.id === selectedContestId) ?? null,
    [contests, selectedContestId]
  );

  const effectiveReferenceDate = useMemo(() => {
    if (referenceMode === 'contest' && selectedContest?.drawDate) {
      const parsed = new Date(selectedContest.drawDate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (referenceMode === 'date' && customReferenceDate) {
      const isoCandidate = customReferenceDate.includes('T')
        ? customReferenceDate
        : `${customReferenceDate}T12:00:00.000Z`;
      const parsed = new Date(isoCandidate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }, [referenceMode, selectedContest, customReferenceDate, selectedLotteryId]);

  const activeVerifiedRule = useMemo(() => {
    if (!selectedLotteryDetail?.ruleVersions) return null;
    if (referenceMode === 'contest' && selectedContest?.ruleVersionId != null) {
      const linked = selectedLotteryDetail.ruleVersions.find(
        (r) => r.id === selectedContest.ruleVersionId
      );
      if (linked && classifyRuleTemporalStatus(linked, effectiveReferenceDate) === 'active') {
        return linked;
      }
      return null;
    }
    return selectActiveVerifiedRuleVersion(
      selectedLotteryDetail.ruleVersions,
      effectiveReferenceDate
    );
  }, [selectedLotteryDetail, effectiveReferenceDate, referenceMode, selectedContest]);

  const temporalDiagnostic = useMemo(() => {
    const versions = selectedLotteryDetail?.ruleVersions ?? [];
    const verifiedCount = versions.filter((r) => r.isVerified).length;
    const futureCount = versions.filter(
      (r) => classifyRuleTemporalStatus(r, effectiveReferenceDate) === 'future'
    ).length;
    const expiredCount = versions.filter(
      (r) => classifyRuleTemporalStatus(r, effectiveReferenceDate) === 'expired'
    ).length;
    return { total: versions.length, verifiedCount, futureCount, expiredCount };
  }, [selectedLotteryDetail, effectiveReferenceDate]);

  // Carregamento automático dos controles ao trocar modalidade ou regra vigente
  useEffect(() => {
    if (mode !== 'modality' || !activeVerifiedRule) {
      setSpecializedAnalysis(null);
      setSpecializedFetch({ status: 'idle' });
      return;
    }
    const n =
      (activeVerifiedRule.numberUniverseMax ?? 1) -
      (activeVerifiedRule.numberUniverseMin ?? 1) +
      1;
    const k = activeVerifiedRule.drawnNumbersCount ?? 1;
    const minM = activeVerifiedRule.minNumbersToChoose ?? 1;
    const maxM = activeVerifiedRule.maxNumbersToChoose ?? minM;
    setUniverseSize(n);
    setDrawnCount(k);
    setChosenCount((prev) => (prev >= minM && prev <= maxM ? prev : minM));
    setCompareConfigA(minM);
    setCompareConfigB(Math.min(minM + 1, maxM));
    const nextEq =
      minM + 1 <= maxM && minM + 1 >= k ? Number(exactCombinationsBigInt(minM + 1, k)) : 1;
    setSimpleGamesCount(Math.min(nextEq, 1000));
    setSimpleBetsText('');
    setAppliedSimpleBets(null);
    setSimpleBetsInputError(null);
    setExpandedHits({});
    setExpandedTierAtLeastOne({});
    setExpandedAggregate('none');
    setExpandedUnionMemory('none');
    setPythonState({ status: 'idle' });
  }, [mode, activeVerifiedRule]);

  const ruleUniverseSize =
    mode === 'modality' && activeVerifiedRule
      ? (activeVerifiedRule.numberUniverseMax ?? 1) -
        (activeVerifiedRule.numberUniverseMin ?? 1) +
        1
      : universeSize;
  const ruleDrawnCount =
    mode === 'modality' && activeVerifiedRule
      ? activeVerifiedRule.drawnNumbersCount ?? drawnCount
      : drawnCount;

  const minChosenLimit =
    mode === 'modality' && activeVerifiedRule?.minNumbersToChoose != null
      ? activeVerifiedRule.minNumbersToChoose
      : 2;
  const maxChosenLimit =
    mode === 'modality' && activeVerifiedRule?.maxNumbersToChoose != null
      ? Math.min(activeVerifiedRule.maxNumbersToChoose, ruleUniverseSize)
      : Math.min(20, ruleUniverseSize);

  const safeDrawn = Math.min(Math.max(1, ruleDrawnCount), ruleUniverseSize);
  const safeChosen = Math.min(Math.max(minChosenLimit, chosenCount), maxChosenLimit);
  const modalityAwaitingRules = mode === 'modality' && !activeVerifiedRule;

  // Integração oficial da Etapa 2: busca cálculo especializado exclusivamente em POST /api/math/python/specialized
  // NUNCA realiza fallback silencioso para cálculo local em TypeScript.
  useEffect(() => {
    if (mode !== 'modality' || !activeVerifiedRule || !selectedLotteryDetail) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    const fetchSpecializedFromPython = async () => {
      setSpecializedFetch({ status: 'loading' });
      setSpecializedAnalysis(null);

      try {
        const requestBody = {
          mode: 'modality' as const,
          lotteryId: selectedLotteryDetail.id,
          lotteryCode: selectedLotteryDetail.code,
          ruleVersionId: activeVerifiedRule.id,
          ...(referenceMode === 'contest' && selectedContest
            ? {
                contestId: selectedContest.id,
                contestNumber: selectedContest.contestNumber,
              }
            : {}),
          referenceDate: effectiveReferenceDate.toISOString(),
          universeSize: ruleUniverseSize,
          drawnCount: safeDrawn,
          chosenCount: safeChosen,
          simpleGamesCount: appliedSimpleBets ? appliedSimpleBets.length : simpleGamesCount,
          ...(appliedSimpleBets ? { simpleBets: appliedSimpleBets } : {}),
        };

        const response = await fetch('/api/math/python/specialized', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!active) return;

        if (!response.ok || !payload) {
          const errCode =
            payload && typeof payload.error === 'string'
              ? payload.error
              : `HTTP_${response.status}`;
          const errMsg =
            payload && typeof payload.message === 'string'
              ? payload.message
              : `Falha ao consultar o motor matemático Python (HTTP ${response.status}).`;
          setSpecializedFetch({
            status: 'error',
            errorCode: errCode,
            errorMessage: errMsg,
          });
          setSpecializedAnalysis(null);
          return;
        }

        const mapped = mapPythonSpecializedToAnalysis(payload);
        setSpecializedAnalysis(mapped);
        setSpecializedFetch({
          status: 'success',
          executionSource: payload.execution_source,
          distributionSum: payload.distribution_sum,
        });
      } catch (err) {
        if (!active || (err instanceof Error && err.name === 'AbortError')) return;
        setSpecializedFetch({
          status: 'error',
          errorCode: 'NETWORK_ERROR',
          errorMessage:
            err instanceof Error
              ? err.message
              : 'Falha de rede ao consultar o motor matemático Python.',
        });
        setSpecializedAnalysis(null);
      }
    };

    void fetchSpecializedFromPython();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    mode,
    selectedLotteryDetail,
    activeVerifiedRule,
    referenceMode,
    selectedContest,
    effectiveReferenceDate,
    ruleUniverseSize,
    safeDrawn,
    safeChosen,
    simpleGamesCount,
    appliedSimpleBets,
    specializedRefreshNonce,
  ]);

  // Cálculos locais exclusivos para o modo Parâmetros Livres
  const freeTotalCombinations = useMemo(
    () => (mode === 'free' ? exactCombinationsBigInt(universeSize, safeChosen) : 0n),
    [mode, universeSize, safeChosen]
  );

  const freeDistribution = useMemo(
    () => (mode === 'free' ? buildHypergeometricDistribution(universeSize, safeDrawn, safeChosen) : []),
    [mode, universeSize, safeDrawn, safeChosen]
  );

  const freeChosenComparisonRows = useMemo(() => {
    if (mode !== 'free') return [];
    const quantities: number[] = [];
    const upperBound = maxChosenLimit;
    const start = minChosenLimit;
    if (upperBound - start <= 5) {
      for (let m = start; m <= upperBound; m++) {
        quantities.push(m);
      }
    } else {
      const candidateSet = new Set<number>([
        start,
        safeChosen,
        Math.min(safeChosen + 1, upperBound),
        Math.min(safeChosen + 2, upperBound),
        Math.min(safeChosen + 3, upperBound),
      ]);
      for (const q of Array.from(candidateSet).sort((a, b) => a - b)) {
        quantities.push(q);
      }
    }

    const baseM = quantities[0] ?? safeChosen;
    const baseTopHits = Math.min(safeDrawn, baseM);
    const baseTopDetail = hypergeometricDetail(universeSize, safeDrawn, baseM, baseTopHits);

    return quantities.map((m) => {
      const topHits = Math.min(safeDrawn, m);
      const secondaryHits = Math.max(0, topHits - 1);
      const topDetail = hypergeometricDetail(universeSize, safeDrawn, m, topHits);
      const secondaryDetail = hypergeometricDetail(universeSize, safeDrawn, m, secondaryHits);
      const comb = exactCombinationsBigInt(universeSize, m);
      const relativeFactor =
        baseTopDetail.probability > 0 && topHits === baseTopHits
          ? topDetail.probability / baseTopDetail.probability
          : null;

      return {
        chosen: m,
        isSelected: m === safeChosen,
        totalCombinations: comb,
        topHits,
        topDetail,
        secondaryHits,
        secondaryDetail,
        relativeFactor,
      };
    });
  }, [mode, universeSize, safeDrawn, safeChosen, minChosenLimit, maxChosenLimit]);

  const compareRowA = useMemo(
    () =>
      specializedAnalysis?.comparisonRows.find((r) => r.chosenCount === compareConfigA) ??
      specializedAnalysis?.comparisonRows[0] ??
      null,
    [specializedAnalysis, compareConfigA]
  );
  const compareRowB = useMemo(
    () =>
      specializedAnalysis?.comparisonRows.find((r) => r.chosenCount === compareConfigB) ??
      specializedAnalysis?.comparisonRows[
        Math.min(1, (specializedAnalysis?.comparisonRows.length ?? 1) - 1)
      ] ??
      null,
    [specializedAnalysis, compareConfigB]
  );

  const toggleExpandedHit = (hits: number) => {
    setExpandedHits((prev) => ({ ...prev, [hits]: !prev[hits] }));
  };

  const toggleTierAtLeastOne = (hits: number) => {
    setExpandedTierAtLeastOne((prev) => ({ ...prev, [hits]: !prev[hits] }));
  };

  const handleApplySimpleBets = () => {
    const parsed = parseExplicitSimpleBetsText(simpleBetsText, ruleUniverseSize, safeDrawn);
    if (parsed.error) {
      setSimpleBetsInputError(parsed.error);
      return;
    }
    setSimpleBetsInputError(null);
    setSimpleGamesCount(parsed.bets.length);
    setAppliedSimpleBets(parsed.bets);
    setExpandedUnionMemory('none');
  };

  const handleClearSimpleBets = () => {
    setSimpleBetsText('');
    setAppliedSimpleBets(null);
    setSimpleBetsInputError(null);
    setExpandedUnionMemory('none');
  };

  const applyExampleBets = (kind: 'disjoint' | 'high_overlap') => {
    if (kind === 'disjoint' && ruleUniverseSize >= 2 * safeDrawn) {
      const b1 = Array.from({ length: safeDrawn }, (_, i) => i + 1);
      const b2 = Array.from({ length: safeDrawn }, (_, i) => safeDrawn + i + 1);
      setSimpleBetsText(formatBetsLines([b1, b2]));
      setSimpleBetsInputError(null);
      setSimpleGamesCount(2);
      setAppliedSimpleBets([b1, b2]);
      return;
    }
    // Alta sobreposição: compartilham (k - 1) dezenas
    const b1 = Array.from({ length: safeDrawn }, (_, i) => i + 1);
    const b2 = [
      ...Array.from({ length: safeDrawn - 1 }, (_, i) => i + 1),
      Math.min(ruleUniverseSize, safeDrawn + 1),
    ];
    setSimpleBetsText(formatBetsLines([b1, b2]));
    setSimpleBetsInputError(null);
    setSimpleGamesCount(2);
    setAppliedSimpleBets([b1, b2]);
  };

  const handleTestPythonEngine = async (endpoint: 'theoretical' | 'specialized' = 'theoretical') => {
    if (modalityAwaitingRules) return;
    if (endpoint === 'specialized') {
      setSpecializedRefreshNonce((n) => n + 1);
      return;
    }
    setPythonState({ status: 'loading', endpointUsed: endpoint });
    try {
      const requestBody =
        mode === 'modality' && selectedLotteryDetail && activeVerifiedRule
          ? {
              mode: 'modality' as const,
              lotteryId: selectedLotteryDetail.id,
              lotteryCode: selectedLotteryDetail.code,
              ruleVersionId: activeVerifiedRule.id,
              ...(referenceMode === 'contest' && selectedContest
                ? {
                    contestId: selectedContest.id,
                    contestNumber: selectedContest.contestNumber,
                  }
                : {}),
              referenceDate: effectiveReferenceDate.toISOString(),
              universeSize: ruleUniverseSize,
              drawnCount: safeDrawn,
              chosenCount: safeChosen,
            }
          : {
              mode: 'free' as const,
              lotteryCode: 'generic-reference',
              universeSize,
              drawnCount: safeDrawn,
              chosenCount: safeChosen,
            };

      const response = await fetch('/api/math/python/theoretical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        setPythonState({
          status: 'error',
          endpointUsed: endpoint,
          message: `${payload.error ?? 'ERROR'}: ${payload.message ?? 'Motor Python indisponível.'}`,
        });
        return;
      }
      setPythonState({
        status: 'success',
        endpointUsed: endpoint,
        totalCombinations: payload.total_combinations,
        executionSource: payload.execution_source,
        distributionSum: payload.distribution_sum,
        referenceDate:
          payload.modalityContext?.referenceDate ?? effectiveReferenceDate.toISOString(),
      });
    } catch (err) {
      setPythonState({
        status: 'error',
        endpointUsed: endpoint,
        message: err instanceof Error ? err.message : 'Falha de rede ao consultar motor Python.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="text-[#E5C158] font-medium">Etapa 2 · Motor Especializado</span>
            <span aria-hidden="true">·</span>
            <span>Combinatória Racional Exata (Python FastAPI + PostgreSQL)</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold text-[#F1F2F4]">
            Laboratório Matemático
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            Calculadora especializada por modalidade (Mega-Sena e Lotofácil) executada via motor
            Python (`/api/math/python/specialized`) e explorador combinatório livre. Sem fallback
            local silencioso em falhas do motor científico.
          </p>
        </div>

        {/* Alternador entre modo livre e modalidade */}
        <div
          className="inline-flex rounded-lg border border-white/10 bg-[#12141A] p-1"
          role="tablist"
          aria-label="Modo de parâmetros do laboratório"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'free'}
            onClick={() => {
              setMode('free');
              setPythonState({ status: 'idle' });
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'free'
                ? 'bg-[#181B22] text-[#E5C158] border border-[#D4AF37]/40'
                : 'text-neutral-400 hover:text-[#F1F2F4]'
            }`}
          >
            Parâmetros Livres
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'modality'}
            onClick={() => {
              setMode('modality');
              setPythonState({ status: 'idle' });
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'modality'
                ? 'bg-[#181B22] text-[#E5C158] border border-[#D4AF37]/40'
                : 'text-neutral-400 hover:text-[#F1F2F4]'
            }`}
          >
            Por Modalidade
          </button>
        </div>
      </div>

      {/* Painel de seleção de modalidade (quando mode === 'modality') */}
      {mode === 'modality' && (
        <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Seleção de Modalidade e Regras Verificadas
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Parâmetros N, k, limites de m, faixas de premiação e preços oficiais são validados
                no PostgreSQL e processados exclusivamente no motor Python.
              </p>
            </div>
            {selectedLotteryDetail && (
              <span className="font-mono-tabular text-xs text-neutral-400">
                ID #{selectedLotteryDetail.id} · Código: {selectedLotteryDetail.code} · Status:{' '}
                <span className="text-[#E5C158]">
                  {activeVerifiedRule
                    ? `Regra verificada ativa (ID #${activeVerifiedRule.id})`
                    : 'Aguardando configuração'}
                </span>
              </span>
            )}
          </div>

          {lotteriesLoading ? (
            <p className="text-xs text-neutral-400">Carregando catálogo de modalidades...</p>
          ) : lotteriesError ? (
            <p className="text-xs text-amber-300">{lotteriesError}</p>
          ) : lotteries.length === 0 ? (
            <p className="text-xs text-neutral-400">
              Nenhuma modalidade encontrada no catálogo. Utilize o modo Parâmetros Livres.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
                <label className="block md:col-span-5">
                  <span className="block text-xs text-neutral-300 mb-1.5">Modalidade</span>
                  <select
                    aria-label="Selecionar modalidade"
                    value={selectedLotteryId ?? ''}
                    onChange={(e) => setSelectedLotteryId(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2.5 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    {lotteries.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.name} (
                        {lot.status === 'awaiting_rules' ? 'aguardando configuração' : lot.status})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block md:col-span-4">
                  <span className="block text-xs text-neutral-300 mb-1.5">
                    Referência Temporal da Regra
                  </span>
                  <select
                    aria-label="Referência temporal da regra"
                    value={referenceMode}
                    onChange={(e) => setReferenceMode(e.target.value as ReferenceMode)}
                    className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2.5 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="current">Vigência Atual</option>
                    <option value="date">Data Histórica de Referência</option>
                    <option value="contest" disabled={contests.length === 0}>
                      Concurso Histórico ({contests.length})
                    </option>
                  </select>
                </label>

                {referenceMode === 'date' && (
                  <label className="block md:col-span-3">
                    <span className="block text-xs text-neutral-300 mb-1.5">
                      Data de Referência
                    </span>
                    <input
                      type="date"
                      aria-label="Data de referência da regra"
                      value={customReferenceDate}
                      onChange={(e) => setCustomReferenceDate(e.target.value)}
                      className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    />
                  </label>
                )}

                {referenceMode === 'contest' && contests.length > 0 && (
                  <label className="block md:col-span-3">
                    <span className="block text-xs text-neutral-300 mb-1.5">Concurso</span>
                    <select
                      aria-label="Selecionar concurso histórico"
                      value={selectedContestId ?? ''}
                      onChange={(e) => setSelectedContestId(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2.5 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    >
                      {contests.map((c) => (
                        <option key={c.id} value={c.id}>
                          Concurso {c.contestNumber}
                          {c.drawDate ? ` (${c.drawDate.slice(0, 10)})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div>
                {detailLoading ? (
                  <p className="text-xs text-neutral-400">Verificando versões de regras...</p>
                ) : activeVerifiedRule ? (
                  <div className="rounded-lg border border-[#D4AF37]/30 bg-[#0A0B0E] px-4 py-3 text-xs text-neutral-300 space-y-1.5">
                    <div>
                      <span className="font-medium text-[#E5C158]">
                        Regra v{activeVerifiedRule.versionNumber} (ID #{activeVerifiedRule.id}) carregada automaticamente:
                      </span>{' '}
                      Universo [{activeVerifiedRule.numberUniverseMin}..
                      {activeVerifiedRule.numberUniverseMax}] (N={ruleUniverseSize}) · Sorteio k=
                      {activeVerifiedRule.drawnNumbersCount} · Escolha m ∈ [
                      {activeVerifiedRule.minNumbersToChoose}..
                      {activeVerifiedRule.maxNumbersToChoose}] · Fonte:{' '}
                      {activeVerifiedRule.officialSource}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono-tabular text-[11px] text-neutral-400">
                      <span>
                        Vigência: {activeVerifiedRule.validFrom.slice(0, 10)} até{' '}
                        {activeVerifiedRule.validTo
                          ? activeVerifiedRule.validTo.slice(0, 10)
                          : 'vigência aberta'}
                      </span>
                      <span>
                        Data de referência: {effectiveReferenceDate.toISOString().slice(0, 10)}
                      </span>
                      {activeVerifiedRule.simpleBetPriceCents != null && (
                        <span className="text-[#E5C158]">
                          Aposta simples oficial:{' '}
                          {formatBrlFromCentsStr(activeVerifiedRule.simpleBetPriceCents)}
                          {activeVerifiedRule.priceUpdatedAt
                            ? ` (atualizado em ${activeVerifiedRule.priceUpdatedAt.slice(0, 10)})`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : temporalDiagnostic.verifiedCount > 0 ? (
                  <div className="rounded-lg border border-amber-400/25 bg-[#0A0B0E] px-4 py-3 text-xs leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-300">
                      Nenhuma regra verificada vigente na data de referência (
                      {effectiveReferenceDate.toISOString().slice(0, 10)}):
                    </span>{' '}
                    regras com vigência futura ({temporalDiagnostic.futureCount}) ou expirada (
                    {temporalDiagnostic.expiredCount}) não são aplicadas. Selecione uma
                    data/concurso dentro da vigência oficial ou use Parâmetros Livres.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-400/25 bg-[#0A0B0E] px-4 py-3 text-xs leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-300">
                      Modalidade aguardando configuração oficial:
                    </span>{' '}
                    nenhuma regra verificada foi ingerida para{' '}
                    <span className="font-medium text-[#F1F2F4]">
                      {selectedLotteryDetail?.name ?? 'esta modalidade'}
                    </span>
                    . Regras e preços não são inventados pelo sistema; selecione Mega-Sena,
                    Lotofácil ou alterne para Parâmetros Livres.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Estados explícitos de carregamento, erro ou indisponibilidade do motor Python no modo modalidade */}
      {mode === 'modality' && activeVerifiedRule && specializedFetch.status === 'loading' && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[#8B5CF6]/30 bg-[#12141A] p-5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="text-xs text-neutral-300">
            <span className="font-semibold text-[#C4B5FD]">
              Consultando Motor Matemático Python (`/api/math/python/specialized`)...
            </span>{' '}
            Validando regras no PostgreSQL e calculando frações racionais exatas para {safeChosen}{' '}
            dezenas.
          </div>
        </section>
      )}

      {mode === 'modality' && activeVerifiedRule && specializedFetch.status === 'error' && (
        <section
          role="alert"
          className="rounded-xl border border-amber-400/35 bg-[#12141A] p-6 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-display text-sm font-semibold text-amber-300">
                Motor Matemático Especializado Indisponível ({specializedFetch.errorCode})
              </h2>
              <p className="text-xs leading-relaxed text-amber-100/90">
                {specializedFetch.errorMessage}
              </p>
              <p className="text-[11px] text-neutral-400">
                Nenhum cálculo foi simulado ou substituído localmente no navegador: resultados
                especializados por modalidade dependem integralmente da validação PostgreSQL +
                resposta auditada do microsserviço Python FastAPI.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSpecializedRefreshNonce((n) => n + 1)}
              className="rounded-lg border border-amber-400/40 bg-[#0A0B0E] px-3.5 py-2 text-xs font-medium text-amber-300 hover:border-amber-300 cursor-pointer whitespace-nowrap"
            >
              Consultar Motor Python Novamente
            </button>
          </div>
        </section>
      )}

      {/* Sub-navegação especializada quando modalidade verificada está ativa e respondida pelo Python */}
      {mode === 'modality' && activeVerifiedRule && specializedAnalysis && (
        <div className="space-y-6">
          {/* 4 KPIs principais da aposta selecionada */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <p className="text-xs text-neutral-400">
                Combinações C({ruleUniverseSize}, {safeChosen})
              </p>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                {formatBigIntPtBr(specializedAnalysis.totalChosenCombinations)}
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                Espaço simples C({ruleUniverseSize},{safeDrawn}):{' '}
                {formatBigIntPtBr(specializedAnalysis.totalSpaceSimpleCombinations)}
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <p className="text-xs text-neutral-400">Aposta com {safeChosen} Dezenas</p>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                {formatBrlFromCentsStr(specializedAnalysis.multipleBet.totalCostCents)}
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                {formatBigIntPtBr(specializedAnalysis.multipleBet.equivalentSimpleBets)} jogo(s)
                simples equivalente(s)
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">Probabilidade de Premiação</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAggregate((prev) => (prev === 'any' ? 'none' : 'any'))
                  }
                  className="text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                >
                  {expandedAggregate === 'any' ? 'Ocultar memória' : 'Memória'}
                </button>
              </div>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}%
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                {formatOddsDisplay(
                  specializedAnalysis.anyPrize.probability,
                  specializedAnalysis.anyPrize.oddsOneIn
                )}
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">Prob. de Não Premiar</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAggregate((prev) => (prev === 'no' ? 'none' : 'no'))
                  }
                  className="text-[11px] text-[#C4B5FD] hover:underline cursor-pointer"
                >
                  {expandedAggregate === 'no' ? 'Ocultar memória' : 'Memória'}
                </button>
              </div>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                {(specializedAnalysis.noPrize.probability * 100).toPrecision(6)}%
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                Fração: {specializedAnalysis.noPrize.exactNumerator} /{' '}
                {specializedAnalysis.noPrize.exactDenominator}
              </p>
            </div>
          </section>

          {expandedAggregate !== 'none' && (
            <section className="rounded-xl border border-[#D4AF37]/30 bg-[#0A0B0E] p-5">
              <MemoryPanel
                memory={
                  expandedAggregate === 'any'
                    ? specializedAnalysis.anyPrize.memory
                    : specializedAnalysis.noPrize.memory
                }
              />
            </section>
          )}

          {/* Abas da calculadora especializada */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg border border-white/8 bg-[#12141A] p-1 w-fit"
              role="tablist"
              aria-label="Ferramentas especializadas da modalidade"
            >
              <button
                type="button"
                role="tab"
                aria-selected={specializedTab === 'probabilities'}
                onClick={() => setSpecializedTab('probabilities')}
                className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  specializedTab === 'probabilities'
                    ? 'bg-[#D4AF37] text-[#0A0B0E]'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                Probabilidades & Faixas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={specializedTab === 'simple_vs_multiple'}
                onClick={() => setSpecializedTab('simple_vs_multiple')}
                className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  specializedTab === 'simple_vs_multiple'
                    ? 'bg-[#D4AF37] text-[#0A0B0E]'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                Apostas Simples vs. Múltiplas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={specializedTab === 'comparator'}
                onClick={() => setSpecializedTab('comparator')}
                className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  specializedTab === 'comparator'
                    ? 'bg-[#D4AF37] text-[#0A0B0E]'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                Comparador Matemático
              </button>
            </div>

            <span className="font-mono-tabular text-[11px] text-neutral-400">
              Fonte: {specializedFetch.executionSource ?? 'python_fastapi_engine'} · ΣP ={' '}
              {specializedFetch.distributionSum?.toFixed(12) ?? '1.000000000000'}
            </span>
          </div>
        </div>
      )}

      {/* Conteúdo da aba Apostas Simples vs Múltiplas */}
      {mode === 'modality' &&
        activeVerifiedRule &&
        specializedAnalysis &&
        specializedTab === 'simple_vs_multiple' && (
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                  Calculadora de Apostas Simples vs. Múltiplas ({selectedLotteryDetail?.name})
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  Compara um volante múltiplo com{' '}
                  <span className="font-mono-tabular text-[#E5C158]">{safeChosen} dezenas</span>{' '}
                  contra {specializedAnalysis.simpleGamesComparison.simpleGamesCount} jogo(s)
                  simples de {safeDrawn} dezenas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-neutral-300 flex items-center gap-2">
                  <span>Qtd. jogos simples:</span>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    disabled={appliedSimpleBets !== null}
                    aria-label="Quantidade de jogos simples"
                    value={simpleGamesCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val >= 1) {
                        setSimpleGamesCount(Math.min(1000000, Math.floor(val)));
                      }
                    }}
                    className="w-24 rounded-lg border border-white/12 bg-[#0A0B0E] px-2.5 py-1.5 font-mono-tabular text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none disabled:opacity-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedSimpleBets(null);
                    setSimpleGamesCount(
                      Math.min(
                        1000000,
                        Number(specializedAnalysis.multipleBet.equivalentSimpleBets) || 1
                      )
                    );
                  }}
                  className="rounded-lg border border-[#D4AF37]/40 bg-[#181B22] px-3 py-1.5 text-xs text-[#E5C158] hover:border-[#D4AF37] cursor-pointer whitespace-nowrap"
                >
                  Igualar custo ({formatBigIntPtBr(specializedAnalysis.multipleBet.equivalentSimpleBets)})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Métrica Combinatória</th>
                    <th className="py-2.5 px-4 font-medium text-[#E5C158]">
                      1 Aposta de {safeChosen} Dezenas
                    </th>
                    <th className="py-2.5 pl-4 font-medium text-[#C4B5FD]">
                      {specializedAnalysis.simpleGamesComparison.simpleGamesCount.toLocaleString(
                        'pt-BR'
                      )}{' '}
                      Jogo(s) Simples Distinto(s)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">Combinações simples adquiridas</td>
                    <td className="py-3 px-4 font-mono-tabular text-[#F1F2F4]">
                      {formatBigIntPtBr(specializedAnalysis.multipleBet.equivalentSimpleBets)}
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-[#F1F2F4]">
                      {specializedAnalysis.simpleGamesComparison.simpleGamesCount.toLocaleString(
                        'pt-BR'
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">Custo total oficial</td>
                    <td className="py-3 px-4 font-mono-tabular text-[#E5C158]">
                      {formatBrlFromCentsStr(specializedAnalysis.multipleBet.totalCostCents)}
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-[#C4B5FD]">
                      {formatBrlFromCentsStr(
                        specializedAnalysis.simpleGamesComparison.totalCostCents
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      Cobertura exata da faixa principal ({safeDrawn} acertos)
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-neutral-200">
                      {(
                        specializedAnalysis.multipleBet.combinatorialCoverage.probability * 100
                      ).toPrecision(6)}
                      % ({specializedAnalysis.multipleBet.combinatorialCoverage.simplifiedNumerator}{' '}
                      /{' '}
                      {formatBigIntPtBr(
                        specializedAnalysis.multipleBet.combinatorialCoverage.simplifiedDenominator
                      )}
                      )
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-neutral-200">
                      {(
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.probability * 100
                      ).toPrecision(6)}
                      % ({specializedAnalysis.simpleGamesComparison.topPrizeExact.simplifiedNumerator}{' '}
                      /{' '}
                      {formatBigIntPtBr(
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.simplifiedDenominator
                      )}
                      )
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      Razão 1 em N na faixa principal ({safeDrawn} acertos)
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-[#E5C158]">
                      {formatOddsDisplay(
                        specializedAnalysis.multipleBet.combinatorialCoverage.probability,
                        specializedAnalysis.multipleBet.combinatorialCoverage.oddsOneIn
                      )}
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-[#C4B5FD]">
                      {formatOddsDisplay(
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.probability,
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.oddsOneIn
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      Valor esperado de bilhetes premiados por sorteio
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-neutral-200">
                      Volante: {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}% (≥
                      1 faixa)
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-neutral-200">
                      E[total] ={' '}
                      {specializedAnalysis.simpleGamesComparison.expectedWinningGamesPerDraw.toFixed(
                        4
                      )}{' '}
                      · E[secund.] ={' '}
                      {specializedAnalysis.simpleGamesComparison.expectedSecondaryWinningGamesPerDraw.toFixed(
                        4
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      P(≥ 1 prêmio secundário) / P(≥ 1 prêmio qualquer)
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-[#E5C158]">
                      Exata no volante: {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}%
                    </td>
                    <td className="py-3 pl-4 text-neutral-200">
                      {specializedAnalysis.simpleGamesComparison.exactUnionAnalysis ? (
                        <div className="space-y-1 font-mono-tabular">
                          <div className="text-[#C4B5FD]">
                            União exata (qualquer):{' '}
                            {(
                              specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                                .anyPrizeUnion.probability * 100
                            ).toPrecision(5)}
                            % (
                            {formatOddsDisplay(
                              specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                                .anyPrizeUnion.probability,
                              specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                                .anyPrizeUnion.oddsOneIn
                            )}
                            )
                          </div>
                          <div className="text-neutral-300">
                            União exata (secundário):{' '}
                            {(
                              specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                                .secondaryPrizeUnion.probability * 100
                            ).toPrecision(5)}
                            % (
                            {formatOddsDisplay(
                              specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                                .secondaryPrizeUnion.probability,
                              specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                                .secondaryPrizeUnion.oddsOneIn
                            )}
                            )
                          </div>
                        </div>
                      ) : (
                        <span className="text-amber-300">
                          Depende da sobreposição (informe as combinações abaixo)
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Painel explícito de combinações para união exata sem falsa independência */}
            <div className="rounded-lg border border-white/10 bg-[#0A0B0E] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-[#C4B5FD]">
                    União Exata para Combinações Explícitas (Sem Suposição Falsa de Independência)
                  </h3>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    {specializedAnalysis.simpleGamesComparison.overlapDependencyNotice}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ruleUniverseSize >= 2 * safeDrawn && (
                    <button
                      type="button"
                      onClick={() => applyExampleBets('disjoint')}
                      className="rounded border border-white/15 bg-[#181B22] px-2.5 py-1 text-[11px] text-neutral-200 hover:border-[#D4AF37]/50 cursor-pointer"
                    >
                      Exemplo 2 jogos disjuntos
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => applyExampleBets('high_overlap')}
                    className="rounded border border-white/15 bg-[#181B22] px-2.5 py-1 text-[11px] text-neutral-200 hover:border-[#8B5CF6]/60 cursor-pointer"
                  >
                    Exemplo 2 jogos alta sobreposição
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-start">
                <div className="md:col-span-7 space-y-2">
                  <textarea
                    rows={3}
                    aria-label="Combinações simples explícitas"
                    placeholder={`Informe de 1 a 12 combinações de ${safeDrawn} dezenas (1 por linha, ex: 01 02 03 ...)`}
                    value={simpleBetsText}
                    onChange={(e) => setSimpleBetsText(e.target.value)}
                    className="w-full rounded-lg border border-white/12 bg-[#12141A] p-2.5 font-mono-tabular text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  />
                  {simpleBetsInputError && (
                    <p className="text-xs text-amber-300">{simpleBetsInputError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleApplySimpleBets}
                      className="rounded-lg border border-[#D4AF37]/50 bg-[#181B22] px-3 py-1.5 text-xs font-medium text-[#E5C158] hover:border-[#D4AF37] cursor-pointer"
                    >
                      Calcular União Exata (Python)
                    </button>
                    {appliedSimpleBets && (
                      <button
                        type="button"
                        onClick={handleClearSimpleBets}
                        className="rounded-lg border border-white/15 bg-[#12141A] px-3 py-1.5 text-xs text-neutral-300 hover:text-white cursor-pointer"
                      >
                        Limpar Combinações
                      </button>
                    )}
                  </div>
                </div>

                {specializedAnalysis.simpleGamesComparison.exactUnionAnalysis && (
                  <div className="md:col-span-5 rounded-lg border border-[#8B5CF6]/30 bg-[#12141A] p-3.5 text-xs space-y-2">
                    <p className="font-medium text-[#C4B5FD]">
                      Estrutura de Sobreposição ({specializedAnalysis.simpleGamesComparison.exactUnionAnalysis.gamesCount} jogos)
                    </p>
                    <p className="font-mono-tabular text-[11px] text-neutral-300">
                      Pares:{' '}
                      {
                        specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                          .pairwiseOverlapSummary.pairCount
                      }{' '}
                      · Sobreposição:{' '}
                      {
                        specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                          .pairwiseOverlapSummary.minOverlap
                      }
                      ..
                      {
                        specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                          .pairwiseOverlapSummary.maxOverlap
                      }{' '}
                      (média{' '}
                      {specializedAnalysis.simpleGamesComparison.exactUnionAnalysis.pairwiseOverlapSummary.avgOverlap.toFixed(
                        2
                      )}
                      ) · Disjuntos:{' '}
                      {
                        specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                          .pairwiseOverlapSummary.disjointPairsCount
                      }
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedUnionMemory((prev) => (prev === 'any' ? 'none' : 'any'))
                        }
                        className="text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                      >
                        {expandedUnionMemory === 'any'
                          ? 'Ocultar memória (União Qualquer)'
                          : 'Memória (União Qualquer)'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedUnionMemory((prev) =>
                            prev === 'secondary' ? 'none' : 'secondary'
                          )
                        }
                        className="text-[11px] text-[#C4B5FD] hover:underline cursor-pointer"
                      >
                        {expandedUnionMemory === 'secondary'
                          ? 'Ocultar memória (União Secundária)'
                          : 'Memória (União Secundária)'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {expandedUnionMemory !== 'none' &&
                specializedAnalysis.simpleGamesComparison.exactUnionAnalysis && (
                  <div className="rounded-lg border border-[#D4AF37]/25 bg-[#12141A] p-4">
                    <MemoryPanel
                      memory={
                        expandedUnionMemory === 'any'
                          ? specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                              .anyPrizeUnion.memory
                          : specializedAnalysis.simpleGamesComparison.exactUnionAnalysis
                              .secondaryPrizeUnion.memory
                      }
                    />
                  </div>
                )}
            </div>

            {/* Clareza A / B / C para Apostas Múltiplas */}
            <div className="border-t border-white/8 pt-4 space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-[#E5C158]">
                  Aposta Múltipla ({safeChosen} dezenas): Separação A · B · C
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  Distingue explicitamente <strong className="text-neutral-200">A)</strong> a
                  probabilidade de o volante acertar exatamente h dezenas sorteadas,{' '}
                  <strong className="text-neutral-200">B)</strong> quantas apostas simples embutidas
                  são premiadas (Vandermonde) + média esperada, e{' '}
                  <strong className="text-neutral-200">C)</strong> a probabilidade exata de obter ao
                  menos uma aposta simples premiada em cada faixa t.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                {specializedAnalysis.prizeTiers.map((tier) => (
                  <div
                    key={tier.hits}
                    className="rounded-lg border border-white/8 bg-[#0A0B0E] p-3.5 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F1F2F4]">
                        {tier.tierName} (t = {tier.hits})
                      </span>
                      {tier.atLeastOneWin && (
                        <button
                          type="button"
                          onClick={() => toggleTierAtLeastOne(tier.hits)}
                          className="text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                        >
                          {expandedTierAtLeastOne[tier.hits]
                            ? 'Ocultar memória C'
                            : 'Memória P(≥ 1)'}
                        </button>
                      )}
                    </div>

                    <p className="font-mono-tabular text-[11px] text-neutral-300">
                      <span className="text-neutral-500">A. P(H_volante = {tier.hits}):</span>{' '}
                      {(tier.probability * 100).toPrecision(5)}% (
                      {formatOddsDisplay(tier.probability, tier.oddsOneIn)})
                    </p>

                    <p className="font-mono-tabular text-[11px] text-[#E5C158]">
                      <span className="text-neutral-500">B. Embutidas se h={tier.hits}:</span>{' '}
                      {tier.embeddedSimpleWins
                        .map(
                          (w) =>
                            `${formatBigIntPtBr(w.winningSimpleCombinations)}× ${w.tierName}`
                        )
                        .join(' + ')}
                      {tier.expectedEmbeddedWinsPerDraw !== undefined
                        ? ` · E[prêmios] = ${tier.expectedEmbeddedWinsPerDraw.toPrecision(4)}`
                        : ''}
                    </p>

                    {tier.atLeastOneWin && (
                      <p className="font-mono-tabular text-[11px] text-[#C4B5FD]">
                        <span className="text-neutral-500">
                          C. P(≥ 1 na faixa {tier.tierName}):
                        </span>{' '}
                        {(tier.atLeastOneWin.probability * 100).toPrecision(5)}% (
                        {formatOddsDisplay(
                          tier.atLeastOneWin.probability,
                          tier.atLeastOneWin.oddsOneIn
                        )}
                        ) · h ∈ {`{${tier.atLeastOneWin.triggeringVolanteHits.join(', ')}}`}
                      </p>
                    )}

                    {tier.atLeastOneWin && expandedTierAtLeastOne[tier.hits] && (
                      <div className="pt-2 border-t border-white/8">
                        <MemoryPanel memory={tier.atLeastOneWin.memory} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-amber-400/20 bg-[#0A0B0E] px-4 py-3 text-[11px] text-neutral-400 space-y-1">
              <p className="text-amber-300/90 font-medium">
                Nota metodológica sobre independência (apenas ilustrativa — NÃO exata):{' '}
                <span className="font-mono-tabular">
                  {(
                    specializedAnalysis.simpleGamesComparison
                      .illustrativeIndependentApproximation.value * 100
                  ).toPrecision(5)}
                  %
                </span>
              </p>
              <p>
                {
                  specializedAnalysis.simpleGamesComparison.illustrativeIndependentApproximation
                    .warning
                }
              </p>
              <p className="pt-1 text-neutral-400">
                Fonte oficial dos preços: {specializedAnalysis.multipleBet.priceSource ?? 'Caixa'} ·{' '}
                {specializedAnalysis.simpleGamesComparison.equiprobabilityNotice}
              </p>
            </div>
          </section>
        )}

      {/* Conteúdo da aba Comparador Matemático */}
      {mode === 'modality' &&
        activeVerifiedRule &&
        specializedAnalysis &&
        specializedTab === 'comparator' && (
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                  Comparador Matemático ({selectedLotteryDetail?.name})
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  Compare lado a lado duas quantidades de dezenas válidas nas regras oficiais.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-neutral-300 flex items-center gap-2">
                  <span>Configuração A:</span>
                  <select
                    aria-label="Configuração A de dezenas"
                    value={compareConfigA}
                    onChange={(e) => setCompareConfigA(Number(e.target.value))}
                    className="rounded-lg border border-white/12 bg-[#0A0B0E] px-2.5 py-1.5 text-xs text-[#E5C158]"
                  >
                    {specializedAnalysis.comparisonRows.map((r) => (
                      <option key={r.chosenCount} value={r.chosenCount}>
                        {r.chosenCount} dezenas
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-neutral-300 flex items-center gap-2">
                  <span>Configuração B:</span>
                  <select
                    aria-label="Configuração B de dezenas"
                    value={compareConfigB}
                    onChange={(e) => setCompareConfigB(Number(e.target.value))}
                    className="rounded-lg border border-white/12 bg-[#0A0B0E] px-2.5 py-1.5 text-xs text-[#C4B5FD]"
                  >
                    {specializedAnalysis.comparisonRows.map((r) => (
                      <option key={r.chosenCount} value={r.chosenCount}>
                        {r.chosenCount} dezenas
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {compareRowA && compareRowB && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { label: 'Configuração A', row: compareRowA, accent: 'text-[#E5C158]' },
                  { label: 'Configuração B', row: compareRowB, accent: 'text-[#C4B5FD]' },
                ].map(({ label, row, accent }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-white/10 bg-[#0A0B0E] p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${accent}`}>
                        {label}: {row.chosenCount} dezenas
                      </span>
                      <span className="font-mono-tabular text-neutral-400">
                        {row.coverageFactorVsMinimum} vs. mínima
                      </span>
                    </div>
                    <p className="font-mono-tabular text-neutral-300">
                      Jogos simples equivalentes:{' '}
                      <span className="text-[#F1F2F4]">
                        {formatBigIntPtBr(row.equivalentSimpleBets)}
                      </span>{' '}
                      · Custo:{' '}
                      <span className={accent}>{formatBrlFromCentsStr(row.totalCostCents)}</span>
                    </p>
                    <p className="font-mono-tabular text-neutral-300">
                      Faixa principal ({row.mainPrizeHits} acertos):{' '}
                      <span className="text-[#F1F2F4]">
                        {formatOddsDisplay(row.mainPrizeProbability, row.mainPrizeOddsOneIn)}
                      </span>{' '}
                      ({(row.mainPrizeProbability * 100).toPrecision(5)}%)
                    </p>
                    <p className="font-mono-tabular text-neutral-300">
                      Qualquer premiação:{' '}
                      <span className="text-[#F1F2F4]">
                        {formatOddsDisplay(row.anyPrizeProbability, row.anyPrizeOddsOneIn)}
                      </span>{' '}
                      ({(row.anyPrizeProbability * 100).toPrecision(5)}%)
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Dezenas (m)</th>
                    <th className="py-2 px-3 font-medium">Jogos Simples</th>
                    <th className="py-2 px-3 font-medium">Custo Oficial</th>
                    <th className="py-2 px-3 font-medium">Faixa Principal</th>
                    <th className="py-2 px-3 font-medium">Qualquer Prêmio</th>
                    <th className="py-2 pl-3 text-right font-medium">Ganho vs. Mín.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {specializedAnalysis.comparisonRows.map((row) => (
                    <tr
                      key={row.chosenCount}
                      onClick={() => setChosenCount(row.chosenCount)}
                      className={`cursor-pointer ${
                        row.isSelected ? 'bg-[#D4AF37]/[0.08]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-mono-tabular font-medium text-[#F1F2F4]">
                        {row.chosenCount} {row.isSelected ? '· selecionado' : ''}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                        {formatBigIntPtBr(row.equivalentSimpleBets)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                        {formatBrlFromCentsStr(row.totalCostCents)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-200 whitespace-nowrap">
                        {formatOddsDisplay(row.mainPrizeProbability, row.mainPrizeOddsOneIn)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300 whitespace-nowrap">
                        {(row.anyPrizeProbability * 100).toPrecision(5)}% (
                        {formatOddsDisplay(row.anyPrizeProbability, row.anyPrizeOddsOneIn)})
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono-tabular text-[#C4B5FD]">
                        {row.coverageFactorVsMinimum}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-white/8 bg-[#0A0B0E] px-4 py-3 text-xs text-neutral-300">
              <strong className="text-[#E5C158]">Princípio de Equiprobabilidade:</strong>{' '}
              {specializedAnalysis.equiprobabilityAxiom}
            </div>
          </section>
        )}

      {/* Faixas de Premiação Oficiais com separação explícita A, B, C (aba principal da modalidade) */}
      {mode === 'modality' &&
        activeVerifiedRule &&
        specializedAnalysis &&
        specializedTab === 'probabilities' && (
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                  Faixas Oficiais de Premiação — {selectedLotteryDetail?.name} ({safeChosen} dezenas)
                </h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Separa explicitamente <span className="text-neutral-200">A)</span> P(H_volante =
                  h), <span className="text-neutral-200">B)</span> apostas simples embutidas +
                  esperado/sorteio e <span className="text-neutral-200">C)</span> P(≥ 1 prêmio na
                  faixa t).
                </p>
              </div>
              <span className="font-mono-tabular text-xs text-[#E5C158]">
                Premiação total: {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Faixa Oficial</th>
                    <th className="py-2 px-3 font-medium">A. P(H_volante = h)</th>
                    <th className="py-2 px-3 font-medium">B. Embutidas (se H=h) · E[prêmios]</th>
                    <th className="py-2 px-3 font-medium">C. P(≥ 1 aposta na faixa)</th>
                    <th className="py-2 pl-3 text-right font-medium">Memória C</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {specializedAnalysis.prizeTiers.map((tier) => (
                    <React.Fragment key={tier.hits}>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-3 font-medium text-[#F1F2F4]">
                          {tier.tierName} ({tier.hits} acertos)
                          {tier.isMainPrize ? (
                            <span className="ml-2 text-[11px] text-[#E5C158]">· Principal</span>
                          ) : null}
                          <div className="font-mono-tabular text-[11px] font-normal text-neutral-400">
                            {tier.exactNumerator} / {formatBigIntPtBr(tier.exactDenominator)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158] whitespace-nowrap">
                          {(tier.probability * 100).toPrecision(6)}%
                          <div className="text-[11px] text-neutral-400">
                            {formatOddsDisplay(tier.probability, tier.oddsOneIn)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-neutral-200">
                          <div>
                            {tier.embeddedSimpleWins
                              .map(
                                (w) =>
                                  `${formatBigIntPtBr(w.winningSimpleCombinations)}× ${w.tierName}`
                              )
                              .join(' + ')}
                          </div>
                          {tier.expectedEmbeddedWinsPerDraw !== undefined && (
                            <div className="text-[11px] text-neutral-400">
                              E[ganhos] = {tier.expectedEmbeddedWinsPerDraw.toPrecision(4)}/sorteio
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-[#C4B5FD] whitespace-nowrap">
                          {tier.atLeastOneWin ? (
                            <>
                              <div>{(tier.atLeastOneWin.probability * 100).toPrecision(6)}%</div>
                              <div className="text-[11px] text-neutral-400">
                                {formatOddsDisplay(
                                  tier.atLeastOneWin.probability,
                                  tier.atLeastOneWin.oddsOneIn
                                )}{' '}
                                · h ∈ {`{${tier.atLeastOneWin.triggeringVolanteHits.join(', ')}}`}
                              </div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                          {tier.atLeastOneWin && (
                            <button
                              type="button"
                              aria-expanded={Boolean(expandedTierAtLeastOne[tier.hits])}
                              aria-label={`Memória P(≥ 1) para ${tier.tierName ?? tier.hits}`}
                              onClick={() => toggleTierAtLeastOne(tier.hits)}
                              className="inline-flex items-center gap-1 rounded border border-white/12 bg-[#181B22] px-2 py-1 text-[11px] text-neutral-200 hover:border-[#D4AF37]/50 hover:text-[#E5C158] cursor-pointer"
                            >
                              <span>
                                {expandedTierAtLeastOne[tier.hits] ? 'Ocultar' : 'Memória P(≥ 1)'}
                              </span>
                            </button>
                          )}
                        </td>
                      </tr>
                      {tier.atLeastOneWin && expandedTierAtLeastOne[tier.hits] && (
                        <tr className="bg-[#0A0B0E]/80">
                          <td colSpan={5} className="p-4">
                            <MemoryPanel memory={tier.atLeastOneWin.memory} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* Explorador Combinatório Interativo (Parâmetros Livres locais OU Modalidade com dados vindos do Python) */}
      {(mode === 'free' ||
        modalityAwaitingRules ||
        (specializedAnalysis && specializedTab === 'probabilities')) && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-4 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                {mode === 'modality' && activeVerifiedRule
                  ? `Parâmetros Carregados (${selectedLotteryDetail?.name})`
                  : 'Parâmetros Teóricos (Local BigInt)'}
              </h2>
            </div>

            <div className="space-y-4">
              <label className="block">
                <div className="flex justify-between text-xs text-neutral-300">
                  <span>Universo Discreto (N)</span>
                  <span className="font-mono-tabular text-[#E5C158]">{ruleUniverseSize}</span>
                </div>
                <input
                  type="range"
                  min={mode === 'modality' && activeVerifiedRule ? Math.min(10, ruleUniverseSize) : 10}
                  max={
                    mode === 'modality' && activeVerifiedRule
                      ? Math.max(100, ruleUniverseSize)
                      : 100
                  }
                  disabled={mode === 'modality' && Boolean(activeVerifiedRule)}
                  value={ruleUniverseSize}
                  onChange={(e) => setUniverseSize(Number(e.target.value))}
                  className="mt-2 w-full accent-[#D4AF37] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>

              <label className="block">
                <div className="flex justify-between text-xs text-neutral-300">
                  <span>Elementos Sorteados (k)</span>
                  <span className="font-mono-tabular text-[#8B5CF6]">{safeDrawn}</span>
                </div>
                <input
                  type="range"
                  min={mode === 'modality' && activeVerifiedRule ? Math.min(2, safeDrawn) : 2}
                  max={
                    mode === 'modality' && activeVerifiedRule
                      ? Math.max(20, safeDrawn)
                      : Math.min(20, ruleUniverseSize)
                  }
                  disabled={mode === 'modality' && Boolean(activeVerifiedRule)}
                  value={safeDrawn}
                  onChange={(e) => setDrawnCount(Number(e.target.value))}
                  className="mt-2 w-full accent-[#7C3AED] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>

              <label className="block">
                <div className="flex justify-between text-xs text-neutral-300">
                  <span>
                    Dezenas Escolhidas (m)
                    {mode === 'modality' && activeVerifiedRule
                      ? ` [${minChosenLimit}..${maxChosenLimit}]`
                      : ''}
                  </span>
                  <span className="font-mono-tabular text-[#E5C158]">{safeChosen}</span>
                </div>
                <input
                  type="range"
                  aria-label="Quantidade de dezenas escolhidas"
                  min={minChosenLimit}
                  max={maxChosenLimit}
                  disabled={modalityAwaitingRules}
                  value={safeChosen}
                  onChange={(e) => setChosenCount(Number(e.target.value))}
                  className="mt-2 w-full accent-[#D4AF37] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>

              {/* Botões rápidos de quantidade de dezenas para comparação imediata */}
              {!modalityAwaitingRules && (
                <div>
                  <span className="block text-[11px] text-neutral-400 mb-2">
                    Seleção rápida de dezenas (m)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(mode === 'modality' && specializedAnalysis
                      ? specializedAnalysis.comparisonRows.map((r) => r.chosenCount)
                      : freeChosenComparisonRows.map((r) => r.chosen)
                    ).map((mVal) => (
                      <button
                        key={mVal}
                        type="button"
                        onClick={() => setChosenCount(mVal)}
                        className={`rounded-md border px-2.5 py-1 font-mono-tabular text-xs transition-colors cursor-pointer ${
                          mVal === safeChosen
                            ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#E5C158]'
                            : 'border-white/10 bg-[#0A0B0E] text-neutral-300 hover:border-white/25'
                        }`}
                      >
                        {mVal}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/8 pt-4">
              <span className="text-xs text-neutral-400">
                Combinações Possíveis Exatas C({ruleUniverseSize}, {safeChosen})
              </span>
              <p className="mt-1 font-mono-tabular text-lg font-semibold text-[#F1F2F4] break-all">
                {modalityAwaitingRules
                  ? 'Aguardando regras verificadas'
                  : mode === 'modality'
                    ? specializedAnalysis
                      ? formatBigIntPtBr(specializedAnalysis.totalChosenCombinations)
                      : 'Aguardando motor Python...'
                    : freeTotalCombinations.toLocaleString('pt-BR')}
              </p>
            </div>

            <div className="border-t border-white/8 pt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => handleTestPythonEngine('theoretical')}
                disabled={pythonState.status === 'loading' || modalityAwaitingRules}
                className="w-full rounded-lg border border-[#8B5CF6]/40 bg-[#181B22] px-4 py-2.5 text-xs font-medium text-[#C4B5FD] transition-colors hover:border-[#8B5CF6] disabled:opacity-50 cursor-pointer"
              >
                {pythonState.status === 'loading' && pythonState.endpointUsed === 'theoretical'
                  ? 'Consultando Motor Python...'
                  : 'Executar via Motor Python (HTTP)'}
              </button>

              {mode === 'modality' && activeVerifiedRule && (
                <button
                  type="button"
                  onClick={() => handleTestPythonEngine('specialized')}
                  disabled={specializedFetch.status === 'loading'}
                  className="w-full rounded-lg border border-[#D4AF37]/40 bg-[#181B22] px-4 py-2 text-xs font-medium text-[#E5C158] transition-colors hover:border-[#D4AF37] disabled:opacity-50 cursor-pointer"
                >
                  {specializedFetch.status === 'loading'
                    ? 'Executando Modelo Especializado...'
                    : 'Revalidar Modelo Especializado no Python'}
                </button>
              )}

              {pythonState.status === 'error' && (
                <p className="text-xs leading-relaxed text-amber-300">{pythonState.message}</p>
              )}
              {pythonState.status === 'success' && (
                <p className="font-mono-tabular text-xs text-[#E5C158]">
                  Respondido por {pythonState.executionSource}: C(N,m) ={' '}
                  {formatBigIntPtBr(pythonState.totalCombinations ?? '0')} · ΣP ={' '}
                  {pythonState.distributionSum?.toFixed(12)}
                </p>
              )}
            </div>
          </div>

          {/* Tabela com Memória de Cálculo expansível */}
          <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Distribuição Hipergeométrica P(H_volante = h) e Memória de Cálculo
              </h2>
              <span className="font-mono-tabular text-xs text-neutral-400">
                Clique em Detalhes para inspecionar fórmula, fração e explicação
              </span>
            </div>

            {modalityAwaitingRules ? (
              <div className="mt-6 rounded-lg border border-white/8 bg-[#0A0B0E] p-6 text-xs text-neutral-300">
                Esta modalidade está marcada como{' '}
                <strong className="text-[#E5C158]">aguardando configuração</strong>. Nenhuma regra
                oficial foi inventada ou aplicada. Selecione Mega-Sena, Lotofácil ou utilize o modo{' '}
                <strong className="text-[#F1F2F4]">Parâmetros Livres</strong>.
              </div>
            ) : (
              <div className="mt-4 max-h-[30rem] overflow-x-auto overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/8 text-neutral-400">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Acertos (h)</th>
                      <th className="py-2 px-3 font-medium">Prob. Aprox. (%)</th>
                      <th className="py-2 px-3 font-medium">Notação Científica</th>
                      <th className="py-2 px-3 font-medium">Classificação</th>
                      <th className="py-2 px-3 text-right font-medium">Razão Aprox.</th>
                      <th className="py-2 pl-3 text-right font-medium">Cálculo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {(mode === 'modality' && specializedAnalysis
                      ? specializedAnalysis.distribution
                      : freeDistribution
                    ).map((row) => {
                      const isExpanded = Boolean(expandedHits[row.hits]);
                      const tierLabel =
                        'tierName' in row && row.tierName ? ` · ${row.tierName}` : '';
                      return (
                        <React.Fragment key={row.hits}>
                          <tr className="hover:bg-white/[0.02]">
                            <td className="py-2.5 pr-3 font-mono-tabular text-neutral-200 whitespace-nowrap">
                              {row.hits}
                              {tierLabel ? (
                                <span className="text-[#E5C158]">{tierLabel}</span>
                              ) : null}
                            </td>
                            <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                              {(row.probability * 100).toPrecision(6)}%
                            </td>
                            <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                              {row.scientificNotation}
                            </td>
                            <td className="py-2.5 px-3 text-neutral-400 whitespace-nowrap">
                              {row.isImpossible
                                ? 'Zero exato'
                                : row.precisionClassification === 'exact'
                                  ? 'Exato'
                                  : 'Racional exato + aprox. float'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono-tabular text-neutral-300 whitespace-nowrap">
                              {formatOddsDisplay(row.probability, row.oddsOneIn)}
                            </td>
                            <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-label={`Detalhes matemáticos para ${row.hits} acertos`}
                                onClick={() => toggleExpandedHit(row.hits)}
                                className="inline-flex items-center gap-1 rounded border border-white/12 bg-[#181B22] px-2 py-1 text-[11px] text-neutral-200 hover:border-[#D4AF37]/50 hover:text-[#E5C158] cursor-pointer"
                              >
                                <span>{isExpanded ? 'Ocultar' : 'Detalhes'}</span>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-[#0A0B0E]/80">
                              <td colSpan={6} className="p-4">
                                {'memory' in row ? (
                                  <MemoryPanel memory={(row as SpecializedHitPoint).memory} />
                                ) : (
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
                                    <div className="space-y-1.5">
                                      <p className="text-[11px] font-medium text-[#E5C158]">
                                        Representação Racional Exata (BigInt)
                                      </p>
                                      <p className="font-mono-tabular text-neutral-300 break-all">
                                        <span className="text-neutral-500">Numerador exato:</span>{' '}
                                        {formatBigIntPtBr(row.rawNumerator)}
                                      </p>
                                      <p className="font-mono-tabular text-neutral-300 break-all">
                                        <span className="text-neutral-500">Denominador exato:</span>{' '}
                                        {formatBigIntPtBr(row.rawDenominator)}
                                      </p>
                                      <p className="font-mono-tabular text-neutral-200 break-all">
                                        <span className="text-neutral-500">
                                          Fração simplificada (MDC):
                                        </span>{' '}
                                        {row.exactNumerator} / {row.exactDenominator}
                                      </p>
                                    </div>

                                    <div className="space-y-1.5">
                                      <p className="text-[11px] font-medium text-[#8B5CF6]">
                                        Aproximações Numéricas & Fórmula
                                      </p>
                                      <p className="font-mono-tabular text-neutral-300">
                                        <span className="text-neutral-500">
                                          Prob. percentual aprox.:
                                        </span>{' '}
                                        {(row.probability * 100).toPrecision(8)}%
                                      </p>
                                      <p className="font-mono-tabular text-neutral-300">
                                        <span className="text-neutral-500">
                                          Notação científica:
                                        </span>{' '}
                                        {row.scientificNotation} ·{' '}
                                        <span className="text-neutral-500">Razão aprox.:</span>{' '}
                                        {formatOddsDisplay(row.probability, row.oddsOneIn)}
                                      </p>
                                      <p className="font-mono-tabular text-neutral-300 break-words">
                                        <span className="text-neutral-500">Fórmula:</span> P(X=
                                        {row.hits}) = [C(k, h) · C(N−k, m−h)] / C(N, m) = [C(
                                        {safeDrawn}, {row.hits}) · C({universeSize - safeDrawn},{' '}
                                        {safeChosen - row.hits})] / C({universeSize}, {safeChosen})
                                      </p>
                                      <p className="font-mono-tabular text-neutral-400">
                                        <span className="text-neutral-500">Parâmetros:</span> N=
                                        {universeSize}, k={safeDrawn}, m={safeChosen}, h={row.hits}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Comparação rápida entre quantidades de dezenas no modo Parâmetros Livres (local) */}
      {mode === 'free' && (
        <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Comparação entre Quantidades de Dezenas (m)
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Impacto combinatório ao variar a quantidade de dezenas selecionadas para N=
                {universeSize} e k={safeDrawn}.
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-neutral-400">
              Cálculo exato BigInt (Parâmetros Livres)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/8 text-neutral-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Dezenas (m)</th>
                  <th className="py-2 px-3 font-medium">Combinações C(N, m)</th>
                  <th className="py-2 px-3 font-medium">Acerto Máximo (h)</th>
                  <th className="py-2 px-3 font-medium">Prob. Máx. Aprox.</th>
                  <th className="py-2 px-3 font-medium">Razão Máx. Aprox.</th>
                  <th className="py-2 px-3 font-medium">Faixa Secundária (h-1)</th>
                  <th className="py-2 pl-3 text-right font-medium">Fator vs. Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {freeChosenComparisonRows.map((item) => (
                  <tr
                    key={item.chosen}
                    className={item.isSelected ? 'bg-[#D4AF37]/[0.06]' : 'hover:bg-white/[0.02]'}
                  >
                    <td className="py-2.5 pr-3 font-mono-tabular font-medium text-[#F1F2F4]">
                      {item.chosen} {item.isSelected ? '· atual' : ''}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                      {item.totalCombinations.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                      {item.topHits} acertos
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                      {(item.topDetail.probability * 100).toPrecision(5)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300 whitespace-nowrap">
                      {formatOddsDisplay(item.topDetail.probability, item.topDetail.oddsOneIn)}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-400 whitespace-nowrap">
                      {item.secondaryDetail.oddsOneIn
                        ? `${item.secondaryHits} acertos: ${formatOddsDisplay(item.secondaryDetail.probability, item.secondaryDetail.oddsOneIn)}`
                        : 'Impossível'}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono-tabular text-[#C4B5FD]">
                      {item.relativeFactor !== null ? `${item.relativeFactor.toFixed(2)}x` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Limite Arquitetural Python & IA */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Motor Científico Python (`/math_engine`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            Os modelos especializados (`/api/math/python/specialized`) executam em aritmética
            racional exata no Python FastAPI com auditoria matemática pelo backend Node.js.
            Indisponibilidades nunca são mascaradas localmente.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Separação Estrita da Camada de IA (`Gemini`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            O cliente `@google/genai` nunca calcula probabilidades nem prevê dezenas vencedoras.
            Resultados passados não alteram as chances dos sorteios futuros.
          </p>
        </div>
      </section>
    </div>
  );
};
