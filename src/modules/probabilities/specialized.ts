import {
  type DistributionPoint,
  type PrecisionClassification,
  bigIntRatioToFloat,
  bigIntRatioToScientific,
  exactCombinationsBigInt,
  gcdBigInt,
  hypergeometricDetail,
} from './combinatorics.ts';

export type LotteryMathModelType =
  | 'hypergeometric_single_group'
  | 'multi_group_combinatorial'
  | 'positional_columns'
  | 'multi_extraction'
  | 'extra_field_combinatorial';

export interface PrizeTierConfigItem {
  hits: number;
  tierName: string;
  tierOrder: number;
  isMainPrize: boolean;
}

export interface CalculationMemoryEntry {
  title: string;
  formula: string;
  substitutedParameters: string;
  rawNumerator: string;
  rawDenominator: string;
  simplifiedFraction: string;
  decimalProbability: number;
  percentageFormatted: string;
  scientificNotation: string;
  oddsOneIn: string | null;
  plainExplanation: string;
}

export interface EmbeddedMultipleTierWin {
  tierName: string;
  targetHits: number;
  winningSimpleCombinations: string;
}

export interface TierAtLeastOneWin {
  triggeringVolanteHits: number[];
  probability: number;
  rawNumerator: string;
  rawDenominator: string;
  exactNumerator: string;
  exactDenominator: string;
  scientificNotation: string;
  oddsOneIn: string | null;
  precisionClassification: PrecisionClassification;
  memory: CalculationMemoryEntry;
}

export interface SpecializedHitPoint extends DistributionPoint {
  tierName: string | null;
  isPrizeTier: boolean;
  isMainPrize: boolean;
  embeddedSimpleWins: EmbeddedMultipleTierWin[];
  expectedEmbeddedWinsPerDraw?: number;
  atLeastOneWin?: TierAtLeastOneWin;
  memory: CalculationMemoryEntry;
}

export interface ExactAggregateProbability {
  label: string;
  probability: number;
  rawNumerator: string;
  rawDenominator: string;
  exactNumerator: string;
  exactDenominator: string;
  scientificNotation: string;
  oddsOneIn: string | null;
  precisionClassification: PrecisionClassification;
  memory: CalculationMemoryEntry;
}

export interface MultipleBetBreakdown {
  chosenCount: number;
  drawnCount: number;
  isMultipleBet: boolean;
  equivalentSimpleBets: string;
  simpleBetPriceCents: number | null;
  totalCostCents: string | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  combinatorialCoverage: {
    numerator: string;
    denominator: string;
    simplifiedNumerator: string;
    simplifiedDenominator: string;
    probability: number;
    scientificNotation: string;
    oddsOneIn: string | null;
  };
}

export interface ExactUnionEventResult {
  rawNumerator: string;
  rawDenominator: string;
  exactNumerator: string;
  exactDenominator: string;
  probability: number;
  scientificNotation: string;
  oddsOneIn: string | null;
  memory?: CalculationMemoryEntry;
}

export interface ExactUnionAnalysis {
  gamesCount: number;
  pairwiseOverlapSummary: {
    pairCount: number;
    minOverlap: number;
    maxOverlap: number;
    avgOverlap: number;
    disjointPairsCount: number;
  };
  mainPrizeUnion: ExactUnionEventResult;
  anyPrizeUnion: ExactUnionEventResult & { memory: CalculationMemoryEntry };
  secondaryPrizeUnion: ExactUnionEventResult & { memory: CalculationMemoryEntry };
}

export interface SimpleGamesComparison {
  simpleGamesCount: number;
  simpleBetPriceCents: number | null;
  totalCostCents: string | null;
  topPrizeExact: {
    numerator: string;
    denominator: string;
    simplifiedNumerator: string;
    simplifiedDenominator: string;
    probability: number;
    scientificNotation: string;
    oddsOneIn: string | null;
  };
  expectedWinningGamesPerDraw: number;
  expectedSecondaryWinningGamesPerDraw: number;
  secondaryPrizeStatus: 'exact_union_computed' | 'requires_explicit_combinations';
  overlapDependencyNotice: string;
  exactUnionAnalysis: ExactUnionAnalysis | null;
  illustrativeIndependentApproximation: {
    value: number;
    isExact: false;
    warning: string;
  };
  equiprobabilityNotice: string;
}

export interface BetConfigurationComparisonRow {
  chosenCount: number;
  isSelected: boolean;
  equivalentSimpleBets: string;
  totalCostCents: string | null;
  totalSpaceCombinations: string;
  mainPrizeHits: number;
  mainPrizeProbability: number;
  mainPrizeOddsOneIn: string | null;
  anyPrizeProbability: number;
  anyPrizeOddsOneIn: string | null;
  noPrizeProbability: number;
  coverageFactorVsMinimum: string;
}

export interface SpecializedModalityAnalysis {
  lotteryCode: string;
  mathModelType: LotteryMathModelType;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  totalSpaceSimpleCombinations: string;
  totalChosenCombinations: string;
  anyPrize: ExactAggregateProbability;
  noPrize: ExactAggregateProbability;
  prizeTiers: SpecializedHitPoint[];
  distribution: SpecializedHitPoint[];
  multipleBet: MultipleBetBreakdown;
  simpleGamesComparison: SimpleGamesComparison;
  comparisonRows: BetConfigurationComparisonRow[];
  equiprobabilityAxiom: string;
}

interface FractionBigInt {
  num: bigint;
  den: bigint;
}

function reduceFraction(num: bigint, den: bigint): FractionBigInt {
  if (den <= 0n) throw new Error('Denominador racional deve ser positivo.');
  if (num === 0n) return { num: 0n, den: 1n };
  const divisor = gcdBigInt(num, den);
  return { num: num / divisor, den: den / divisor };
}

