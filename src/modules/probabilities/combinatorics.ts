export type PrecisionClassification =
  | 'exact'
  | 'exact_rational_with_float_approximation';

function assertSafeInt(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new Error(`Parâmetro "${label}" deve ser um inteiro seguro.`);
  }
}

export function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0n ? 1n : x;
}

export function exactCombinationsBigInt(n: number, k: number): bigint {
  assertSafeInt(n, 'n');
  assertSafeInt(k, 'k');
  if (n < 1 || k < 0 || k > n) {
    throw new Error('Parâmetros combinatórios inválidos.');
  }
  const effectiveK = Math.min(k, n - k);
  let num = 1n;
  let den = 1n;
  for (let i = 1n; i <= BigInt(effectiveK); i++) {
    num *= BigInt(n) - i + 1n;
    den *= i;
  }
  return num / den;
}

export function bigIntRatioToFloat(num: bigint, den: bigint): number {
  if (den <= 0n) throw new Error('Denominador deve ser positivo.');
  if (num === 0n) return 0;
  if (num === den) return 1;

  const numBits = num.toString(2).length;
  const denBits = den.toString(2).length;
  const shift = 54 + (denBits - numBits);
  const scaledQuotient = (num << BigInt(shift)) / den;
  return Number(scaledQuotient) * Math.pow(2, -shift);
}

export function bigIntRatioToScientific(num: bigint, den: bigint, significantDigits = 8): string {
  if (num === 0n) return '0';
  if (num === den) return '1';

  const scaleExp = significantDigits + 2;
  let power = 0;
  let scaledNum = num;

  while (scaledNum < den) {
    scaledNum *= 10n;
    power -= 1;
  }
  while (scaledNum >= den * 10n) {
    den *= 10n;
    power += 1;
  }

  const digitsBigInt = (scaledNum * 10n ** BigInt(scaleExp - 1)) / den;
  const digitsStr = digitsBigInt.toString().slice(0, significantDigits);
  const mantissa =
    digitsStr.length > 1 ? `${digitsStr[0]}.${digitsStr.slice(1)}` : digitsStr;
  const sign = power >= 0 ? '+' : '';
  return `${mantissa}e${sign}${power}`;
}

export interface DistributionPoint {
  hits: number;
  probability: number;
  exactNumerator: string;
  exactDenominator: string;
  scientificNotation: string;
  oddsOneIn: string | null;
  isImpossible: boolean;
  precisionClassification: PrecisionClassification;
}

export function hypergeometricDetail(
  universeSize: number,
  drawnCount: number,
  chosenCount: number,
  hits: number
): DistributionPoint {
  assertSafeInt(universeSize, 'universeSize');
  assertSafeInt(drawnCount, 'drawnCount');
  assertSafeInt(chosenCount, 'chosenCount');
  assertSafeInt(hits, 'hits');

  if (universeSize < 1 || drawnCount < 0 || drawnCount > universeSize || chosenCount < 0 || chosenCount > universeSize) {
    throw new Error('Parâmetros combinatórios fora dos limites válidos.');
  }

  const isImpossible =
    hits < 0 ||
    hits > Math.min(drawnCount, chosenCount) ||
    chosenCount - hits > universeSize - drawnCount;

  if (isImpossible) {
    return {
      hits,
      probability: 0,
      exactNumerator: '0',
      exactDenominator: '1',
      scientificNotation: '0',
      oddsOneIn: null,
      isImpossible: true,
      precisionClassification: 'exact',
    };
  }

  const favorable =
    exactCombinationsBigInt(drawnCount, hits) *
    exactCombinationsBigInt(universeSize - drawnCount, chosenCount - hits);
  const total = exactCombinationsBigInt(universeSize, chosenCount);

  const divisor = gcdBigInt(favorable, total);
  const num = favorable / divisor;
  const den = total / divisor;

  const prob = bigIntRatioToFloat(num, den);
  const oddsRounded = (den + num / 2n) / num;

  return {
    hits,
    probability: prob,
    exactNumerator: num.toString(),
    exactDenominator: den.toString(),
    scientificNotation: bigIntRatioToScientific(num, den, 8),
    oddsOneIn: oddsRounded.toString(),
    isImpossible: false,
    precisionClassification:
      num === den ? 'exact' : 'exact_rational_with_float_approximation',
  };
}

export function hypergeometricProbability(
  universeSize: number,
  drawnCount: number,
  chosenCount: number,
  hits: number
): number {
  return hypergeometricDetail(universeSize, drawnCount, chosenCount, hits).probability;
}

export function buildHypergeometricDistribution(
  universeSize: number,
  drawnCount: number,
  chosenCount: number
): DistributionPoint[] {
  const maxHits = Math.min(drawnCount, chosenCount);
  const points: DistributionPoint[] = [];
  for (let h = 0; h <= maxHits; h++) {
    points.push(hypergeometricDetail(universeSize, drawnCount, chosenCount, h));
  }
  return points;
}
