import { z } from 'zod';

/**
 * Cliente de integração com o Motor Matemático em Python (FastAPI / NumPy / SciPy / Pandas)
 * e utilitários combinatórios determinísticos locais em Node.js (BigInt).
 *
 * Separação estrita:
 *  - `computeLocalTheoreticalDistribution`: executa localmente em Node.js (BigInt exato).
 *  - `requestPythonTheoreticalProbability` / `checkPythonEngineHealth`: comunica-se via HTTP real
 *    com o microsserviço Python FastAPI (`MATH_ENGINE_URL` e `MATH_ENGINE_TIMEOUT_MS`).
 *    Falhas do serviço Python NUNCA são mascaradas como resultados matemáticos válidos.
 */

export const MATHEMATICAL_INDEPENDENCE_AXIOM =
  'Em sorteios justos e independentes, resultados anteriores não alteram a probabilidade matemática dos próximos resultados.';

export const DISTRIBUTION_SUM_TOLERANCE = 1e-9;

export type PrecisionClassification =
  | 'exact'
  | 'exact_rational_with_float_approximation';

export interface RationalProbabilityResult {
  hits: number;
  probability: number;
  rawNumerator: string;
  rawDenominator: string;
  exactNumerator: string;
  exactDenominator: string;
  scientificNotation: string;
  oddsOneIn: string | null;
  isImpossible: boolean;
  precisionClassification: PrecisionClassification;
}

export interface MathEngineStatus {
  mode: 'external_microservice';
  configuredUrl: string | null;
  timeoutMs: number;
  availableInLocalSandbox: boolean;
  reason: string;
}

export class MathEngineError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MathEngineError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function getMathEngineTimeoutMs(): number {
  const raw = Number(process.env.MATH_ENGINE_TIMEOUT_MS ?? 5000);
  if (!Number.isFinite(raw) || raw < 100) return 5000;
  return Math.min(Math.floor(raw), 60000);
}

export function getMathEngineArchitectureStatus(): MathEngineStatus {
  const configuredUrl = process.env.MATH_ENGINE_URL?.trim() || null;
  return {
    mode: 'external_microservice',
    configuredUrl,
    timeoutMs: getMathEngineTimeoutMs(),
    availableInLocalSandbox: false,
    reason:
      'O ambiente padrão Node.js do Google AI Studio não inclui NumPy/SciPy/Pandas/FastAPI; o motor Python em /math_engine comunica-se via HTTP em MATH_ENGINE_URL.',
  };
}

function assertValidInteger(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new Error(`Parâmetro "${label}" deve ser um número inteiro seguro.`);
  }
}