function addFractions(a: FractionBigInt, b: FractionBigInt): FractionBigInt {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  return reduceFraction(num, den);
}

function safeComb(n: number, k: number): bigint {
  if (k < 0 || n < 0 || k > n) return 0n;
  if (k === 0 || k === n) return 1n;
  return exactCombinationsBigInt(n, k);
}

function formatPercent(prob: number): string {
  if (prob === 0) return '0%';
  if (prob === 1) return '100%';
  return `${(prob * 100).toPrecision(6)}%`;
}

function formatPtBrInt(value: bigint | string): string {
  try {
    return BigInt(value).toLocaleString('pt-BR');
  } catch {
    return String(value);
  }
}

/**
 * Calcula quantas apostas simples embutidas (de tamanho `drawnCount`) dentro de um volante
 * com `chosenCount` dezenas acertam exatamente `targetHits` números quando o volante acertou `actualHits`.
 * Identidade de Vandermonde: C(actualHits, targetHits) * C(chosenCount - actualHits, drawnCount - targetHits).
 */
export function computeEmbeddedSimpleWins(
  chosenCount: number,
  drawnCount: number,
  actualHits: number,
  prizeTiers: readonly PrizeTierConfigItem[]
): EmbeddedMultipleTierWin[] {
  if (chosenCount <= drawnCount) {
    const matched = prizeTiers.find((t) => t.hits === actualHits);
    if (!matched) return [];
    return [
      {
        tierName: matched.tierName,
        targetHits: matched.hits,
        winningSimpleCombinations: '1',
      },
    ];
  }

  const wins: EmbeddedMultipleTierWin[] = [];
  for (const tier of [...prizeTiers].sort((a, b) => b.hits - a.hits)) {
    const missNeeded = drawnCount - tier.hits;
    const chosenMisses = chosenCount - actualHits;
    if (
      tier.hits <= actualHits &&
      missNeeded >= 0 &&
      missNeeded <= chosenMisses
    ) {
      const count =
        safeComb(actualHits, tier.hits) *
        safeComb(chosenMisses, missNeeded);
      if (count > 0n) {
        wins.push({
          tierName: tier.tierName,
          targetHits: tier.hits,
          winningSimpleCombinations: count.toString(),
        });
      }
    }
  }
  return wins;
}

export function validateExplicitSimpleBets(
  bets: readonly (readonly number[])[],
  universeSize: number,
  drawnCount: number
): number[][] {
  if (bets.length < 1 || bets.length > 12) {
    throw new Error('Informe entre 1 e 12 combinações simples para cálculo exato da união.');
  }
  const seenBets = new Set<string>();
  const normalized: number[][] = [];
  for (let idx = 0; idx < bets.length; idx++) {
    const bet = bets[idx];
    if (bet.length !== drawnCount) {
      throw new Error(
        `Aposta simples #${idx + 1} deve conter exatamente ${drawnCount} dezenas (recebidas: ${bet.length}).`
      );
    }
    const uniq = new Set<number>();
    for (const num of bet) {
      if (!Number.isInteger(num) || num < 1 || num > universeSize) {
        throw new Error(
          `Dezena ${num} na aposta #${idx + 1} está fora do universo [1..${universeSize}].`
        );
      }
      uniq.add(num);
    }
    if (uniq.size !== bet.length) {
      throw new Error(`Aposta simples #${idx + 1} possui dezenas repetidas.`);
    }
    const sorted = Array.from(uniq).sort((a, b) => a - b);
    const key = sorted.join(',');
    if (seenBets.has(key)) {
      throw new Error(`Aposta simples #${idx + 1} é duplicada; informe combinações distintas.`);
    }
    seenBets.add(key);
    normalized.push(sorted);
  }
  return normalized;
}

