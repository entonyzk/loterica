import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../../../src/db/index.ts';
import { contests, lotteryRuleVersions, lotteryTypes } from '../../../src/db/schema.ts';
import {
  classifyRuleTemporalStatus,
  hasCompleteRuleParameters,
  selectActiveVerifiedRuleVersion,
} from '../../../src/modules/probabilities/rule-validity.ts';

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

export interface ContestReferenceRecord {
  id: number;
  lotteryTypeId: number;
  ruleVersionId: number | null;
  contestNumber: number;
  drawDate: Date | null;
  status: string;
}

export interface ModalityRuleRepository {
  findLotteryById(id: number): Promise<ModalityRecord | null>;
  findLotteryByCode(code: string): Promise<ModalityRecord | null>;
  findRuleVersionsByLotteryId(lotteryTypeId: number): Promise<ModalityRuleVersionRecord[]>;
  findContestById?(id: number): Promise<ContestReferenceRecord | null>;
  findContestByLotteryAndNumber?(
    lotteryTypeId: number,
    contestNumber: number
  ): Promise<ContestReferenceRecord | null>;
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

  async findContestById(id: number) {
    const rows = await db
      .select({
        id: contests.id,
        lotteryTypeId: contests.lotteryTypeId,
        ruleVersionId: contests.ruleVersionId,
        contestNumber: contests.contestNumber,
        drawDate: contests.drawDate,
        status: contests.status,
      })
      .from(contests)
      .where(eq(contests.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async findContestByLotteryAndNumber(lotteryTypeId: number, contestNumber: number) {
    const rows = await db
      .select({
        id: contests.id,
        lotteryTypeId: contests.lotteryTypeId,
        ruleVersionId: contests.ruleVersionId,
        contestNumber: contests.contestNumber,
        drawDate: contests.drawDate,
        status: contests.status,
      })
      .from(contests)
      .where(
        and(
          eq(contests.lotteryTypeId, lotteryTypeId),
          eq(contests.contestNumber, contestNumber)
        )
      )
      .limit(1);
    return rows[0] ?? null;
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

export type ReferenceDateSource =
  | 'current_timestamp'
  | 'explicit_reference_date'
  | 'historical_contest';

export interface TheoreticalInputPayload {
  mode?: 'free' | 'modality';
  lotteryId?: number;
  lotteryCode: string;
  ruleVersionId?: number;
  contestId?: number;
  contestNumber?: number;
  referenceDate?: string;
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
        referenceDate: string;
      }
    | {
        mode: 'modality';
        lotteryId: number;
        lotteryCode: string;
        lotteryName: string;
        ruleVersionId: number;
        ruleVersionNumber: number;
        ruleValidFrom: string;
        ruleValidTo: string | null;
        referenceDate: string;
        referenceSource: ReferenceDateSource;
        contestId: number | null;
        contestNumber: number | null;
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

function parseExplicitReferenceDate(raw: string): Date {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ModalityValidationError(
      'INVALID_REFERENCE_DATE',
      400,
      `Data de referência inválida: "${raw}". Utilize formato ISO-8601 válido.`
    );
  }
  return parsed;
}

export async function resolveAndValidateTheoreticalInput(
  input: TheoreticalInputPayload,
  repository: ModalityRuleRepository = postgresModalityRuleRepository
): Promise<ValidatedTheoreticalExecution> {
  const hasExplicitLotteryCode = input.lotteryCode !== 'generic-reference';
  const hasModalityIdentifiers =
    input.lotteryId !== undefined ||
    input.ruleVersionId !== undefined ||
    input.contestId !== undefined ||
    input.contestNumber !== undefined ||
    hasExplicitLotteryCode;

  if (input.mode === 'free' && hasModalityIdentifiers) {
    throw new ModalityValidationError(
      'MODALITY_MODE_CONFLICT',
      400,
      'O modo Parâmetros Livres não pode ser vinculado a ID, código, concurso ou versão de regra de modalidade.'
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
    const freeRefDate = input.referenceDate
      ? parseExplicitReferenceDate(input.referenceDate)
      : new Date();

    return {
      mode: 'free',
      lotteryCode: 'generic-reference',
      universeSize: input.universeSize,
      drawnCount: input.drawnCount,
      chosenCount: input.chosenCount,
      modalityContext: {
        mode: 'free',
        rulesVerified: false,
        referenceDate: freeRefDate.toISOString(),
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

  // Resolução temporal (atual, data explícita ou concurso histórico)
  let effectiveReferenceDate: Date;
  let referenceSource: ReferenceDateSource;
  let targetRuleVersionId = input.ruleVersionId;
  let contestRecord: ContestReferenceRecord | null = null;

  if (input.contestId !== undefined || input.contestNumber !== undefined) {
    if (input.contestId !== undefined) {
      if (!repository.findContestById) {
        throw new ModalityValidationError(
          'CONTEST_LOOKUP_UNAVAILABLE',
          500,
          'Repositório não suporta consulta de concurso histórico por ID.'
        );
      }
      contestRecord = await repository.findContestById(input.contestId);
    } else if (input.contestNumber !== undefined) {
      if (!repository.findContestByLotteryAndNumber) {
        throw new ModalityValidationError(
          'CONTEST_LOOKUP_UNAVAILABLE',
          500,
          'Repositório não suporta consulta de concurso histórico por número.'
        );
      }
      contestRecord = await repository.findContestByLotteryAndNumber(
        lottery.id,
        input.contestNumber
      );
    }

    if (!contestRecord) {
      throw new ModalityValidationError(
        'CONTEST_NOT_FOUND',
        404,
        'Concurso histórico não encontrado para a modalidade informada.'
      );
    }

    if (contestRecord.lotteryTypeId !== lottery.id) {
      throw new ModalityValidationError(
        'CONTEST_MODALITY_MISMATCH',
        400,
        `Concurso #${contestRecord.id} não pertence à modalidade "${lottery.code}".`
      );
    }

    if (
      input.contestNumber !== undefined &&
      contestRecord.contestNumber !== input.contestNumber
    ) {
      throw new ModalityValidationError(
        'CONTEST_MISMATCH',
        400,
        `Número do concurso (${input.contestNumber}) diverge do registro #${contestRecord.id} (${contestRecord.contestNumber}).`
      );
    }

    if (contestRecord.drawDate) {
      if (input.referenceDate !== undefined) {
        const parsedExplicit = parseExplicitReferenceDate(input.referenceDate);
        if (Math.abs(parsedExplicit.getTime() - contestRecord.drawDate.getTime()) > 1000) {
          throw new ModalityValidationError(
            'REFERENCE_DATE_CONFLICT',
            400,
            'A data de referência informada diverge da data oficial do concurso histórico.'
          );
        }
      }
      effectiveReferenceDate = contestRecord.drawDate;
    } else if (input.referenceDate !== undefined) {
      effectiveReferenceDate = parseExplicitReferenceDate(input.referenceDate);
    } else {
      throw new ModalityValidationError(
        'CONTEST_MISSING_DRAW_DATE',
        422,
        `Concurso ${contestRecord.contestNumber} não possui data de sorteio registrada para validar vigência temporal.`
      );
    }

    if (contestRecord.ruleVersionId !== null) {
      if (
        targetRuleVersionId !== undefined &&
        targetRuleVersionId !== contestRecord.ruleVersionId
      ) {
        throw new ModalityValidationError(
          'RULE_VERSION_CONTEST_MISMATCH',
          400,
          `A versão de regra #${targetRuleVersionId} diverge da versão vinculada ao concurso ${contestRecord.contestNumber} (#${contestRecord.ruleVersionId}).`
        );
      }
      targetRuleVersionId = contestRecord.ruleVersionId;
    }

    referenceSource = 'historical_contest';
  } else if (input.referenceDate !== undefined) {
    effectiveReferenceDate = parseExplicitReferenceDate(input.referenceDate);
    referenceSource = 'explicit_reference_date';
  } else {
    effectiveReferenceDate = new Date();
    referenceSource = 'current_timestamp';
  }

  const ruleVersions = await repository.findRuleVersionsByLotteryId(lottery.id);

  let selectedRule: ModalityRuleVersionRecord | undefined;
  if (targetRuleVersionId !== undefined) {
    selectedRule = ruleVersions.find((r) => r.id === targetRuleVersionId);
    if (!selectedRule) {
      throw new ModalityValidationError(
        'RULE_VERSION_NOT_FOUND',
        404,
        `Versão de regra #${targetRuleVersionId} não pertence à modalidade "${lottery.code}".`
      );
    }

    if (!selectedRule.isVerified || !hasCompleteRuleParameters(selectedRule)) {
      throw new ModalityValidationError(
        'MODALITY_AWAITING_CONFIGURATION',
        409,
        `Modalidade "${lottery.name}" aguarda configuração: a versão de regras #${selectedRule.id} ainda não foi oficialmente verificada.`
      );
    }

    const temporalStatus = classifyRuleTemporalStatus(selectedRule, effectiveReferenceDate);
    if (temporalStatus === 'future') {
      throw new ModalityValidationError(
        'RULE_VERSION_FUTURE',
        409,
        `A versão de regra v${selectedRule.versionNumber} (#${selectedRule.id}) possui vigência futura a partir de ${selectedRule.validFrom.toISOString()} (referência: ${effectiveReferenceDate.toISOString()}).`
      );
    }
    if (temporalStatus === 'expired') {
      throw new ModalityValidationError(
        'RULE_VERSION_EXPIRED',
        409,
        `A versão de regra v${selectedRule.versionNumber} (#${selectedRule.id}) expirou em ${selectedRule.validTo?.toISOString()} (referência: ${effectiveReferenceDate.toISOString()}).`
      );
    }
  } else {
    selectedRule =
      selectActiveVerifiedRuleVersion(ruleVersions, effectiveReferenceDate) ?? undefined;

    if (!selectedRule) {
      const hasAnyVerified = ruleVersions.some(
        (r) => r.isVerified && hasCompleteRuleParameters(r)
      );
      if (hasAnyVerified) {
        throw new ModalityValidationError(
          'RULE_NOT_EFFECTIVE_AT_DATE',
          409,
          `Nenhuma versão de regra verificada para "${lottery.name}" está vigente na data de referência ${effectiveReferenceDate.toISOString()}. Regras futuras ou expiradas não são aplicadas.`
        );
      }
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
      ruleValidFrom: selectedRule.validFrom.toISOString(),
      ruleValidTo: selectedRule.validTo ? selectedRule.validTo.toISOString() : null,
      referenceDate: effectiveReferenceDate.toISOString(),
      referenceSource,
      contestId: contestRecord ? contestRecord.id : null,
      contestNumber: contestRecord ? contestRecord.contestNumber : null,
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