export function validateCombinatorialParams(
  universeSize: number,
  drawnCount: number,
  chosenCount: number
): void {
  assertValidInteger(universeSize, 'universeSize');
  assertValidInteger(drawnCount, 'drawnCount');
  assertValidInteger(chosenCount, 'chosenCount');

  if (universeSize < 1 || universeSize > 1000) {
    throw new Error('universeSize deve estar entre 1 e 1000.');
  }
  if (drawnCount < 0 || drawnCount > universeSize) {
    throw new Error('drawnCount deve estar entre 0 e universeSize.');
  }
  if (chosenCount < 0 || chosenCount > universeSize) {
    throw new Error('chosenCount deve estar entre 0 e universeSize.');
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

/**
 * Combinatória exata C(n, k) em BigInt sem overflow ou perda de precisão.
 */
export function exactCombinationsBigInt(n: number, k: number): bigint {
  assertValidInteger(n, 'n');
  assertValidInteger(k, 'k');
  if (n < 1 || k < 0 || k > n) {
    throw new Error('Parâmetros combinatórios inválidos: exige-se n >= 1 e 0 <= k <= n.');
  }
  const effectiveK = Math.min(k, n - k);
  let numerator = 1n;
  let denominator = 1n;
  for (let i = 1n; i <= BigInt(effectiveK); i++) {
    numerator *= BigInt(n) - i + 1n;
    denominator *= i;
  }
  return numerator / denominator;
}

/**
 * Converte fração BigInt (0 <= num <= den, den > 0) para IEEE-754 float preservando
 * toda a mantissa de 53 bits via normalização binária (sem truncamento em 1e-12).
 */
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

/**
 * Converte razão positiva (num / den) em notação científica decimal exata sem depender de float.
 */
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

/**
 * Probabilidade hipergeométrica detalhada (fração racional bruta + simplificada + float IEEE-754 + notação científica).
 */
export function hypergeometricDetail(
  universeSize: number,
  drawnCount: number,
  chosenCount: number,
  hits: number
): RationalProbabilityResult {
  validateCombinatorialParams(universeSize, drawnCount, chosenCount);
  assertValidInteger(hits, 'hits');

  const total = exactCombinationsBigInt(universeSize, chosenCount);

  const isImpossible =
    hits < 0 ||
    hits > Math.min(drawnCount, chosenCount) ||
    chosenCount - hits > universeSize - drawnCount;

  if (isImpossible) {
    return {
      hits,
      probability: 0,
      rawNumerator: '0',
      rawDenominator: total.toString(),
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

  const divisor = gcdBigInt(favorable, total);
  const num = favorable / divisor;
  const den = total / divisor;

  const prob = bigIntRatioToFloat(num, den);
  const oddsRounded = (den + num / 2n) / num;

  return {
    hits,
    probability: prob,
    rawNumerator: favorable.toString(),
    rawDenominator: total.toString(),
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

export function computeLocalTheoreticalDistribution(
  universeSize: number,
  drawnCount: number,
  chosenCount: number
) {
  validateCombinatorialParams(universeSize, drawnCount, chosenCount);
  const totalCombinations = exactCombinationsBigInt(universeSize, chosenCount);
  const maxHits = Math.min(drawnCount, chosenCount);
  const distribution: RationalProbabilityResult[] = [];

  for (let h = 0; h <= maxHits; h++) {
    distribution.push(hypergeometricDetail(universeSize, drawnCount, chosenCount, h));
  }

  return {
    executionSource: 'nodejs_local_bigint' as const,
    totalCombinations: totalCombinations.toString(),
    distribution,
    axiomNotice: MATHEMATICAL_INDEPENDENCE_AXIOM,
  };
}

// --- Comunicação HTTP real com o Microsserviço Python FastAPI ---

const pythonHealthSchema = z.object({
  status: z.string(),
  service: z.string(),
  execution_source: z.literal('python_fastapi_engine').optional(),
  stage: z.string().optional(),
  axiom: z.string().optional(),
});

const pythonHitDetailSchema = z.object({
  hits: z.number().int(),
  probability: z.number().finite().min(0).max(1),
  raw_numerator: z.string().regex(/^\d+$/),
  raw_denominator: z.string().regex(/^\d+$/),
  exact_numerator: z.string().regex(/^\d+$/),
  exact_denominator: z.string().regex(/^\d+$/),
  scientific_notation: z.string(),
  is_impossible: z.boolean(),
  precision_classification: z.enum(['exact', 'exact_rational_with_float_approximation']),
});

const pythonTheoreticalResponseSchema = z.object({
  lottery_code: z.string(),
  universe_size: z.number().int().min(1).max(1000),
  drawn_count: z.number().int().min(0).max(1000),
  chosen_count: z.number().int().min(0).max(1000),
  total_combinations: z.string().regex(/^\d+$/),
  distribution_by_hits: z.record(z.string(), pythonHitDetailSchema),
  distribution_sum: z.number().finite(),
  distribution_sum_tolerance: z.number().positive(),
  axiom_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
  engine_status: z.literal('verified_combinatorics'),
});

export type PythonTheoreticalResponse = z.infer<typeof pythonTheoreticalResponseSchema>;

/**
 * Valida a integridade matemática completa da resposta do motor Python FastAPI.
 * Rejeita qualquer divergência de parâmetros, combinações, numeradores/denominadores ou soma != 1.
 */
export function validatePythonTheoreticalIntegrity(
  params: {
    lotteryCode: string;
    universeSize: number;
    drawnCount: number;
    chosenCount: number;
  },
  data: PythonTheoreticalResponse
): void {
  if (data.lottery_code !== params.lotteryCode) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Divergência de modalidade na resposta Python: esperado "${params.lotteryCode}", recebido "${data.lottery_code}".`
    );
  }

  if (
    data.universe_size !== params.universeSize ||
    data.drawn_count !== params.drawnCount ||
    data.chosen_count !== params.chosenCount
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Parâmetros ecoados pelo motor Python não correspondem aos parâmetros enviados.'
    );
  }

  const expectedTotal = exactCombinationsBigInt(params.universeSize, params.chosenCount);
  const receivedTotal = BigInt(data.total_combinations);
  if (receivedTotal !== expectedTotal) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Total de combinações divergente do esperado C(${params.universeSize}, ${params.chosenCount}).`
    );
  }

  const maxHits = Math.min(params.drawnCount, params.chosenCount);
  const keys = Object.keys(data.distribution_by_hits);
  if (keys.length !== maxHits + 1) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Distribuição incompleta: esperadas ${maxHits + 1} faixas de acerto, recebidas ${keys.length}.`
    );
  }

  let computedFloatSum = 0;
  let exactSumNum = 0n;
  let exactSumDen = 1n;

  for (let h = 0; h <= maxHits; h++) {
    const detail = data.distribution_by_hits[String(h)];
    if (!detail || detail.hits !== h) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Faixa de acertos h=${h} ausente ou inconsistente na resposta Python.`
      );
    }

    const expectedImpossible =
      params.chosenCount - h > params.universeSize - params.drawnCount;
    if (detail.is_impossible !== expectedImpossible) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Classificação de evento impossível inconsistente para h=${h}.`
      );
    }

    const rawNum = BigInt(detail.raw_numerator);
    const rawDen = BigInt(detail.raw_denominator);
    const exactNum = BigInt(detail.exact_numerator);
    const exactDen = BigInt(detail.exact_denominator);

    if (rawDen !== expectedTotal) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Denominador bruto inconsistente para h=${h}.`
      );
    }

    if (exactDen <= 0n) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        `Denominador exato deve ser positivo para h=${h}.`
      );
    }

    if (expectedImpossible) {
      if (
        detail.probability !== 0 ||
        rawNum !== 0n ||
        exactNum !== 0n ||
        exactDen !== 1n ||
        detail.precision_classification !== 'exact'
      ) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Evento impossível h=${h} deve possuir probabilidade exatamente 0/1.`
        );
      }
    } else {
      const expectedFavorable =
        exactCombinationsBigInt(params.drawnCount, h) *
        exactCombinationsBigInt(params.universeSize - params.drawnCount, params.chosenCount - h);

      if (rawNum !== expectedFavorable) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Numerador bruto inconsistente para h=${h}.`
        );
      }

      if (gcdBigInt(exactNum, exactDen) !== 1n) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Fração simplificada não é irredutível para h=${h}.`
        );
      }

      if (exactNum * expectedTotal !== expectedFavorable * exactDen) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Fração exata divergente dos casos favoráveis/totais para h=${h}.`
        );
      }

      const expectedFloat = bigIntRatioToFloat(exactNum, exactDen);
      const floatDiff = Math.abs(detail.probability - expectedFloat);
      const floatTolerance = Math.max(1e-15, Math.abs(expectedFloat) * 1e-9);
      if (floatDiff > floatTolerance) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Probabilidade decimal divergente da fração exata para h=${h}.`
        );
      }
    }

    computedFloatSum += detail.probability;

    // Soma racional exata acumulada: exactSumNum/exactSumDen + exactNum/exactDen
    const combinedNum = exactSumNum * exactDen + exactNum * exactSumDen;
    const combinedDen = exactSumDen * exactDen;
    const g = gcdBigInt(combinedNum, combinedDen);
    exactSumNum = combinedNum / g;
    exactSumDen = combinedDen / g;
  }

  if (exactSumNum !== exactSumDen) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Soma exata das frações racionais da distribuição difere de 1/1.'
    );
  }

  const effectiveTolerance = Math.min(data.distribution_sum_tolerance, DISTRIBUTION_SUM_TOLERANCE);
  if (
    Math.abs(computedFloatSum - 1.0) > effectiveTolerance ||
    Math.abs(data.distribution_sum - 1.0) > effectiveTolerance ||
    Math.abs(computedFloatSum - data.distribution_sum) > effectiveTolerance
  ) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Soma da distribuição (${computedFloatSum}) excede tolerância de ${effectiveTolerance} em relação a 1.0.`
    );
  }
}

