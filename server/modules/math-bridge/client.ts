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

export type PrecisionClassification =
  | 'exact'
  | 'exact_rational_with_float_approximation';

export interface RationalProbabilityResult {
  hits: number;
  probability: number;
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
 * Probabilidade hipergeométrica detalhada (fração racional exata + float IEEE-754 + notação científica).
 */
export function hypergeometricDetail(
  universeSize: number,
  drawnCount: number,
  chosenCount: number,
  hits: number
): RationalProbabilityResult {
  validateCombinatorialParams(universeSize, drawnCount, chosenCount);
  assertValidInteger(hits, 'hits');

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
  probability: z.number().min(0).max(1),
  exact_numerator: z.string().regex(/^\d+$/),
  exact_denominator: z.string().regex(/^\d+$/),
  scientific_notation: z.string(),
  is_impossible: z.boolean(),
  precision_classification: z.enum(['exact', 'exact_rational_with_float_approximation']),
});

const pythonTheoreticalResponseSchema = z.object({
  lottery_code: z.string(),
  total_combinations: z.string().regex(/^\d+$/),
  distribution_by_hits: z.record(z.string(), pythonHitDetailSchema),
  axiom_notice: z.string(),
  execution_source: z.literal('python_fastapi_engine'),
  engine_status: z.literal('verified_combinatorics'),
});

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

  return parsed.data;
}
