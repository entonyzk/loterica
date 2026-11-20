import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../../../src/db/index.ts';
import { lotteryRuleVersions, lotteryTypes } from '../../../src/db/schema.ts';

export interface ModalityRecord {
  id: number;
  code: string;
  name: string;
  status: string;
}

export interface ModalityRuleVersionRecord {
  id: number;
  lotteryTypeId: number;
  versionNumber: number;
  minNumbersToChoose: number | null;
  maxNumbersToChoose: number | null;
  numberUniverseMin: number | null;
  numberUniverseMax: number | null;
  drawnNumbersCount: number | null;
  officialSource: string;
  isVerified: boolean;
  isLocked: boolean;
  validFrom: Date;
  validTo: Date | null;
}

export interface ModalityRuleRepository {
  findLotteryById(id: number): Promise<ModalityRecord | null>;
  findLotteryByCode(code: string): Promise<ModalityRecord | null>;
  findRuleVersionsByLotteryId(lotteryTypeId: number): Promise<ModalityRuleVersionRecord[]>;
}

export const postgresModalityRuleRepository: ModalityRuleRepository = {
  async findLotteryById(id: number) {
    const rows = await db
      .select({
        id: lotteryTypes.id,
        code: lotteryTypes.code,
        name: lotteryTypes.name,
        status: lotteryTypes.status,
      })
      .from(lotteryTypes)
      .where(eq(lotteryTypes.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async findLotteryByCode(code: string) {
    const rows = await db
      .select({
        id: lotteryTypes.id,
        code: lotteryTypes.code,
        name: lotteryTypes.name,
        status: lotteryTypes.status,
      })
      .from(lotteryTypes)
      .where(eq(lotteryTypes.code, code))
      .limit(1);
    return rows[0] ?? null;
  },

  async findRuleVersionsByLotteryId(lotteryTypeId: number) {
    return db
      .select({
        id: lotteryRuleVersions.id,
        lotteryTypeId: lotteryRuleVersions.lotteryTypeId,
        versionNumber: lotteryRuleVersions.versionNumber,
        minNumbersToChoose: lotteryRuleVersions.minNumbersToChoose,
        maxNumbersToChoose: lotteryRuleVersions.maxNumbersToChoose,
        numberUniverseMin: lotteryRuleVersions.numberUniverseMin,
        numberUniverseMax: lotteryRuleVersions.numberUniverseMax,
        drawnNumbersCount: lotteryRuleVersions.drawnNumbersCount,
        officialSource: lotteryRuleVersions.officialSource,
        isVerified: lotteryRuleVersions.isVerified,
        isLocked: lotteryRuleVersions.isLocked,
        validFrom: lotteryRuleVersions.validFrom,
        validTo: lotteryRuleVersions.validTo,
      })
      .from(lotteryRuleVersions)
      .where(eq(lotteryRuleVersions.lotteryTypeId, lotteryTypeId))
      .orderBy(desc(lotteryRuleVersions.versionNumber), asc(lotteryRuleVersions.id));
  },
};

export class ModalityValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = 'ModalityValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface TheoreticalInputPayload {
  mode?: 'free' | 'modality';
  lotteryId?: number;
  lotteryCode: string;
  ruleVersionId?: number;
  universeSize?: number;
  drawnCount?: number;
  chosenCount: number;
}

export interface ValidatedTheoreticalExecution {
  mode: 'free' | 'modality';
  lotteryCode: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  modalityContext:
    | {
        mode: 'free';
        rulesVerified: false;
      }
    | {
        mode: 'modality';
        lotteryId: number;
        lotteryCode: string;
        lotteryName: string;
        ruleVersionId: number;
        ruleVersionNumber: number;
        universeMin: number;
        universeMax: number;
        universeSize: number;
        drawnCount: number;
        minNumbersToChoose: number;
        maxNumbersToChoose: number;
        chosenCount: number;
        officialSource: string;
        isVerified: true;
      };
}

function hasCompleteMathematicalRule(rule: ModalityRuleVersionRecord): boolean {
  return (
    rule.numberUniverseMin !== null &&
    rule.numberUniverseMax !== null &&
    rule.drawnNumbersCount !== null &&
    rule.minNumbersToChoose !== null &&
    rule.maxNumbersToChoose !== null
  );
}

export async function resolveAndValidateTheoreticalInput(
  input: TheoreticalInputPayload,
  repository: ModalityRuleRepository = postgresModalityRuleRepository
): Promise<ValidatedTheoreticalExecution> {
  const hasExplicitLotteryCode = input.lotteryCode !== 'generic-reference';
  const hasModalityIdentifiers =
    input.lotteryId !== undefined || input.ruleVersionId !== undefined || hasExplicitLotteryCode;

  if (input.mode === 'free' && hasModalityIdentifiers) {
    throw new ModalityValidationError(
      'MODALITY_MODE_CONFLICT',
      400,
      'O modo Parâmetros Livres não pode ser vinculado a ID, código ou versão de regra de modalidade.'
    );
  }

  const isModalityMode = input.mode === 'modality' || hasModalityIdentifiers;

  if (!isModalityMode) {
    if (input.universeSize === undefined || input.drawnCount === undefined) {
      throw new ModalityValidationError(
        'VALIDATION_ERROR',
        400,
        'No modo Parâmetros Livres, universeSize, drawnCount e chosenCount são obrigatórios.'
      );
    }
    if (input.drawnCount > input.universeSize || input.chosenCount > input.universeSize) {
      throw new ModalityValidationError(
        'COMBINATORIAL_VALIDATION_ERROR',
        400,
        'drawnCount e chosenCount devem ser menores ou iguais a universeSize.'
      );
    }
    return {
      mode: 'free',
      lotteryCode: 'generic-reference',
      universeSize: input.universeSize,
      drawnCount: input.drawnCount,
      chosenCount: input.chosenCount,
      modalityContext: {
        mode: 'free',
        rulesVerified: false,
      },
    };
  }

  // Modo Por Modalidade: exige vínculo estrito com o catálogo e versão de regras verificada
  if (input.lotteryId === undefined && !hasExplicitLotteryCode) {
    throw new ModalityValidationError(
      'VALIDATION_ERROR',
      400,
      'Informe lotteryId ou lotteryCode válido da modalidade para cálculo vinculado ao catálogo.'
    );
  }

  const lottery =
    input.lotteryId !== undefined
      ? await repository.findLotteryById(input.lotteryId)
      : await repository.findLotteryByCode(input.lotteryCode);

  if (!lottery) {
    throw new ModalityValidationError(
      'LOTTERY_NOT_FOUND',
      404,
      'Modalidade não encontrada no catálogo oficial.'
    );
  }

  if (input.lotteryId !== undefined && lottery.id !== input.lotteryId) {
    throw new ModalityValidationError(
      'MODALITY_MISMATCH',
      400,
      'ID da modalidade diverge do registro no banco de dados.'
    );
  }

  if (hasExplicitLotteryCode && lottery.code !== input.lotteryCode) {
    throw new ModalityValidationError(
      'MODALITY_MISMATCH',
      400,
      `Código "${input.lotteryCode}" não corresponde à modalidade #${lottery.id} ("${lottery.code}").`
    );
  }

  const ruleVersions = await repository.findRuleVersionsByLotteryId(lottery.id);

  let selectedRule: ModalityRuleVersionRecord | undefined;
  if (input.ruleVersionId !== undefined) {
    selectedRule = ruleVersions.find((r) => r.id === input.ruleVersionId);
    if (!selectedRule) {
      throw new ModalityValidationError(
        'RULE_VERSION_NOT_FOUND',
        404,
        `Versão de regra #${input.ruleVersionId} não pertence à modalidade "${lottery.code}".`
      );
    }
    if (!selectedRule.isVerified || !hasCompleteMathematicalRule(selectedRule)) {
      throw new ModalityValidationError(
        'MODALITY_AWAITING_CONFIGURATION',
        409,
        `Modalidade "${lottery.name}" aguarda configuração: a versão de regras #${selectedRule.id} ainda não foi oficialmente verificada.`
      );
    }
  } else {
    const verifiedComplete = ruleVersions.filter(
      (r) => r.isVerified && hasCompleteMathematicalRule(r)
    );
    selectedRule =
      verifiedComplete.find((r) => r.validTo === null) ?? verifiedComplete[0];

    if (!selectedRule) {
      throw new ModalityValidationError(
        'MODALITY_AWAITING_CONFIGURATION',
        409,
        `Modalidade "${lottery.name}" aguarda configuração oficial de regras verificadas (Etapa 2). Parâmetros arbitrários não são aceitos como regras oficiais.`
      );
    }
  }

  const universeMin = selectedRule.numberUniverseMin!;
  const universeMax = selectedRule.numberUniverseMax!;
  const expectedUniverseSize = universeMax - universeMin + 1;
  const expectedDrawnCount = selectedRule.drawnNumbersCount!;
  const minChoose = selectedRule.minNumbersToChoose!;
  const maxChoose = selectedRule.maxNumbersToChoose!;

  if (
    expectedUniverseSize < 1 ||
    expectedUniverseSize > 1000 ||
    expectedDrawnCount < 0 ||
    expectedDrawnCount > expectedUniverseSize ||
    minChoose < 0 ||
    maxChoose < minChoose ||
    maxChoose > expectedUniverseSize
  ) {
    throw new ModalityValidationError(
      'INVALID_RULE_DEFINITION',
      422,
      `A versão de regras v${selectedRule.versionNumber} da modalidade "${lottery.code}" possui definição matemática inconsistente.`
    );
  }

  if (input.universeSize !== undefined && input.universeSize !== expectedUniverseSize) {
    throw new ModalityValidationError(
      'MODALITY_PARAMETER_MISMATCH',
      400,
      `Universo numérico informado (${input.universeSize}) diverge da regra verificada v${selectedRule.versionNumber} de "${lottery.name}" (${expectedUniverseSize}).`
    );
  }

  if (input.drawnCount !== undefined && input.drawnCount !== expectedDrawnCount) {
    throw new ModalityValidationError(
      'MODALITY_PARAMETER_MISMATCH',
      400,
      `Quantidade sorteada informada (${input.drawnCount}) diverge da regra verificada v${selectedRule.versionNumber} de "${lottery.name}" (${expectedDrawnCount}).`
    );
  }

  if (input.chosenCount < minChoose || input.chosenCount > maxChoose) {
    throw new ModalityValidationError(
      'MODALITY_CHOSEN_OUT_OF_RANGE',
      400,
      `Quantidade de dezenas escolhidas (${input.chosenCount}) fora dos limites oficiais [${minChoose}..${maxChoose}] da regra v${selectedRule.versionNumber} de "${lottery.name}".`
    );
  }

  return {
    mode: 'modality',
    lotteryCode: lottery.code,
    universeSize: expectedUniverseSize,
    drawnCount: expectedDrawnCount,
    chosenCount: input.chosenCount,
    modalityContext: {
      mode: 'modality',
      lotteryId: lottery.id,
      lotteryCode: lottery.code,
      lotteryName: lottery.name,
      ruleVersionId: selectedRule.id,
      ruleVersionNumber: selectedRule.versionNumber,
      universeMin,
      universeMax,
      universeSize: expectedUniverseSize,
      drawnCount: expectedDrawnCount,
      minNumbersToChoose: minChoose,
      maxNumbersToChoose: maxChoose,
      chosenCount: input.chosenCount,
      officialSource: selectedRule.officialSource,
      isVerified: true,
    },
  };
}