function countLosingDrawsUpwardClosedBigInt(
  universeSize: number,
  drawnCount: number,
  betSets: readonly Set<number>[],
  hMin: number
): bigint {
  const q = betSets.length;
  if (hMin <= 0) return 0n;

  const maskCounts = new Map<number, number>();
  for (let x = 1; x <= universeSize; x++) {
    let m = 0;
    for (let i = 0; i < q; i++) {
      if (betSets[i].has(x)) m |= 1 << i;
    }
    maskCounts.set(m, (maskCounts.get(m) ?? 0) + 1);
  }
  const outside = maskCounts.get(0) ?? 0;
  maskCounts.delete(0);
  const atoms = Array.from(maskCounts.entries());

  const useComplement = universeSize - drawnCount < drawnCount && drawnCount - hMin + 1 <= 6;
  if (useComplement) {
    const drawNeed = universeSize - drawnCount;
    const loseMin = drawnCount - hMin + 1;
    const suffixAvail: number[][] = Array.from({ length: atoms.length + 1 }, () =>
      Array(q).fill(0)
    );
    for (let idx = atoms.length - 1; idx >= 0; idx--) {
      const [m, cnt] = atoms[idx];
      for (let i = 0; i < q; i++) {
        suffixAvail[idx][i] = suffixAvail[idx + 1][i] + ((m & (1 << i)) !== 0 ? cnt : 0);
      }
    }

    let stateDp = new Map<string, { d: number; h: number[]; ways: bigint }>();
    const initH = Array(q).fill(0);
    stateDp.set(`0|${initH.join(',')}`, { d: 0, h: initH, ways: 1n });

    for (let idx = 0; idx < atoms.length; idx++) {
      const [m, cnt] = atoms[idx];
      const rem = suffixAvail[idx + 1];
      const affected: number[] = [];
      for (let i = 0; i < q; i++) {
        if ((m & (1 << i)) !== 0) affected.push(i);
      }
      const nextDp = new Map<string, { d: number; h: number[]; ways: bigint }>();
      for (const { d, h, ways } of stateDp.values()) {
        const maxTake = Math.min(cnt, drawNeed - d);
        for (let take = 0; take <= maxTake; take++) {
          const nd = d + take;
          const nh = [...h];
          for (const i of affected) {
            nh[i] = Math.min(loseMin, nh[i] + take);
          }
          let ok = true;
          for (let i = 0; i < q; i++) {
            if (nh[i] + rem[i] < loseMin || nh[i] + (drawNeed - nd) < loseMin) {
              ok = false;
              break;
            }
          }
          if (ok) {
            const key = `${nd}|${nh.join(',')}`;
            const prev = nextDp.get(key);
            const added = ways * safeComb(cnt, take);
            if (prev) prev.ways += added;
            else nextDp.set(key, { d: nd, h: nh, ways: added });
          }
        }
      }
      stateDp = nextDp;
    }

    let losing = 0n;
    for (const { d, h, ways } of stateDp.values()) {
      if (h.every((v) => v === loseMin)) {
        const needOut = drawNeed - d;
        if (needOut >= 0 && needOut <= outside) {
          losing += ways * safeComb(outside, needOut);
        }
      }
    }
    return losing;
  }

  let stateDp = new Map<string, { d: number; h: number[]; ways: bigint }>();
  const initH = Array(q).fill(0);
  stateDp.set(`0|${initH.join(',')}`, { d: 0, h: initH, ways: 1n });

  for (const [m, cnt] of atoms) {
    const affected: number[] = [];
    for (let i = 0; i < q; i++) {
      if ((m & (1 << i)) !== 0) affected.push(i);
    }
    const nextDp = new Map<string, { d: number; h: number[]; ways: bigint }>();
    for (const { d, h, ways } of stateDp.values()) {
      const maxTake = Math.min(cnt, drawnCount - d);
      for (let take = 0; take <= maxTake; take++) {
        const nd = d + take;
        const nh = [...h];
        let ok = true;
        for (const i of affected) {
          nh[i] += take;
          if (nh[i] >= hMin) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const key = `${nd}|${nh.join(',')}`;
          const prev = nextDp.get(key);
          const added = ways * safeComb(cnt, take);
          if (prev) prev.ways += added;
          else nextDp.set(key, { d: nd, h: nh, ways: added });
        }
      }
    }
    stateDp = nextDp;
  }

  let losing = 0n;
  for (const { d, ways } of stateDp.values()) {
    const needOut = drawnCount - d;
    if (needOut >= 0 && needOut <= outside) {
      losing += ways * safeComb(outside, needOut);
    }
  }
  return losing;
}

