import { and, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { dataSources, lotteryRuleVersions, lotteryTypes, specialEvents } from './schema.ts';

export interface VerifiedSeedPrizeTier {
  hits: number;
  tierName: string;
  tierOrder: number;
  isMainPrize: boolean;
}

/**
 * Catálogo oficial estruturado da plataforma LOTUS AI (Etapa 2).
 * - Mega-Sena e Lotofácil possuem versões oficiais verificadas da Caixa Econômica Federal
 *   armazenadas em `lottery_rule_versions` com fonte documental, faixas de premiação,
 *   preço oficial da aposta simples, data de atualização e vigência temporal.
 * - Demais modalidades permanecem como `awaiting_rules` com arquitetura preparada em `mathModelType`,
 *   sem regras ou preços inventados.
 */
export const INITIAL_LOTTERY_CATALOG = [
  {
    code: 'mega-sena',
    name: 'Mega-Sena',
    description:
      'Modalidade principal de 60 dezenas (01 a 60) com sorteio de 6 números e apostas de 6 a 20 dezenas. Regras oficiais Caixa verificadas.',
    status: 'active',
    preparedModelType: 'hypergeometric_single_group',
    verifiedRulesLoaded: true,
  },
  {
    code: 'lotofacil',
    name: 'Lotofácil',
    description:
      'Modalidade de 25 dezenas (01 a 25) com sorteio de 15 números e apostas de 15 a 20 dezenas. Regras oficiais Caixa verificadas.',
    status: 'active',
    preparedModelType: 'hypergeometric_single_group',
    verifiedRulesLoaded: true,
  },
  {
    code: 'quina',
    name: 'Quina',
    description:
      'Modalidade diária com múltiplas faixas de acerto. Arquitetura combinatória preparada aguardando verificação documental de regras.',
    status: 'awaiting_rules',
    preparedModelType: 'hypergeometric_single_group',
    verifiedRulesLoaded: false,
  },
  {
    code: 'lotomania',
    name: 'Lotomania',
    description:
      'Modalidade de universo amplo e faixa de zero acertos. Estrutura relacional pronta aguardando regras verificadas.',
    status: 'awaiting_rules',
    preparedModelType: 'hypergeometric_single_group',
    verifiedRulesLoaded: false,
  },
  {
    code: 'timemania',
    name: 'Timemania',
    description:
      'Modalidade com campo adicional independente (Time do Coração) preparada para modelo multi-grupo / campo adicional.',
    status: 'awaiting_rules',
    preparedModelType: 'extra_field_combinatorial',
    verifiedRulesLoaded: false,
  },
  {
    code: 'dupla-sena',
    name: 'Dupla Sena',
    description:
      'Modalidade com duas extrações por concurso preparada no modelo `multi_extraction` e `contest_structure`.',
    status: 'awaiting_rules',
    preparedModelType: 'multi_extraction',
    verifiedRulesLoaded: false,
  },
  {
    code: 'dia-de-sorte',
    name: 'Dia de Sorte',
    description:
      'Modalidade com campo adicional independente (Mês da Sorte) preparada no modelo `extra_field_combinatorial`.',
    status: 'awaiting_rules',
    preparedModelType: 'extra_field_combinatorial',
    verifiedRulesLoaded: false,
  },
  {
    code: 'super-sete',
    name: 'Super Sete',
    description:
      'Modalidade posicional por 7 colunas (0 a 9) preparada no modelo `positional_columns`.',
    status: 'awaiting_rules',
    preparedModelType: 'positional_columns',
    verifiedRulesLoaded: false,
  },
] as const;

export const VERIFIED_RULE_VERSIONS_SEED: Array<{
  lotteryCode: 'mega-sena' | 'lotofacil';
  versionNumber: number;
  minNumbersToChoose: number;
  maxNumbersToChoose: number;
  numberUniverseMin: number;
  numberUniverseMax: number;
  drawnNumbersCount: number;
  mathModelType: string;
  simpleBetPriceCents: number;
  priceUpdatedAt: Date;
  priceSource: string;
  prizeTiersConfig: VerifiedSeedPrizeTier[];
  contestStructure: Record<string, unknown>;
  specialRules: Record<string, unknown>;
  validFrom: Date;
  validTo: Date | null;
  officialSource: string;
  isVerified: boolean;
  isLocked: boolean;
}> = [
  {
    lotteryCode: 'mega-sena',
    versionNumber: 1,
    minNumbersToChoose: 6,
    maxNumbersToChoose: 20,
    numberUniverseMin: 1,
    numberUniverseMax: 60,
    drawnNumbersCount: 6,
    mathModelType: 'hypergeometric_single_group',
    simpleBetPriceCents: 500,
    priceUpdatedAt: new Date('2023-04-30T00:00:00.000Z'),
    priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx (Tabela oficial Caixa abr/2023 a jul/2025)',
    prizeTiersConfig: [
      { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
      { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
      { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
    ],
    contestStructure: {
      modelType: 'hypergeometric_single_group',
      groupsCount: 1,
      extractionsPerContest: 1,
      isPositional: false,
      supportsMultipleBet: true,
      hasExtraFields: false,
      specialEvents: ['mega_da_virada'],
    },
    specialRules: {
      priceEffectiveReference: 'Vigência histórica até 09/07/2025 (substituída no Concurso 2887)',
      multipleBetCostRule: 'C(m, 6) * simpleBetPriceCents',
    },
    validFrom: new Date('2023-04-30T00:00:00.000Z'),
    validTo: new Date('2025-07-10T00:00:00.000Z'),
    officialSource:
      'Caixa Econômica Federal — Loterias Caixa (Mega-Sena, tabela vigente abr/2023–jul/2025)',
    isVerified: true,
    isLocked: true,
  },
  {
    lotteryCode: 'mega-sena',
    versionNumber: 2,
    minNumbersToChoose: 6,
    maxNumbersToChoose: 20,
    numberUniverseMin: 1,
    numberUniverseMax: 60,
    drawnNumbersCount: 6,
    mathModelType: 'hypergeometric_single_group',
    simpleBetPriceCents: 600,
    priceUpdatedAt: new Date('2025-07-10T00:00:00.000Z'),
    priceSource:
      'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx (Reajuste oficial Caixa — captação a partir de 10/07/2025, Concurso 2887)',
    prizeTiersConfig: [
      { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
      { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
      { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
    ],
    contestStructure: {
      modelType: 'hypergeometric_single_group',
      groupsCount: 1,
      extractionsPerContest: 1,
      isPositional: false,
      supportsMultipleBet: true,
      hasExtraFields: false,
      specialEvents: ['mega_da_virada'],
    },
    specialRules: {
      priceEffectiveReference: 'Concurso 2887 em diante (R$ 6,00 por aposta simples de 6 dezenas)',
      multipleBetCostRule: 'C(m, 6) * simpleBetPriceCents',
    },
    validFrom: new Date('2025-07-10T00:00:00.000Z'),
    validTo: null,
    officialSource:
      'Caixa Econômica Federal — Loterias Caixa (Mega-Sena, captação vigente desde 10/07/2025)',
    isVerified: true,
    isLocked: false,
  },
  {
    lotteryCode: 'lotofacil',
    versionNumber: 1,
    minNumbersToChoose: 15,
    maxNumbersToChoose: 20,
    numberUniverseMin: 1,
    numberUniverseMax: 25,
    drawnNumbersCount: 15,
    mathModelType: 'hypergeometric_single_group',
    simpleBetPriceCents: 300,
    priceUpdatedAt: new Date('2023-04-30T00:00:00.000Z'),
    priceSource:
      'https://loterias.caixa.gov.br/Paginas/Lotofacil.aspx (Tabela oficial Caixa abr/2023 a jul/2025)',
    prizeTiersConfig: [
      { hits: 15, tierName: '15 acertos', tierOrder: 1, isMainPrize: true },
      { hits: 14, tierName: '14 acertos', tierOrder: 2, isMainPrize: false },
      { hits: 13, tierName: '13 acertos', tierOrder: 3, isMainPrize: false },
      { hits: 12, tierName: '12 acertos', tierOrder: 4, isMainPrize: false },
      { hits: 11, tierName: '11 acertos', tierOrder: 5, isMainPrize: false },
    ],
    contestStructure: {
      modelType: 'hypergeometric_single_group',
      groupsCount: 1,
      extractionsPerContest: 1,
      isPositional: false,
      supportsMultipleBet: true,
      hasExtraFields: false,
      specialEvents: ['lotofacil_independencia'],
    },
    specialRules: {
      priceEffectiveReference: 'Vigência histórica até 08/07/2025 (substituída no Concurso 3439)',
      multipleBetCostRule: 'C(m, 15) * simpleBetPriceCents',
    },
    validFrom: new Date('2023-04-30T00:00:00.000Z'),
    validTo: new Date('2025-07-09T00:00:00.000Z'),
    officialSource:
      'Caixa Econômica Federal — Loterias Caixa (Lotofácil, tabela vigente abr/2023–jul/2025)',
    isVerified: true,
    isLocked: true,
  },
  {
    lotteryCode: 'lotofacil',
    versionNumber: 2,
    minNumbersToChoose: 15,
    maxNumbersToChoose: 20,
    numberUniverseMin: 1,
    numberUniverseMax: 25,
    drawnNumbersCount: 15,
    mathModelType: 'hypergeometric_single_group',
    simpleBetPriceCents: 350,
    priceUpdatedAt: new Date('2025-07-09T00:00:00.000Z'),
    priceSource:
      'https://loterias.caixa.gov.br/Paginas/Lotofacil.aspx (Reajuste oficial Caixa — captação a partir de 09/07/2025, Concurso 3439)',
    prizeTiersConfig: [
      { hits: 15, tierName: '15 acertos', tierOrder: 1, isMainPrize: true },
      { hits: 14, tierName: '14 acertos', tierOrder: 2, isMainPrize: false },
      { hits: 13, tierName: '13 acertos', tierOrder: 3, isMainPrize: false },
      { hits: 12, tierName: '12 acertos', tierOrder: 4, isMainPrize: false },
      { hits: 11, tierName: '11 acertos', tierOrder: 5, isMainPrize: false },
    ],
    contestStructure: {
      modelType: 'hypergeometric_single_group',
      groupsCount: 1,
      extractionsPerContest: 1,
      isPositional: false,
      supportsMultipleBet: true,
      hasExtraFields: false,
      specialEvents: ['lotofacil_independencia'],
    },
    specialRules: {
      priceEffectiveReference: 'Concurso 3439 em diante (R$ 3,50 por aposta simples de 15 dezenas)',
      multipleBetCostRule: 'C(m, 15) * simpleBetPriceCents',
    },
    validFrom: new Date('2025-07-09T00:00:00.000Z'),
    validTo: null,
    officialSource:
      'Caixa Econômica Federal — Loterias Caixa (Lotofácil, captação vigente desde 09/07/2025)',
    isVerified: true,
    isLocked: false,
  },
];

export const INITIAL_SPECIAL_EVENTS = [
  {
    lotteryCode: 'mega-sena',
    name: 'Mega da Virada',
    eventType: 'mega_da_virada',
    year: 2026,
    inheritsMainRules: true,
    applicableRules: {
      note: 'Compartilha a mesma estrutura combinatória (60 dezenas, 6 sorteadas, 6 a 20 escolhidas) da Mega-Sena, com regra especial de não acumulação na faixa principal.',
    },
  },
  {
    lotteryCode: 'lotofacil',
    name: 'Lotofácil da Independência',
    eventType: 'lotofacil_independencia',
    year: 2026,
    inheritsMainRules: true,
    applicableRules: {
      note: 'Compartilha a mesma estrutura combinatória (25 dezenas, 15 sorteadas, 15 a 20 escolhidas) da Lotofácil, com regra especial de rateio sem acumulação.',
    },
  },
  {
    lotteryCode: 'quina',
    name: 'Quina de São João',
    eventType: 'quina_sao_joao',
    year: 2026,
    inheritsMainRules: true,
    applicableRules: {
      note: 'Compartilha a mesma estrutura combinatória da Quina; regra oficial será verificada ao ativar a modalidade.',
    },
  },
] as const;

export const INITIAL_DATA_SOURCES = [
  {
    name: 'Loterias Caixa — Portal Oficial',
    sourceType: 'official_portal',
    endpointUrl: 'https://loterias.caixa.gov.br',
    validationStatus: 'valid',
  },
  {
    name: 'API Oficial Loterias Caixa (A Validar Etapa 3)',
    sourceType: 'official_api',
    endpointUrl: 'https://servicebus2.caixa.gov.br/portaldeloterias/api',
    validationStatus: 'unverified',
  },
] as const;

export async function ensureInitialCatalogSeeded() {
  try {
    const existing = await db
      .select({ id: lotteryTypes.id, code: lotteryTypes.code, status: lotteryTypes.status })
      .from(lotteryTypes);
    const codeToRow = new Map(existing.map((r) => [r.code, r]));

    for (const item of INITIAL_LOTTERY_CATALOG) {
      const summary = {
        stage: 'etapa_2_motor_especializado',
        preparedModelType: item.preparedModelType,
        verifiedRulesLoaded: item.verifiedRulesLoaded,
      };
      const existingRow = codeToRow.get(item.code);
      if (!existingRow) {
        const inserted = await db
          .insert(lotteryTypes)
          .values({
            name: item.name,
            code: item.code,
            description: item.description,
            status: item.status,
            currentRulesSummary: summary,
          })
          .onConflictDoNothing({ target: lotteryTypes.code })
          .returning({ id: lotteryTypes.id, code: lotteryTypes.code, status: lotteryTypes.status });

        if (inserted[0]) {
          codeToRow.set(inserted[0].code, inserted[0]);
        }
      } else if (
        existingRow.status !== item.status &&
        (item.code === 'mega-sena' || item.code === 'lotofacil')
      ) {
        await db
          .update(lotteryTypes)
          .set({
            description: item.description,
            status: item.status,
            currentRulesSummary: summary,
            updatedAt: new Date(),
          })
          .where(eq(lotteryTypes.id, existingRow.id));
      }
    }

    // Garante versões verificadas de Mega-Sena e Lotofácil com fonte oficial, preços e vigência
    for (const rule of VERIFIED_RULE_VERSIONS_SEED) {
      const lotteryRow = codeToRow.get(rule.lotteryCode);
      if (!lotteryRow) continue;

      const existingRule = await db
        .select({ id: lotteryRuleVersions.id })
        .from(lotteryRuleVersions)
        .where(
          and(
            eq(lotteryRuleVersions.lotteryTypeId, lotteryRow.id),
            eq(lotteryRuleVersions.versionNumber, rule.versionNumber)
          )
        )
        .limit(1);

      if (!existingRule[0]) {
        await db
          .insert(lotteryRuleVersions)
          .values({
            lotteryTypeId: lotteryRow.id,
            versionNumber: rule.versionNumber,
            minNumbersToChoose: rule.minNumbersToChoose,
            maxNumbersToChoose: rule.maxNumbersToChoose,
            numberUniverseMin: rule.numberUniverseMin,
            numberUniverseMax: rule.numberUniverseMax,
            drawnNumbersCount: rule.drawnNumbersCount,
            mathModelType: rule.mathModelType,
            simpleBetPriceCents: rule.simpleBetPriceCents,
            priceUpdatedAt: rule.priceUpdatedAt,
            priceSource: rule.priceSource,
            prizeTiersConfig: rule.prizeTiersConfig,
            contestStructure: rule.contestStructure,
            specialRules: rule.specialRules,
            validFrom: rule.validFrom,
            validTo: rule.validTo,
            officialSource: rule.officialSource,
            isVerified: rule.isVerified,
            isLocked: rule.isLocked,
          })
          .onConflictDoNothing();
      } else {
        await db
          .update(lotteryRuleVersions)
          .set({
            minNumbersToChoose: rule.minNumbersToChoose,
            maxNumbersToChoose: rule.maxNumbersToChoose,
            numberUniverseMin: rule.numberUniverseMin,
            numberUniverseMax: rule.numberUniverseMax,
            drawnNumbersCount: rule.drawnNumbersCount,
            mathModelType: rule.mathModelType,
            simpleBetPriceCents: rule.simpleBetPriceCents,
            priceUpdatedAt: rule.priceUpdatedAt,
            priceSource: rule.priceSource,
            prizeTiersConfig: rule.prizeTiersConfig,
            contestStructure: rule.contestStructure,
            specialRules: rule.specialRules,
            validFrom: rule.validFrom,
            validTo: rule.validTo,
            officialSource: rule.officialSource,
            isVerified: rule.isVerified,
          })
          .where(eq(lotteryRuleVersions.id, existingRule[0].id));
      }
    }

    for (const evt of INITIAL_SPECIAL_EVENTS) {
      const lotteryRow = codeToRow.get(evt.lotteryCode);
      if (!lotteryRow) continue;

      await db
        .insert(specialEvents)
        .values({
          lotteryTypeId: lotteryRow.id,
          name: evt.name,
          eventType: evt.eventType,
          year: evt.year,
          inheritsMainRules: evt.inheritsMainRules,
          applicableRules: evt.applicableRules,
        })
        .onConflictDoNothing();
    }

    for (const src of INITIAL_DATA_SOURCES) {
      await db
        .insert(dataSources)
        .values({
          name: src.name,
          sourceType: src.sourceType,
          endpointUrl: src.endpointUrl,
          validationStatus: src.validationStatus,
        })
        .onConflictDoNothing({ target: dataSources.name });
    }
  } catch (error) {
    console.error('Database query failed in ensureInitialCatalogSeeded:', error);
    throw new Error('Failed to synchronize initial lottery catalog.', { cause: error });
  }
}