function resolvePythonBaseUrl(): string {
  const raw = process.env.MATH_ENGINE_URL?.trim();
  if (!raw) {
    throw new MathEngineError(
      'MATH_ENGINE_NOT_CONFIGURED',
      503,
      'Motor matemático Python não configurado (MATH_ENGINE_URL ausente).'
    );
  }
  try {
    const parsed = new URL(raw);
    return parsed.toString().replace(/\/+$/, '');
  } catch (err) {
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_URL',
      500,
      'Configuração MATH_ENGINE_URL inválida no servidor.',
      { cause: err }
    );
  }
}

export async function checkPythonEngineHealth() {
  const baseUrl = resolvePythonBaseUrl();
  const timeoutMs = getMathEngineTimeoutMs();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('[math-bridge] Python health check failed:', error);
    throw new MathEngineError(
      isTimeout ? 'MATH_ENGINE_TIMEOUT' : 'MATH_ENGINE_UNAVAILABLE',
      isTimeout ? 504 : 503,
      isTimeout
        ? `Motor matemático Python excedeu o tempo limite de ${timeoutMs}ms.`
        : 'Motor matemático Python indisponível no momento.',
      { cause: error }
    );
  }

  if (!response.ok) {
    throw new MathEngineError(
      'MATH_ENGINE_UPSTREAM_ERROR',
      502,
      `Motor matemático Python retornou status HTTP ${response.status}.`
    );
  }

  const rawJson = await response.json().catch((err) => {
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_RESPONSE',
      502,
      'Resposta JSON inválida do motor matemático Python.',
      { cause: err }
    );
  });

  const parsed = pythonHealthSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error('[math-bridge] Invalid Python health payload:', parsed.error.issues);
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_RESPONSE',
      502,
      'Contrato de saúde inválido retornado pelo motor matemático Python.'
    );
  }

  return parsed.data;
}

