export type RuleTemporalStatus = 'active' | 'future' | 'expired' | 'unverified';

export interface TemporalRuleCandidate {
  id: number;
  versionNumber: number;
  minNumbersToChoose: number | null;
  maxNumbersToChoose: number | null;
  numberUniverseMin: number | null;
  numberUniverseMax: number | null;
  drawnNumbersCount: number | null;
  isVerified: boolean;
  validFrom: Date | string;
  validTo: Date | string | null;
}

export function toTimestampMs(value: Date | string): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  return Date.parse(value);
}

export function hasCompleteRuleParameters(rule: TemporalRuleCandidate): boolean {
  return (
    rule.numberUniverseMin !== null &&
    rule.numberUniverseMax !== null &&
    rule.drawnNumbersCount !== null &&
    rule.minNumbersToChoose !== null &&
    rule.maxNumbersToChoose !== null
  );
}

/**
 * Avalia o estado temporal de uma versão de regra na data de referência (`[validFrom, validTo)`).
 * - Regra futura: validFrom > referenceDate
 * - Regra expirada: validTo !== null && validTo <= referenceDate
 * - Regra vigente: validFrom <= referenceDate && (validTo === null || validTo > referenceDate)
 */
export function classifyRuleTemporalStatus(
  rule: TemporalRuleCandidate,
  referenceDate: Date = new Date()
): RuleTemporalStatus {
  if (!rule.isVerified || !hasCompleteRuleParameters(rule)) {
    return 'unverified';
  }

  const refMs = referenceDate.getTime();
  const fromMs = toTimestampMs(rule.validFrom);
  if (!Number.isFinite(refMs) || !Number.isFinite(fromMs)) {
    return 'unverified';
  }

  if (fromMs > refMs) {
    return 'future';
  }

  if (rule.validTo !== null && rule.validTo !== undefined) {
    const toMs = toTimestampMs(rule.validTo);
    if (!Number.isFinite(toMs) || toMs <= refMs) {
      return 'expired';
    }
  }

  return 'active';
}

export function isRuleEffectiveAtDate(
  rule: TemporalRuleCandidate,
  referenceDate: Date = new Date()
): boolean {
  return classifyRuleTemporalStatus(rule, referenceDate) === 'active';
}

/**
 * Seleciona deterministicamente a versão de regra verificada e vigente na data de referência.
 * Nunca seleciona regras não verificadas, futuras ou expiradas.
 */
export function selectActiveVerifiedRuleVersion<T extends TemporalRuleCandidate>(
  rules: readonly T[],
  referenceDate: Date = new Date()
): T | null {
  const effective = rules.filter((rule) => isRuleEffectiveAtDate(rule, referenceDate));
  if (effective.length === 0) return null;

  const sorted = [...effective].sort((a, b) => {
    const fromDiff = toTimestampMs(b.validFrom) - toTimestampMs(a.validFrom);
    if (fromDiff !== 0) return fromDiff;
    if (b.versionNumber !== a.versionNumber) return b.versionNumber - a.versionNumber;
    return b.id - a.id;
  });

  return sorted[0] ?? null;
}
