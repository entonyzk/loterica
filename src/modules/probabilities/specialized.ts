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

export interface SpecializedHitPoint extends DistributionPoint {
  tierName: string | null;
  isPrizeTier: boolean;
  isMainPrize: boolean;
  embeddedSimpleWins: EmbeddedMultipleTierWin[];
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
  independentModelAnyPrizeProbability: number;
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
        exactCombinationsBigInt(actualHits, tier.hits) *
        exactCombinationsBigInt(chosenMisses, missNeeded);
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
        title: tierInfo ? `${tierInfo.tierName} (${h} acertos)` : `${h} acertos`,
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

  // Comparação contra q jogos simples distintos
  const maxQ = Number(totalSpaceSimple > 1_000_000n ? 1_000_000n : totalSpaceSimple);
  const requestedQ = params.simpleGamesCount ?? Number(equivalentSimpleBets > 0n ? (equivalentSimpleBets > 100000n ? 100000n : equivalentSimpleBets) : 1n);
  const q = Math.max(1, Math.min(Math.floor(requestedQ), maxQ));

  const simpleDistPoints = buildSimplePrizeSummary(universeSize, drawnCount, prizeTiers);
  const qBig = BigInt(q);
  const simpleTopFrac = reduceFraction(qBig, totalSpaceSimple);
  const simpleTopFloat = bigIntRatioToFloat(simpleTopFrac.num, simpleTopFrac.den);
  const simpleTopOdds = ((simpleTopFrac.den + simpleTopFrac.num / 2n) / simpleTopFrac.num).toString();
  const independentAnyWinProb =
    1 - Math.pow(1 - simpleDistPoints.anyPrizeFloat, q);

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
    independentModelAnyPrizeProbability: independentAnyWinProb,
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
  for (const tier of prizeTiers) {
    const pt = hypergeometricDetail(universeSize, drawnCount, drawnCount, tier.hits);
    if (!pt.isImpossible) {
      frac = addFractions(frac, {
        num: BigInt(pt.exactNumerator),
        den: BigInt(pt.exactDenominator),
      });
    }
  }
  return {
    frac,
    anyPrizeFloat: bigIntRatioToFloat(frac.num, frac.den),
  };
}