export async function requestPythonTheoreticalProbability(params: {
  lotteryCode: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
}) {
  validateCombinatorialParams(params.universeSize, params.drawnCount, params.chosenCount);
  const baseUrl = resolvePythonBaseUrl();
  const timeoutMs = getMathEngineTimeoutMs();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/probabilities/theoretical`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        lottery_code: params.lotteryCode,
        universe_size: params.universeSize,
        drawn_count: params.drawnCount,
        chosen_count: params.chosenCount,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('[math-bridge] Python probability request failed:', error);
    throw new MathEngineError(
      isTimeout ? 'MATH_ENGINE_TIMEOUT' : 'MATH_ENGINE_UNAVAILABLE',
      isTimeout ? 504 : 503,
      isTimeout
        ? `Motor matemático Python excedeu o tempo limite de ${timeoutMs}ms.`
        : 'Motor matemático Python indisponível. Resultados não foram simulados localmente.',
      { cause: error }
    );
  }

  if (response.status === 422) {
    const errBody = await response.json().catch(() => ({}));
    throw new MathEngineError(
      'MATH_ENGINE_VALIDATION_ERROR',
      422,
      typeof errBody.detail === 'string'
        ? errBody.detail
        : 'Parâmetros rejeitados pelo motor matemático Python.'
    );
  }

  if (!response.ok) {
    console.error(`[math-bridge] Python upstream HTTP error: ${response.status}`);
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

  const parsed = pythonTheoreticalResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error('[math-bridge] Invalid Python response contract:', parsed.error.issues);
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_RESPONSE',
      502,
      'Resposta do motor matemático Python não atende ao contrato validado.'
    );
  }

  validatePythonTheoreticalIntegrity(params, parsed.data);

  return parsed.data;
}

// --- Integração Especializada (Etapa 2): /v1/probabilities/specialized ---

const pythonCalculationMemorySchema = z.object({
  title: z.string(),
  formula: z.string(),
  substituted_parameters: z.string(),
  raw_numerator: z.string().regex(/^\d+$/),
  raw_denominator: z.string().regex(/^\d+$/),
  simplified_fraction: z.string(),
  decimal_probability: z.number().finite().min(0).max(1),
  percentage_formatted: z.string(),
  scientific_notation: z.string(),
  odds_one_in: z.string().nullable(),
  plain_explanation: z.string(),
});

const pythonTierAtLeastOneWinSchema = z.object({
  triggering_volante_hits: z.array(z.number().int().min(0)),
  probability: z.number().finite().min(0).max(1),
  raw_numerator: z.string().regex(/^\d+$/),
  raw_denominator: z.string().regex(/^\d+$/),
  exact_numerator: z.string().regex(/^\d+$/),
  exact_denominator: z.string().regex(/^\d+$/),
  scientific_notation: z.string(),
  odds_one_in: z.string().nullable(),
  precision_classification: z.enum(['exact', 'exact_rational_with_float_approximation']),
  memory: pythonCalculationMemorySchema,
});

const pythonSpecializedHitSchema = pythonHitDetailSchema.extend({
  odds_one_in: z.string().nullable(),
  tier_name: z.string().nullable(),
  is_prize_tier: z.boolean(),
  is_main_prize: z.boolean(),
  embedded_simple_wins: z.array(
    z.object({
      tier_name: z.string(),
      target_hits: z.number().int().min(0),
      winning_simple_combinations: z.string().regex(/^\d+$/),
    })
  ),
  expected_embedded_wins_per_draw: z.number().finite().min(0).optional(),
  at_least_one_win: pythonTierAtLeastOneWinSchema.optional(),
  memory: pythonCalculationMemorySchema,
});

const pythonAggregateProbSchema = z.object({
  label: z.string(),
  probability: z.number().finite().min(0).max(1),
  raw_numerator: z.string().regex(/^\d+$/),
  raw_denominator: z.string().regex(/^\d+$/),
  exact_numerator: z.string().regex(/^\d+$/),
  exact_denominator: z.string().regex(/^\d+$/),
  scientific_notation: z.string(),
  odds_one_in: z.string().nullable(),
  precision_classification: z.enum(['exact', 'exact_rational_with_float_approximation']),
  memory: pythonCalculationMemorySchema,
});

const pythonUnionEventSchema = z.object({
  raw_numerator: z.string().regex(/^\d+$/),
  raw_denominator: z.string().regex(/^\d+$/),
  exact_numerator: z.string().regex(/^\d+$/),
  exact_denominator: z.string().regex(/^\d+$/),
  probability: z.number().finite().min(0).max(1),
  scientific_notation: z.string(),
  odds_one_in: z.string().nullable(),
  memory: pythonCalculationMemorySchema.optional(),
});

const pythonExactUnionAnalysisSchema = z.object({
  games_count: z.number().int().min(1),
  pairwise_overlap_summary: z.object({
    pair_count: z.number().int().min(0),
    min_overlap: z.number().int().min(0),
    max_overlap: z.number().int().min(0),
    avg_overlap: z.number().finite().min(0),
    disjoint_pairs_count: z.number().int().min(0),
  }),
  main_prize_union: pythonUnionEventSchema,
  any_prize_union: pythonUnionEventSchema.extend({ memory: pythonCalculationMemorySchema }),
  secondary_prize_union: pythonUnionEventSchema.extend({ memory: pythonCalculationMemorySchema }),
});

const pythonSpecializedResponseSchema = z.object({
  lottery_code: z.string(),
  math_model_type: z.string(),
  universe_size: z.number().int().min(1).max(1000),
  drawn_count: z.number().int().min(0).max(1000),
  chosen_count: z.number().int().min(0).max(1000),
  total_space_simple_combinations: z.string().regex(/^\d+$/),
  total_combinations: z.string().regex(/^\d+$/),
  distribution_by_hits: z.record(z.string(), pythonSpecializedHitSchema),
  distribution_sum: z.number().finite(),
  distribution_sum_tolerance: z.number().positive(),
  prize_tiers: z.array(pythonSpecializedHitSchema),
  any_prize: pythonAggregateProbSchema,
  no_prize: pythonAggregateProbSchema,
  multiple_bet: z.object({
    chosen_count: z.number().int(),
    drawn_count: z.number().int(),
    is_multiple_bet: z.boolean(),
    equivalent_simple_bets: z.string().regex(/^\d+$/),
    simple_bet_price_cents: z.number().int().nullable(),
    total_cost_cents: z.string().regex(/^\d+$/).nullable(),
    price_updated_at: z.string().nullable(),
    price_source: z.string().nullable(),
    combinatorial_coverage: z.object({
      numerator: z.string().regex(/^\d+$/),
      denominator: z.string().regex(/^\d+$/),
      simplified_numerator: z.string().regex(/^\d+$/),
      simplified_denominator: z.string().regex(/^\d+$/),
      probability: z.number().finite().min(0).max(1),
      scientific_notation: z.string(),
      odds_one_in: z.string().nullable(),
    }),
  }),
  simple_games_comparison: z.object({
    simple_games_count: z.number().int().min(1),
    simple_bet_price_cents: z.number().int().nullable(),
    total_cost_cents: z.string().regex(/^\d+$/).nullable(),
    top_prize_exact: z.object({
      numerator: z.string().regex(/^\d+$/),
      denominator: z.string().regex(/^\d+$/),
      simplified_numerator: z.string().regex(/^\d+$/),
      simplified_denominator: z.string().regex(/^\d+$/),
      probability: z.number().finite().min(0).max(1),
      scientific_notation: z.string(),
      odds_one_in: z.string().nullable(),
    }),
    expected_winning_games_per_draw: z.number().finite().min(0),
    expected_secondary_winning_games_per_draw: z.number().finite().min(0),
    secondary_prize_status: z.enum(['exact_union_computed', 'requires_explicit_combinations']),
    overlap_dependency_notice: z.string(),
    exact_union_analysis: pythonExactUnionAnalysisSchema.nullable(),
    illustrative_independent_approximation: z.object({
      value: z.number().finite().min(0).max(1),
      is_exact: z.literal(false),
      warning: z.string(),
    }),
    equiprobability_notice: z.string(),
  }),
  comparison_rows: z.array(
    z.object({
      chosen_count: z.number().int(),
      is_selected: z.boolean(),
      equivalent_simple_bets: z.string().regex(/^\d+$/),
      total_cost_cents: z.string().regex(/^\d+$/).nullable(),
      total_space_combinations: z.string().regex(/^\d+$/),
      main_prize_hits: z.number().int(),
      main_prize_probability: z.number().finite().min(0).max(1),
      main_prize_odds_one_in: z.string().nullable(),
      any_prize_probability: z.number().finite().min(0).max(1),
      any_prize_odds_one_in: z.string().nullable(),
      no_prize_probability: z.number().finite().min(0).max(1),
      coverage_factor_vs_minimum: z.string(),
    })
  ),
  axiom_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
  engine_status: z.literal('verified_combinatorics'),
});

export type PythonSpecializedResponse = z.infer<typeof pythonSpecializedResponseSchema>;

export function validatePythonSpecializedIntegrity(
  params: {
    lotteryCode: string;
    mathModelType: string;
    universeSize: number;
    drawnCount: number;
    chosenCount: number;
    simpleBetPriceCents: number | null;
    simpleBetsCount?: number;
  },
  data: PythonSpecializedResponse
): void {
  validatePythonTheoreticalIntegrity(
    {
      lotteryCode: params.lotteryCode,
      universeSize: params.universeSize,
      drawnCount: params.drawnCount,
      chosenCount: params.chosenCount,
    },
    data
  );

  if (data.math_model_type !== params.mathModelType) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      `Modelo matemático divergente: esperado "${params.mathModelType}", recebido "${data.math_model_type}".`
    );
  }

  const expectedSpaceSimple = exactCombinationsBigInt(params.universeSize, params.drawnCount);
  if (BigInt(data.total_space_simple_combinations) !== expectedSpaceSimple) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Espaço amostral simples C(N, k) divergente na resposta especializada Python.'
    );
  }

  const expectedEqSimple =
    params.chosenCount >= params.drawnCount
      ? exactCombinationsBigInt(params.chosenCount, params.drawnCount)
      : 0n;
  if (BigInt(data.multiple_bet.equivalent_simple_bets) !== expectedEqSimple) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Quantidade de combinações simples equivalentes C(m, k) divergente.'
    );
  }

  if (params.simpleBetPriceCents !== null) {
    const expectedCost = expectedEqSimple * BigInt(params.simpleBetPriceCents);
    if (
      data.multiple_bet.total_cost_cents === null ||
      BigInt(data.multiple_bet.total_cost_cents) !== expectedCost
    ) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Custo total calculado pelo motor Python diverge do preço oficial verificado.'
      );
    }
  }

  // Verifica soma exata: any_prize + no_prize == 1/1
  const anyNum = BigInt(data.any_prize.exact_numerator);
  const anyDen = BigInt(data.any_prize.exact_denominator);
  const noNum = BigInt(data.no_prize.exact_numerator);
  const noDen = BigInt(data.no_prize.exact_denominator);
  if (anyDen <= 0n || noDen <= 0n || anyNum * noDen + noNum * anyDen !== anyDen * noDen) {
    throw new MathEngineError(
      'MATH_ENGINE_INTEGRITY_ERROR',
      502,
      'Invariante P(Premiação) + P(Sem Prêmio) = 1/1 violada na resposta Python.'
    );
  }

  // Verifica consistência racional de at_least_one_win em cada faixa de prêmio
  const totalChosen = BigInt(data.total_combinations);
  for (const tier of data.prize_tiers) {
    if (tier.at_least_one_win) {
      const alo = tier.at_least_one_win;
      const rawNum = BigInt(alo.raw_numerator);
      const rawDen = BigInt(alo.raw_denominator);
      const exNum = BigInt(alo.exact_numerator);
      const exDen = BigInt(alo.exact_denominator);
      if (rawDen !== totalChosen || exDen <= 0n) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Denominador inconsistente em at_least_one_win para ${tier.hits} acertos.`
        );
      }
      if (gcdBigInt(exNum, exDen) !== 1n || exNum * rawDen !== rawNum * exDen) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          `Fração irredutível inconsistente em at_least_one_win para ${tier.hits} acertos.`
        );
      }
    }
  }

  // Verifica invariantes da união exata quando simple_bets foram fornecidos
  const union = data.simple_games_comparison.exact_union_analysis;
  if (params.simpleBetsCount !== undefined) {
    if (!union || union.games_count !== params.simpleBetsCount) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Análise de união exata ausente ou divergente da quantidade de combinações enviadas.'
      );
    }
  }
  if (union) {
    const events = [union.main_prize_union, union.any_prize_union, union.secondary_prize_union];
    for (const ev of events) {
      const rNum = BigInt(ev.raw_numerator);
      const rDen = BigInt(ev.raw_denominator);
      const eNum = BigInt(ev.exact_numerator);
      const eDen = BigInt(ev.exact_denominator);
      if (rDen !== expectedSpaceSimple || eDen <= 0n) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          'Denominador divergente de C(N, k) na união exata de apostas simples.'
        );
      }
      if (gcdBigInt(eNum, eDen) !== 1n || eNum * rDen !== rNum * eDen) {
        throw new MathEngineError(
          'MATH_ENGINE_INTEGRITY_ERROR',
          502,
          'Fração simplificada inconsistente na união exata de apostas simples.'
        );
      }
    }
    if (
      BigInt(union.secondary_prize_union.raw_numerator) >
      BigInt(union.any_prize_union.raw_numerator)
    ) {
      throw new MathEngineError(
        'MATH_ENGINE_INTEGRITY_ERROR',
        502,
        'Invariante violada: união secundária excede união de qualquer premiação.'
      );
    }
  }
}