export function computeExactUnionForSimpleBets(params: {
  universeSize: number;
  drawnCount: number;
  simpleBets: readonly (readonly number[])[];
  prizeTiers: readonly PrizeTierConfigItem[];
}): ExactUnionAnalysis {
  const { universeSize, drawnCount, prizeTiers } = params;
  const normalizedBets = validateExplicitSimpleBets(params.simpleBets, universeSize, drawnCount);
  const q = normalizedBets.length;
  const totalSpace = exactCombinationsBigInt(universeSize, drawnCount);
  const betSets = normalizedBets.map((b) => new Set(b));

  const prizeHits = Array.from(new Set(prizeTiers.map((t) => t.hits))).sort((a, b) => a - b);
  const mainHits =
    prizeTiers.find((t) => t.isMainPrize)?.hits ??
    (prizeHits.length > 0 ? prizeHits[prizeHits.length - 1] : drawnCount);
  const secondaryHits = new Set(prizeHits.filter((h) => h !== mainHits));

  const overlaps: number[] = [];
  for (let i = 0; i < q; i++) {
    for (let j = i + 1; j < q; j++) {
      let common = 0;
      for (const n of betSets[i]) {
        if (betSets[j].has(n)) common++;
      }
      overlaps.push(common);
    }
  }

  const minOverlap = overlaps.length > 0 ? Math.min(...overlaps) : 0;
  const maxOverlap = overlaps.length > 0 ? Math.max(...overlaps) : 0;
  const avgOverlap =
    overlaps.length > 0 ? overlaps.reduce((a, b) => a + b, 0) / overlaps.length : 0;
  const disjointPairsCount = overlaps.filter((o) => o === 0).length;

  let anyRawNum = 0n;
  const hMin = prizeHits.length > 0 ? prizeHits[0] : drawnCount + 1;
  const isContiguousUpward =
    prizeHits.length > 0 &&
    prizeHits.length === drawnCount - hMin + 1 &&
    prizeHits.every((val, idx) => val === hMin + idx);

  if (isContiguousUpward) {
    anyRawNum = totalSpace - countLosingDrawsUpwardClosedBigInt(universeSize, drawnCount, betSets, hMin);
  } else if (prizeHits.length > 0) {
    const prizeSet = new Set(prizeHits);
    const maskCounts = new Map<number, number>();
    for (let x = 1; x <= universeSize; x++) {
      let m = 0;
      for (let i = 0; i < q; i++) {
        if (betSets[i].has(x)) m |= 1 << i;
      }
      maskCounts.set(m, (maskCounts.get(m) ?? 0) + 1);
    }
    const outside = maskCounts.get(0) ?? 0;
    maskCounts.delete(0);
    let stateDp = new Map<string, { d: number; h: number[]; ways: bigint }>();
    const initH = Array(q).fill(0);
    stateDp.set(`0|${initH.join(',')}`, { d: 0, h: initH, ways: 1n });
    for (const [m, cnt] of maskCounts.entries()) {
      const affected: number[] = [];
      for (let i = 0; i < q; i++) {
        if ((m & (1 << i)) !== 0) affected.push(i);
      }
      const nextDp = new Map<string, { d: number; h: number[]; ways: bigint }>();
      for (const { d, h, ways } of stateDp.values()) {
        for (let take = 0; take <= Math.min(cnt, drawnCount - d); take++) {
          const nd = d + take;
          const nh = [...h];
          for (const i of affected) nh[i] += take;
          const key = `${nd}|${nh.join(',')}`;
          const prev = nextDp.get(key);
          const added = ways * safeComb(cnt, take);
          if (prev) prev.ways += added;
          else nextDp.set(key, { d: nd, h: nh, ways: added });
        }
      }
      stateDp = nextDp;
    }
    for (const { d, h, ways } of stateDp.values()) {
      const needOut = drawnCount - d;
      if (needOut >= 0 && needOut <= outside && h.some((v) => prizeSet.has(v))) {
        anyRawNum += ways * safeComb(outside, needOut);
      }
    }
  }

  let secRawNum = 0n;
  if (secondaryHits.size > 0 && isContiguousUpward && mainHits === drawnCount) {
    let excludedTopOnly = 0n;
    for (let i = 0; i < q; i++) {
      let hasSecWithOther = false;
      for (let j = 0; j < q; j++) {
        if (i === j) continue;
        let common = 0;
        for (const n of betSets[i]) if (betSets[j].has(n)) common++;
        if (secondaryHits.has(common)) {
          hasSecWithOther = true;
          break;
        }
      }
      if (!hasSecWithOther) excludedTopOnly += 1n;
    }
    secRawNum = anyRawNum > excludedTopOnly ? anyRawNum - excludedTopOnly : 0n;
  }

  const anyFrac = reduceFraction(anyRawNum, totalSpace);
  const anyProb = bigIntRatioToFloat(anyFrac.num, anyFrac.den);
  const anyOdds =
    anyFrac.num > 0n ? ((anyFrac.den + anyFrac.num / 2n) / anyFrac.num).toString() : null;

  const secFrac = reduceFraction(secRawNum, totalSpace);
  const secProb = bigIntRatioToFloat(secFrac.num, secFrac.den);
  const secOdds =
    secFrac.num > 0n ? ((secFrac.den + secFrac.num / 2n) / secFrac.num).toString() : null;

  const mainRawNum = mainHits === drawnCount ? BigInt(q) : 0n;
  const mainFrac = reduceFraction(mainRawNum, totalSpace);
  const mainProb = bigIntRatioToFloat(mainFrac.num, mainFrac.den);
  const mainOdds =
    mainFrac.num > 0n ? ((mainFrac.den + mainFrac.num / 2n) / mainFrac.num).toString() : null;

  return {
    gamesCount: q,
    pairwiseOverlapSummary: {
      pairCount: overlaps.length,
      minOverlap,
      maxOverlap,
      avgOverlap: Number(avgOverlap.toFixed(4)),
      disjointPairsCount,
    },
    mainPrizeUnion: {
      rawNumerator: mainRawNum.toString(),
      rawDenominator: totalSpace.toString(),
      exactNumerator: mainFrac.num.toString(),
      exactDenominator: mainFrac.den.toString(),
      probability: mainProb,
      scientificNotation: bigIntRatioToScientific(mainFrac.num, mainFrac.den, 8),
      oddsOneIn: mainOdds,
    },
    anyPrizeUnion: {
      rawNumerator: anyRawNum.toString(),
      rawDenominator: totalSpace.toString(),
      exactNumerator: anyFrac.num.toString(),
      exactDenominator: anyFrac.den.toString(),
      probability: anyProb,
      scientificNotation: bigIntRatioToScientific(anyFrac.num, anyFrac.den, 8),
      oddsOneIn: anyOdds,
      memory: {
        title: `União Exata de Qualquer Premiação (${q} jogo(s) explícito(s))`,
        formula: 'P(⋃ E_i) = |⋃_{i=1}^q {D : |D ∩ B_i| ∈ F}| / C(N, k)',
        substitutedParameters: `${anyRawNum.toString()} / ${totalSpace.toString()} (pares: ${overlaps.length}, sobreposição: ${minOverlap}..${maxOverlap})`,
        rawNumerator: anyRawNum.toString(),
        rawDenominator: totalSpace.toString(),
        simplifiedFraction: `${anyFrac.num.toString()} / ${anyFrac.den.toString()}`,
        decimalProbability: anyProb,
        percentageFormatted: formatPercent(anyProb),
        scientificNotation: bigIntRatioToScientific(anyFrac.num, anyFrac.den, 8),
        oddsOneIn: anyOdds,
        plainExplanation: `Cálculo exato da união dos eventos vencedores considerando a sobreposição real entre os ${q} jogos simples informados, sem hipótese falsa de independência.`,
      },
    },
    secondaryPrizeUnion: {
      rawNumerator: secRawNum.toString(),
      rawDenominator: totalSpace.toString(),
      exactNumerator: secFrac.num.toString(),
      exactDenominator: secFrac.den.toString(),
      probability: secProb,
      scientificNotation: bigIntRatioToScientific(secFrac.num, secFrac.den, 8),
      oddsOneIn: secOdds,
      memory: {
        title: `União Exata de Pelo Menos Um Prêmio Secundário (${q} jogo(s) explícito(s))`,
        formula: 'P(⋃ E_sec,i) = |⋃_{i=1}^q {D : |D ∩ B_i| ∈ F_sec}| / C(N, k)',
        substitutedParameters: `${secRawNum.toString()} / ${totalSpace.toString()} (sobreposição mín/máx: ${minOverlap}..${maxOverlap})`,
        rawNumerator: secRawNum.toString(),
        rawDenominator: totalSpace.toString(),
        simplifiedFraction: `${secFrac.num.toString()} / ${secFrac.den.toString()}`,
        decimalProbability: secProb,
        percentageFormatted: formatPercent(secProb),
        scientificNotation: bigIntRatioToScientific(secFrac.num, secFrac.den, 8),
        oddsOneIn: secOdds,
        plainExplanation: `Contagem exata de sorteios em que ao menos uma das ${q} apostas individuais atinge uma faixa secundária (${Array.from(secondaryHits).sort((a, b) => a - b).join(', ')} acertos).`,
      },
    },
  };
}

