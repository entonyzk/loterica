import { db } from './index.ts';
import { dataSources, lotteryTypes, specialEvents } from './schema.ts';

/**
 * Catálogo inicial estrutural das modalidades brasileiras (Etapa 1).
 * ATENÇÃO: Concursos especiais com regras equivalentes às modalidades principais
 * são cadastrados em `special_events` vinculados à modalidade-base, e não como
 * modalidades matematicamente independentes.
 * As regras numéricas oficiais verificadas serão ingeridas na Etapa 2.
 */
export const INITIAL_LOTTERY_CATALOG = [
  {
    code: 'mega-sena',
    name: 'Mega-Sena',
    description:
      'Modalidade principal de sorteio de dezenas em universo discreto. Preparada para receber regras oficiais versionadas e histórico verificado na Etapa 2.',
    status: 'awaiting_rules',
  },
  {
    code: 'lotofacil',
    name: 'Lotofácil',
    description:
      'Modalidade de alta densidade de acertos por volante. Estrutura preparada para versionamento de regras e faixas de premiação na Etapa 2.',
    status: 'awaiting_rules',
  },
  {
    code: 'quina',
    name: 'Quina',
    description:
      'Modalidade diária com múltiplas faixas de acerto. Preparada para ingestão de regras oficiais e concursos históricos na Etapa 2.',
    status: 'awaiting_rules',
  },
  {
    code: 'lotomania',
    name: 'Lotomania',
    description:
      'Modalidade de universo amplo e faixa de zero acertos. Estrutura relacional pronta para regras verificadas na Etapa 2.',
    status: 'awaiting_rules',
  },
  {
    code: 'timemania',
    name: 'Timemania',
    description:
      'Modalidade com campo adicional (Time do Coração) modelado via atributos extras em `drawn_numbers` e `extra_fields_config`.',
    status: 'awaiting_rules',
  },
  {
    code: 'dupla-sena',
    name: 'Dupla Sena',
    description:
      'Modalidade com dois sorteios por concurso. Suporte estrutural previsto em `contest_structure` e `drawn_numbers.draw_order`.',
    status: 'awaiting_rules',
  },
  {
    code: 'dia-de-sorte',
    name: 'Dia de Sorte',
    description:
      'Modalidade com campo adicional (Mês da Sorte) suportado em `extra_fields_config` e `drawn_numbers.extra_attribute`.',
    status: 'awaiting_rules',
  },
  {
    code: 'super-sete',
    name: 'Super Sete',
    description:
      'Modalidade posicional por colunas, modelada via `extra_fields_config` e `drawn_numbers.draw_order`.',
    status: 'awaiting_rules',
  },
] as const;

export const INITIAL_SPECIAL_EVENTS = [
  {
    lotteryCode: 'mega-sena',
    name: 'Mega da Virada',
    eventType: 'mega_da_virada',
    year: 2026,
    inheritsMainRules: true,
    applicableRules: {
      note: 'Compartilha a mesma estrutura combinatória da Mega-Sena; regra especial de não acumulação será verificada na Etapa 2.',
    },
  },
  {
    lotteryCode: 'lotofacil',
    name: 'Lotofácil da Independência',
    eventType: 'lotofacil_independencia',
    year: 2026,
    inheritsMainRules: true,
    applicableRules: {
      note: 'Compartilha a mesma estrutura combinatória da Lotofácil; regra especial de rateio será verificada na Etapa 2.',
    },
  },
  {
    lotteryCode: 'quina',
    name: 'Quina de São João',
    eventType: 'quina_sao_joao',
    year: 2026,
    inheritsMainRules: true,
    applicableRules: {
      note: 'Compartilha a mesma estrutura combinatória da Quina; regra especial de rateio será verificada na Etapa 2.',
    },
  },
] as const;

export const INITIAL_DATA_SOURCES = [
  {
    name: 'Loterias Caixa — Portal Oficial',
    sourceType: 'official_portal',
    endpointUrl: 'https://loterias.caixa.gov.br',
    validationStatus: 'unverified',
  },
  {
    name: 'API Oficial Loterias Caixa (A Validar Etapa 2)',
    sourceType: 'official_api',
    endpointUrl: 'https://servicebus2.caixa.gov.br/portaldeloterias/api',
    validationStatus: 'unverified',
  },
] as const;

export async function ensureInitialCatalogSeeded() {
  try {
    const existing = await db.select({ id: lotteryTypes.id, code: lotteryTypes.code }).from(lotteryTypes);
    const codeToId = new Map(existing.map((r) => [r.code, r.id]));

    for (const item of INITIAL_LOTTERY_CATALOG) {
      if (!codeToId.has(item.code)) {
        const inserted = await db
          .insert(lotteryTypes)
          .values({
            name: item.name,
            code: item.code,
            description: item.description,
            status: item.status,
            currentRulesSummary: {
              stage: 'etapa_1_estrutura',
              verifiedRulesLoaded: false,
            },
          })
          .onConflictDoNothing({ target: lotteryTypes.code })
          .returning({ id: lotteryTypes.id, code: lotteryTypes.code });

        if (inserted[0]) {
          codeToId.set(inserted[0].code, inserted[0].id);
        }
      }
    }

    for (const evt of INITIAL_SPECIAL_EVENTS) {
      const lotteryTypeId = codeToId.get(evt.lotteryCode);
      if (!lotteryTypeId) continue;

      await db
        .insert(specialEvents)
        .values({
          lotteryTypeId,
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