export async function requestPythonSpecializedProbability(params: {
  lotteryCode: string;
  mathModelType: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  prizeTiers: Array<{
    hits: number;
    tierName: string;
    tierOrder: number;
    isMainPrize: boolean;
  }>;
  simpleBetPriceCents: number | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  simpleGamesCount?: number;
  simpleBets?: number[][];
}) {
  validateCombinatorialParams(params.universeSize, params.drawnCount, params.chosenCount);
  const baseUrl = resolvePythonBaseUrl();
  const timeoutMs = getMathEngineTimeoutMs();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/probabilities/specialized`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
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
        ...(params.simpleGamesCount !== undefined
          ? { simple_games_count: params.simpleGamesCount }
          : {}),
        ...(params.simpleBets !== undefined ? { simple_bets: params.simpleBets } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error('[math-bridge] Python specialized request failed:', error);
    throw new MathEngineError(
      isTimeout ? 'MATH_ENGINE_TIMEOUT' : 'MATH_ENGINE_UNAVAILABLE',
      isTimeout ? 504 : 503,
      isTimeout
        ? `Motor matemático Python excedeu o tempo limite de ${timeoutMs}ms.`
        : 'Motor matemático Python indisponível no momento.',
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
        : 'Parâmetros ou modelo rejeitados pelo motor matemático Python.'
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

  const parsed = pythonSpecializedResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error('[math-bridge] Invalid Python specialized response:', parsed.error.issues);
    throw new MathEngineError(
      'MATH_ENGINE_INVALID_RESPONSE',
      502,
      'Resposta especializada do motor Python não atende ao contrato validado.'
    );
  }

  validatePythonSpecializedIntegrity(
    {
      lotteryCode: params.lotteryCode,
      mathModelType: params.mathModelType,
      universeSize: params.universeSize,
      drawnCount: params.drawnCount,
      chosenCount: params.chosenCount,
      simpleBetPriceCents: params.simpleBetPriceCents,
      simpleBetsCount: params.simpleBets?.length,
    },
    parsed.data
  );

  return parsed.data;
}