export function computeSpecializedModalityAnalysis(params: {
  lotteryCode: string;
  mathModelType?: LotteryMathModelType;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  minNumbersToChoose?: number;
  maxNumbersToChoose?: number;
  prizeTiers?: readonly PrizeTierConfigItem[];
  simpleBetPriceCents?: number | null;
  priceUpdatedAt?: string | null;
  priceSource?: string | null;
  simpleGamesCount?: number;
  simpleBets?: readonly (readonly number[])[];
}): SpecializedModalityAnalysis {
  const {
    lotteryCode,
    mathModelType = 'hypergeometric_single_group',
    universeSize,
    drawnCount,
    chosenCount,
  } = params;

  const minChoose = params.minNumbersToChoose ?? chosenCount;
  const maxChoose = params.maxNumbersToChoose ?? chosenCount;
  const prizeTiers: PrizeTierConfigItem[] =
    params.prizeTiers && params.prizeTiers.length > 0
      ? [...params.prizeTiers]
      : [
          {
            hits: Math.min(drawnCount, chosenCount),
            tierName: `${Math.min(drawnCount, chosenCount)} acertos`,
            tierOrder: 1,
            isMainPrize: true,
          },
        ];

  const tierMap = new Map(prizeTiers.map((t) => [t.hits, t]));
  const totalChosen = exactCombinationsBigInt(universeSize, chosenCount);
  const totalSpaceSimple = exactCombinationsBigInt(universeSize, drawnCount);
  const maxHits = Math.min(drawnCount, chosenCount);

  const distribution: SpecializedHitPoint[] = [];
  let anyPrizeRawNum = 0n;
  let anyPrizeFrac: FractionBigInt = { num: 0n, den: 1n };
  const winningHitsTerms: string[] = [];

  for (let h = 0; h <= maxHits; h++) {
    const base = hypergeometricDetail(universeSize, drawnCount, chosenCount, h);
    const tierInfo = tierMap.get(h) ?? null;
    const isPrizeTier = tierInfo !== null;

    if (isPrizeTier && !base.isImpossible) {
      anyPrizeRawNum += BigInt(base.rawNumerator);
      anyPrizeFrac = addFractions(anyPrizeFrac, {
        num: BigInt(base.exactNumerator),
        den: BigInt(base.exactDenominator),
      });
      winningHitsTerms.push(`P(X=${h})`);
    }

    const embeddedSimpleWins = isPrizeTier
      ? computeEmbeddedSimpleWins(chosenCount, drawnCount, h, prizeTiers)
      : [];

    const formula = 'P(X = h) = [C(k, h) · C(N − k, m − h)] / C(N, m)';
    const substitutedParameters = `P(X = ${h}) = [C(${drawnCount}, ${h}) · C(${universeSize - drawnCount}, ${chosenCount - h})] / C(${universeSize}, ${chosenCount})`;

    const plainExplanation = base.isImpossible
      ? `É matematicamente impossível obter exatamente ${h} acertos marcando ${chosenCount} dezenas em um universo de ${universeSize} números com ${drawnCount} sorteados, pois sobram dezenas insuficientes fora das sorteadas (${chosenCount - h} > ${universeSize - drawnCount}).`
      : `Existem ${formatPtBrInt(base.rawNumerator)} combinações de ${chosenCount} dezenas que contêm exatamente ${h} dos ${drawnCount} números sorteados, dentro de um universo total de ${formatPtBrInt(base.rawDenominator)} combinações possíveis.${
          embeddedSimpleWins.length > 0 && chosenCount > drawnCount
            ? ` No desdobramento de ${chosenCount} dezenas, esse cenário garante ${embeddedSimpleWins
                .map((w) => `${formatPtBrInt(w.winningSimpleCombinations)} prêmio(s) na faixa ${w.tierName}`)
                .join(' + ')}.`
            : ''
        }`;

    distribution.push({
      ...base,
      tierName: tierInfo?.tierName ?? null,
      isPrizeTier,
      isMainPrize: Boolean(tierInfo?.isMainPrize),
      embeddedSimpleWins,
      memory: {
        title: tierInfo
          ? `${tierInfo.tierName} — Acerto exato no volante (${h} acertos)`
          : `${h} acertos no volante`,
        formula,
        substitutedParameters,
        rawNumerator: base.rawNumerator,
        rawDenominator: base.rawDenominator,
        simplifiedFraction: `${base.exactNumerator} / ${base.exactDenominator}`,
        decimalProbability: base.probability,
        percentageFormatted: formatPercent(base.probability),
        scientificNotation: base.scientificNotation,
        oddsOneIn: base.oddsOneIn,
        plainExplanation,
      },
    });
  }

  // Separação B & C nas faixas premiadas: atLeastOneWin + expectedEmbeddedWinsPerDraw
  const eqSimpleForTiers =
    chosenCount >= drawnCount ? exactCombinationsBigInt(chosenCount, drawnCount) : 0n;
  for (const point of distribution) {
    if (!point.isPrizeTier) continue;
    const tHits = point.hits;
    const triggeringHits: number[] = [];
    let atLeastRawNum = 0n;
    let atLeastFrac: FractionBigInt = { num: 0n, den: 1n };

    for (const dPoint of distribution) {
      const hVal = dPoint.hits;
      const missNeeded = drawnCount - tHits;
      const chosenMisses = chosenCount - hVal;
      if (tHits <= hVal && missNeeded >= 0 && missNeeded <= chosenMisses) {
        const cnt =
          safeComb(hVal, tHits) * safeComb(chosenMisses, missNeeded);
        if (cnt > 0n) {
          triggeringHits.push(hVal);
          if (!dPoint.isImpossible) {
            atLeastRawNum += BigInt(dPoint.rawNumerator);
            atLeastFrac = addFractions(atLeastFrac, {
              num: BigInt(dPoint.exactNumerator),
              den: BigInt(dPoint.exactDenominator),
            });
          }
        }
      }
    }

    triggeringHits.sort((a, b) => a - b);
    const atLeastProb = bigIntRatioToFloat(atLeastFrac.num, atLeastFrac.den);
    const atLeastOdds =
      atLeastFrac.num > 0n
        ? ((atLeastFrac.den + atLeastFrac.num / 2n) / atLeastFrac.num).toString()
        : null;
    const simpleT = hypergeometricDetail(universeSize, drawnCount, drawnCount, tHits);
    const expectedTierWins = bigIntRatioToFloat(
      eqSimpleForTiers * BigInt(simpleT.exactNumerator),
      BigInt(simpleT.exactDenominator)
    );
    const termsTxt =
      triggeringHits.length > 0
        ? triggeringHits.map((hv) => `P(H_volante=${hv})`).join(' + ')
        : '0';

    point.expectedEmbeddedWinsPerDraw = expectedTierWins;
    point.atLeastOneWin = {
      triggeringVolanteHits: triggeringHits,
      probability: atLeastProb,
      rawNumerator: atLeastRawNum.toString(),
      rawDenominator: totalChosen.toString(),
      exactNumerator: atLeastFrac.num.toString(),
      exactDenominator: atLeastFrac.den.toString(),
      scientificNotation: bigIntRatioToScientific(atLeastFrac.num, atLeastFrac.den, 8),
      oddsOneIn: atLeastOdds,
      precisionClassification:
        atLeastFrac.num === atLeastFrac.den || atLeastFrac.num === 0n
          ? 'exact'
          : 'exact_rational_with_float_approximation',
      memory: {
        title: `P(Pelo menos 1 prêmio em ${point.tierName ?? `${tHits} acertos`})`,
        formula:
          'P(≥ 1 aposta na faixa t) = Σ P(H_volante = h) para todo h com C(h, t)·C(m − h, k − t) > 0',
        substitutedParameters: `${termsTxt} = ${atLeastRawNum.toString()} / ${totalChosen.toString()}`,
        rawNumerator: atLeastRawNum.toString(),
        rawDenominator: totalChosen.toString(),
        simplifiedFraction: `${atLeastFrac.num.toString()} / ${atLeastFrac.den.toString()}`,
        decimalProbability: atLeastProb,
        percentageFormatted: formatPercent(atLeastProb),
        scientificNotation: bigIntRatioToScientific(atLeastFrac.num, atLeastFrac.den, 8),
        oddsOneIn: atLeastOdds,
        plainExplanation: `Em um volante de ${chosenCount} dezenas, a faixa '${point.tierName ?? `${tHits} acertos`}' é premiada em pelo menos uma aposta simples embutida sempre que o volante acerta h ∈ [${triggeringHits.join(', ')}] dezenas sorteadas.`,
      },
    };
  }

  const anyProbFloat = bigIntRatioToFloat(anyPrizeFrac.num, anyPrizeFrac.den);
  const anyOdds =
    anyPrizeFrac.num > 0n
      ? ((anyPrizeFrac.den + anyPrizeFrac.num / 2n) / anyPrizeFrac.num).toString()
      : null;

  const noPrizeRawNum = totalChosen - anyPrizeRawNum;
  const noPrizeFrac = reduceFraction(noPrizeRawNum, totalChosen);
  const noProbFloat = bigIntRatioToFloat(noPrizeFrac.num, noPrizeFrac.den);
  const noOdds =
    noPrizeFrac.num > 0n
      ? ((noPrizeFrac.den + noPrizeFrac.num / 2n) / noPrizeFrac.num).toString()
      : null;

  const anyPrize: ExactAggregateProbability = {
    label: 'Probabilidade de Premiação (qualquer faixa oficial)',
    probability: anyProbFloat,
    rawNumerator: anyPrizeRawNum.toString(),
    rawDenominator: totalChosen.toString(),
    exactNumerator: anyPrizeFrac.num.toString(),
    exactDenominator: anyPrizeFrac.den.toString(),
    scientificNotation: bigIntRatioToScientific(anyPrizeFrac.num, anyPrizeFrac.den, 8),
    oddsOneIn: anyOdds,
    precisionClassification:
      anyPrizeFrac.num === anyPrizeFrac.den || anyPrizeFrac.num === 0n
        ? 'exact'
        : 'exact_rational_with_float_approximation',
    memory: {
      title: 'Probabilidade de Obter Alguma Premiação',
      formula: 'P(Premiação) = Σ P(X = h) para toda faixa h premiada',
      substitutedParameters:
        winningHitsTerms.length > 0
          ? `P(Premiação) = ${winningHitsTerms.join(' + ')}`
          : 'Nenhuma faixa premiada configurada',
      rawNumerator: anyPrizeRawNum.toString(),
      rawDenominator: totalChosen.toString(),
      simplifiedFraction: `${anyPrizeFrac.num.toString()} / ${anyPrizeFrac.den.toString()}`,
      decimalProbability: anyProbFloat,
      percentageFormatted: formatPercent(anyProbFloat),
      scientificNotation: bigIntRatioToScientific(anyPrizeFrac.num, anyPrizeFrac.den, 8),
      oddsOneIn: anyOdds,
      plainExplanation: `Somando todas as faixas oficiais de premiação (${prizeTiers
        .map((t) => t.tierName)
        .join(', ')}), ${formatPtBrInt(anyPrizeRawNum)} entre ${formatPtBrInt(
        totalChosen
      )} combinações de ${chosenCount} dezenas resultam em ao menos um prêmio (cerca de 1 em ${
        anyOdds ? formatPtBrInt(anyOdds) : '—'
      }).`,
    },
  };

  const noPrize: ExactAggregateProbability = {
    label: 'Probabilidade de Não Obter Premiação',
    probability: noProbFloat,
    rawNumerator: noPrizeRawNum.toString(),
    rawDenominator: totalChosen.toString(),
    exactNumerator: noPrizeFrac.num.toString(),
    exactDenominator: noPrizeFrac.den.toString(),
    scientificNotation: bigIntRatioToScientific(noPrizeFrac.num, noPrizeFrac.den, 8),
    oddsOneIn: noOdds,
    precisionClassification:
      noPrizeFrac.num === noPrizeFrac.den || noPrizeFrac.num === 0n
        ? 'exact'
        : 'exact_rational_with_float_approximation',
    memory: {
      title: 'Probabilidade de Não Premiar',
      formula: 'P(Sem Prêmio) = 1 − P(Premiação)',
      substitutedParameters: `1 − (${anyPrizeFrac.num.toString()} / ${anyPrizeFrac.den.toString()}) = ${noPrizeFrac.num.toString()} / ${noPrizeFrac.den.toString()}`,
      rawNumerator: noPrizeRawNum.toString(),
      rawDenominator: totalChosen.toString(),
      simplifiedFraction: `${noPrizeFrac.num.toString()} / ${noPrizeFrac.den.toString()}`,
      decimalProbability: noProbFloat,
      percentageFormatted: formatPercent(noProbFloat),
      scientificNotation: bigIntRatioToScientific(noPrizeFrac.num, noPrizeFrac.den, 8),
      oddsOneIn: noOdds,
      plainExplanation: `É o evento complementar exato: em ${formatPtBrInt(
        noPrizeRawNum
      )} de ${formatPtBrInt(totalChosen)} combinações possíveis, o bilhete não atinge a quantidade mínima de acertos para premiação.`,
    },
  };

  // Aposta simples vs múltipla
  const equivalentSimpleBets =
    chosenCount >= drawnCount ? exactCombinationsBigInt(chosenCount, drawnCount) : 0n;
  const priceCents = params.simpleBetPriceCents ?? null;
  const totalCostCents =
    priceCents !== null ? (equivalentSimpleBets * BigInt(priceCents)).toString() : null;

  const coverageFrac = reduceFraction(equivalentSimpleBets, totalSpaceSimple);
  const coverageFloat = bigIntRatioToFloat(coverageFrac.num, coverageFrac.den);
  const coverageOdds =
    coverageFrac.num > 0n
      ? ((coverageFrac.den + coverageFrac.num / 2n) / coverageFrac.num).toString()
      : null;

  const multipleBet: MultipleBetBreakdown = {
    chosenCount,
    drawnCount,
    isMultipleBet: chosenCount > drawnCount,
    equivalentSimpleBets: equivalentSimpleBets.toString(),
    simpleBetPriceCents: priceCents,
    totalCostCents,
    priceUpdatedAt: params.priceUpdatedAt ?? null,
    priceSource: params.priceSource ?? null,
    combinatorialCoverage: {
      numerator: equivalentSimpleBets.toString(),
      denominator: totalSpaceSimple.toString(),
      simplifiedNumerator: coverageFrac.num.toString(),
      simplifiedDenominator: coverageFrac.den.toString(),
      probability: coverageFloat,
      scientificNotation: bigIntRatioToScientific(coverageFrac.num, coverageFrac.den, 8),
      oddsOneIn: coverageOdds,
    },
  };

  // Comparação contra q jogos simples distintos (sem suposição falsa de independência como resultado exato)
  const maxQ = Number(totalSpaceSimple > 1_000_000n ? 1_000_000n : totalSpaceSimple);
  const q = params.simpleBets
    ? params.simpleBets.length
    : Math.max(
        1,
        Math.min(
          Math.floor(
            params.simpleGamesCount ??
              Number(
                equivalentSimpleBets > 0n
                  ? equivalentSimpleBets > 100000n
                    ? 100000n
                    : equivalentSimpleBets
                  : 1n
              )
          ),
          maxQ
        )
      );

  const simpleDistPoints = buildSimplePrizeSummary(universeSize, drawnCount, prizeTiers);
  const qBig = BigInt(q);
  const simpleTopFrac = reduceFraction(qBig, totalSpaceSimple);
  const simpleTopFloat = bigIntRatioToFloat(simpleTopFrac.num, simpleTopFrac.den);
  const simpleTopOdds = ((simpleTopFrac.den + simpleTopFrac.num / 2n) / simpleTopFrac.num).toString();

  const exactUnionAnalysis = params.simpleBets
    ? computeExactUnionForSimpleBets({
        universeSize,
        drawnCount,
        simpleBets: params.simpleBets,
        prizeTiers,
      })
    : null;

  const equiprobabilityAxiom =
    'Em sorteios justos e independentes, cada combinação individual distinta possui exatamente a mesma probabilidade matemática (1 / C(N, k)). A aquisição de múltiplas combinações amplia a cobertura combinatória de forma proporcional ao número de combinações distintas, sem tornar nenhuma dezena individual mais provável que outra.';

  const simpleGamesComparison: SimpleGamesComparison = {
    simpleGamesCount: q,
    simpleBetPriceCents: priceCents,
    totalCostCents: priceCents !== null ? (qBig * BigInt(priceCents)).toString() : null,
    topPrizeExact: {
      numerator: qBig.toString(),
      denominator: totalSpaceSimple.toString(),
      simplifiedNumerator: simpleTopFrac.num.toString(),
      simplifiedDenominator: simpleTopFrac.den.toString(),
      probability: simpleTopFloat,
      scientificNotation: bigIntRatioToScientific(simpleTopFrac.num, simpleTopFrac.den, 8),
      oddsOneIn: simpleTopOdds,
    },
    expectedWinningGamesPerDraw: q * simpleDistPoints.anyPrizeFloat,
    expectedSecondaryWinningGamesPerDraw: q * simpleDistPoints.secondaryPrizeFloat,
    secondaryPrizeStatus: exactUnionAnalysis
      ? 'exact_union_computed'
      : 'requires_explicit_combinations',
    overlapDependencyNotice:
      'A probabilidade exata de obter pelo menos um prêmio secundário (ou ao menos um prêmio total) depende da sobreposição entre os jogos escolhidos e não pode ser determinada apenas pela quantidade q. Informe as combinações individuais para calcular a união exata dos eventos.',
    exactUnionAnalysis,
    illustrativeIndependentApproximation: {
      value: 1 - Math.pow(1 - simpleDistPoints.anyPrizeFloat, q),
      isExact: false,
      warning:
        'Aproximação ilustrativa sob hipótese falsa de independência (1 − (1 − p)^q). Apostas no mesmo concurso compartilham o sorteio e dependem da sobreposição combinatória; não representa probabilidade matemática exata.',
    },
    equiprobabilityNotice: equiprobabilityAxiom,
  };

  // Matriz comparativa de todas as quantidades de dezenas válidas [minChoose..maxChoose]
  const comparisonRows: BetConfigurationComparisonRow[] = [];
  const mainTierHits =
    prizeTiers.find((t) => t.isMainPrize)?.hits ?? Math.min(drawnCount, maxChoose);
  const minBetEquivalent =
    minChoose >= drawnCount ? exactCombinationsBigInt(minChoose, drawnCount) : 1n;

  for (let m = minChoose; m <= maxChoose; m++) {
    const eqSimple = m >= drawnCount ? exactCombinationsBigInt(m, drawnCount) : 0n;
    const mChosenSpace = exactCombinationsBigInt(universeSize, m);
    const mainPoint = hypergeometricDetail(universeSize, drawnCount, m, mainTierHits);

    let mAnyFrac: FractionBigInt = { num: 0n, den: 1n };
    for (const tier of prizeTiers) {
      const p = hypergeometricDetail(universeSize, drawnCount, m, tier.hits);
      if (!p.isImpossible) {
        mAnyFrac = addFractions(mAnyFrac, {
          num: BigInt(p.exactNumerator),
          den: BigInt(p.exactDenominator),
        });
      }
    }
    const mAnyFloat = bigIntRatioToFloat(mAnyFrac.num, mAnyFrac.den);
    const mAnyOdds =
      mAnyFrac.num > 0n
        ? ((mAnyFrac.den + mAnyFrac.num / 2n) / mAnyFrac.num).toString()
        : null;

    const factorScaled = minBetEquivalent > 0n ? Number(eqSimple) / Number(minBetEquivalent) : 0;

    comparisonRows.push({
      chosenCount: m,
      isSelected: m === chosenCount,
      equivalentSimpleBets: eqSimple.toString(),
      totalCostCents: priceCents !== null ? (eqSimple * BigInt(priceCents)).toString() : null,
      totalSpaceCombinations: mChosenSpace.toString(),
      mainPrizeHits: mainTierHits,
      mainPrizeProbability: mainPoint.probability,
      mainPrizeOddsOneIn: mainPoint.oddsOneIn,
      anyPrizeProbability: mAnyFloat,
      anyPrizeOddsOneIn: mAnyOdds,
      noPrizeProbability: Math.max(0, 1 - mAnyFloat),
      coverageFactorVsMinimum: `${factorScaled.toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
      })}x`,
    });
  }

  return {
    lotteryCode,
    mathModelType,
    universeSize,
    drawnCount,
    chosenCount,
    totalSpaceSimpleCombinations: totalSpaceSimple.toString(),
    totalChosenCombinations: totalChosen.toString(),
    anyPrize,
    noPrize,
    prizeTiers: distribution
      .filter((d) => d.isPrizeTier)
      .sort((a, b) => b.hits - a.hits),
    distribution,
    multipleBet,
    simpleGamesComparison,
    comparisonRows,
    equiprobabilityAxiom,
  };
}

function buildSimplePrizeSummary(
  universeSize: number,
  drawnCount: number,
  prizeTiers: readonly PrizeTierConfigItem[]
) {
  let frac: FractionBigInt = { num: 0n, den: 1n };
  let secFrac: FractionBigInt = { num: 0n, den: 1n };
  for (const tier of prizeTiers) {
    const pt = hypergeometricDetail(universeSize, drawnCount, drawnCount, tier.hits);
    if (!pt.isImpossible) {
      const f = {
        num: BigInt(pt.exactNumerator),
        den: BigInt(pt.exactDenominator),
      };
      frac = addFractions(frac, f);
      if (!tier.isMainPrize && tier.hits !== drawnCount) {
        secFrac = addFractions(secFrac, f);
      }
    }
  }
  return {
    frac,
    secFrac,
    anyPrizeFloat: bigIntRatioToFloat(frac.num, frac.den),
    secondaryPrizeFloat: bigIntRatioToFloat(secFrac.num, secFrac.den),
  };
}
