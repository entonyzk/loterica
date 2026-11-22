import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * 1. USERS
 * Identificador, Nome, Email, Senha protegida por hash, Data de criação, Status, Nível de acesso.
 * Sincronizado com Firebase Authentication via `uid`.
 */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'pending'
    role: text('role').notNull().default('user'), // 'user' | 'analyst' | 'admin' | 'super_admin'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_role').on(table.role),
    index('idx_users_status').on(table.status),
  ]
);

/**
 * 2. LOTTERY_TYPES
 * Modalidades principais configuráveis (sem duplicar concursos especiais como modalidades independentes).
 */
export const lotteryTypes = pgTable(
  'lottery_types',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    description: text('description').notNull(),
    status: text('status').notNull().default('awaiting_rules'), // 'awaiting_rules' | 'configured' | 'active' | 'archived'
    currentRulesSummary: jsonb('current_rules_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_lottery_types_status').on(table.status)]
);

/**
 * 3. LOTTERY_RULE_VERSIONS
 * Histórico versionado e preservado de regras matemáticas por modalidade.
 * `is_locked` impede alterações retroativas após vinculação a concursos.
 */
export const lotteryRuleVersions = pgTable(
  'lottery_rule_versions',
  {
    id: serial('id').primaryKey(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'cascade' })
      .notNull(),
    versionNumber: integer('version_number').notNull(),
    minNumbersToChoose: integer('min_numbers_to_choose'),
    maxNumbersToChoose: integer('max_numbers_to_choose'),
    numberUniverseMin: integer('number_universe_min'),
    numberUniverseMax: integer('number_universe_max'),
    drawnNumbersCount: integer('drawn_numbers_count'),
    mathModelType: text('math_model_type').notNull().default('hypergeometric_single_group'),
    simpleBetPriceCents: integer('simple_bet_price_cents'),
    priceUpdatedAt: timestamp('price_updated_at', { withTimezone: true }),
    priceSource: text('price_source'),
    prizeTiersConfig: jsonb('prize_tiers_config'),
    specialRules: jsonb('special_rules'),
    extraFieldsConfig: jsonb('extra_fields_config'),
    contestStructure: jsonb('contest_structure'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    officialSource: text('official_source').notNull(),
    isVerified: boolean('is_verified').notNull().default(false),
    isLocked: boolean('is_locked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_lottery_rule_version').on(table.lotteryTypeId, table.versionNumber),
    index('idx_rule_versions_validity').on(table.lotteryTypeId, table.validFrom, table.validTo),
    check('chk_rule_version_positive', sql`${table.versionNumber} >= 1`),
    check(
      'chk_rule_price_non_negative',
      sql`${table.simpleBetPriceCents} IS NULL OR ${table.simpleBetPriceCents} >= 0`
    ),
    check(
      'chk_rule_validity_range',
      sql`${table.validTo} IS NULL OR ${table.validTo} > ${table.validFrom}`
    ),
    check(
      'chk_rule_universe_order',
      sql`${table.numberUniverseMin} IS NULL OR ${table.numberUniverseMax} IS NULL OR ${table.numberUniverseMax} >= ${table.numberUniverseMin}`
    ),
    check(
      'chk_rule_choose_order',
      sql`${table.minNumbersToChoose} IS NULL OR ${table.maxNumbersToChoose} IS NULL OR ${table.maxNumbersToChoose} >= ${table.minNumbersToChoose}`
    ),
  ]
);

/**
 * 4. SPECIAL_EVENTS
 * Concursos especiais vinculados à modalidade principal (Mega da Virada, Lotofácil da Independência, Quina de São João, etc.).
 */
export const specialEvents = pgTable(
  'special_events',
  {
    id: serial('id').primaryKey(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    eventType: text('event_type').notNull(),
    year: integer('year').notNull(),
    inheritsMainRules: boolean('inherits_main_rules').notNull().default(true),
    applicableRules: jsonb('applicable_rules'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_special_event_year').on(table.lotteryTypeId, table.eventType, table.year),
  ]
);

/**
 * 5. DATA_SOURCES
 * Registro de fontes oficiais e status de validação antes de ingerir qualquer concurso.
 */
export const dataSources = pgTable('data_sources', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  sourceType: text('source_type').notNull(), // 'official_api' | 'official_portal' | 'manual_verified'
  endpointUrl: text('endpoint_url').notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  validationStatus: text('validation_status').notNull().default('unverified'), // 'unverified' | 'valid' | 'degraded' | 'offline'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 6. CONTESTS
 * Concursos vinculados à modalidade, versão de regra vigente e fonte oficial verificada.
 */
export const contests = pgTable(
  'contests',
  {
    id: serial('id').primaryKey(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'restrict' })
      .notNull(),
    ruleVersionId: integer('rule_version_id').references(() => lotteryRuleVersions.id, {
      onDelete: 'restrict',
    }),
    specialEventId: integer('special_event_id').references(() => specialEvents.id, {
      onDelete: 'set null',
    }),
    contestNumber: integer('contest_number').notNull(),
    drawDate: timestamp('draw_date', { withTimezone: true }),
    status: text('status').notNull().default('pending_validation'), // 'scheduled' | 'verified' | 'pending_validation'
    resultSourceId: integer('result_source_id').references(() => dataSources.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_contest_lottery_number').on(table.lotteryTypeId, table.contestNumber),
    index('idx_contests_draw_date').on(table.lotteryTypeId, table.drawDate),
    index('idx_contests_status').on(table.status),
    check('chk_contest_number_positive', sql`${table.contestNumber} >= 1`),
  ]
);

/**
 * 7. DRAWN_NUMBERS
 * Dezenas sorteadas e ordem de sorteio por concurso.
 * Restrição única parcial impede dezenas duplicadas no mesmo concurso/grupo em modalidades não posicionais,
 * enquanto `uq_drawn_order_per_group` impede posições duplicadas em modalidades posicionais ou sequenciais.
 */
export const drawnNumbers = pgTable(
  'drawn_numbers',
  {
    id: serial('id').primaryKey(),
    contestId: integer('contest_id')
      .references(() => contests.id, { onDelete: 'cascade' })
      .notNull(),
    drawGroup: integer('draw_group').notNull().default(1),
    isPositional: boolean('is_positional').notNull().default(false),
    numberValue: integer('number_value').notNull(),
    drawOrder: integer('draw_order'),
    extraAttribute: text('extra_attribute'),
  },
  (table) => [
    index('idx_drawn_numbers_contest').on(table.contestId),
    index('idx_drawn_numbers_value').on(table.numberValue),
    uniqueIndex('uq_drawn_non_positional_number')
      .on(table.contestId, table.drawGroup, table.numberValue)
      .where(sql`${table.isPositional} = false`),
    uniqueIndex('uq_drawn_order_per_group').on(table.contestId, table.drawGroup, table.drawOrder),
    check('chk_drawn_number_non_negative', sql`${table.numberValue} >= 0`),
    check('chk_drawn_group_positive', sql`${table.drawGroup} >= 1`),
  ]
);

/**
 * 8. PRIZE_TIERS
 * Faixas de premiação, quantidade de ganhadores e valor por ganhador em centavos.
 */
export const prizeTiers = pgTable(
  'prize_tiers',
  {
    id: serial('id').primaryKey(),
    contestId: integer('contest_id')
      .references(() => contests.id, { onDelete: 'cascade' })
      .notNull(),
    tierName: text('tier_name').notNull(),
    tierOrder: integer('tier_order').notNull(),
    winnersCount: integer('winners_count').notNull().default(0),
    prizeAmountCents: bigint('prize_amount_cents', { mode: 'number' }).notNull().default(0),
  },
  (table) => [
    index('idx_prize_tiers_contest').on(table.contestId),
    uniqueIndex('uq_prize_tier_contest_order').on(table.contestId, table.tierOrder),
    uniqueIndex('uq_prize_tier_contest_name').on(table.contestId, table.tierName),
    check('chk_prize_tier_order_positive', sql`${table.tierOrder} >= 1`),
    check('chk_prize_tier_winners_non_negative', sql`${table.winnersCount} >= 0`),
    check('chk_prize_tier_amount_non_negative', sql`${table.prizeAmountCents} >= 0`),
  ]
);

/**
 * 9. ANALYSIS_HISTORY
 * Registro auditável de análises estatísticas e probabilísticas executadas pelos usuários.
 */
export const analysisHistory = pgTable(
  'analysis_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'restrict' })
      .notNull(),
    analysisType: text('analysis_type').notNull(),
    parameters: jsonb('parameters').notNull(),
    resultSummary: jsonb('result_summary'),
    executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_analysis_history_user').on(table.userId, table.executedAt),
    index('idx_analysis_history_lottery').on(table.lotteryTypeId),
  ]
);

/**
 * 10. SIMULATIONS
 * Simulações Monte Carlo / combinatórias com semente aleatória explícita para reprodutibilidade.
 */
export const simulations = pgTable(
  'simulations',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'restrict' })
      .notNull(),
    method: text('method').notNull(),
    iterationsCount: integer('iterations_count').notNull(),
    parameters: jsonb('parameters').notNull(),
    randomSeed: text('random_seed').notNull(),
    status: text('status').notNull().default('planned'), // 'planned' | 'queued' | 'running' | 'completed' | 'failed'
    summaryResults: jsonb('summary_results'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_simulations_user').on(table.userId, table.createdAt),
    index('idx_simulations_status').on(table.status),
    check('chk_simulations_iterations_positive', sql`${table.iterationsCount} >= 1`),
  ]
);

/**
 * 11. STRATEGIES
 * Definições versionadas de estratégias matemáticas para backtesting transparente.
 */
export const strategies = pgTable('strategies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  mathematicalMethod: text('mathematical_method').notNull(),
  version: text('version').notNull(),
  parametersSchema: jsonb('parameters_schema').notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 12. BACKTEST_RUNS
 * Execuções históricas de estratégias sobre intervalos definidos de concursos.
 */
export const backtestRuns = pgTable(
  'backtest_runs',
  {
    id: serial('id').primaryKey(),
    strategyId: integer('strategy_id')
      .references(() => strategies.id, { onDelete: 'cascade' })
      .notNull(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'restrict' })
      .notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    contestsCount: integer('contests_count').notNull(),
    outcomeSummary: jsonb('outcome_summary').notNull(),
    statisticalMetrics: jsonb('statistical_metrics').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_backtest_strategy').on(table.strategyId, table.lotteryTypeId),
    check('chk_backtest_contests_positive', sql`${table.contestsCount} >= 1`),
    check('chk_backtest_period_valid', sql`${table.periodEnd} >= ${table.periodStart}`),
  ]
);

/**
 * 13. USER_BETS
 * Registro de combinações escolhidas pelo usuário e valor investido para conferência e gestão.
 */
export const userBets = pgTable(
  'user_bets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    lotteryTypeId: integer('lottery_type_id')
      .references(() => lotteryTypes.id, { onDelete: 'restrict' })
      .notNull(),
    contestId: integer('contest_id').references(() => contests.id, { onDelete: 'set null' }),
    chosenCombinations: jsonb('chosen_combinations').notNull(),
    amountSpentCents: integer('amount_spent_cents').notNull().default(0),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_bets_user').on(table.userId, table.recordedAt),
    check('chk_user_bets_amount_non_negative', sql`${table.amountSpentCents} >= 0`),
  ]
);

/**
 * 14. AUDIT_LOGS
 * Trilha de auditoria imutável para operações críticas e administrativas.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorUid: text('actor_uid'),
    operation: text('operation').notNull(),
    targetEntity: text('target_entity').notNull(),
    targetId: text('target_id'),
    changeDetails: jsonb('change_details').notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_logs_created').on(table.createdAt),
    index('idx_audit_logs_entity').on(table.targetEntity, table.operation),
  ]
);

// --- Drizzle Relations ---

export const usersRelations = relations(users, ({ many }) => ({
  analyses: many(analysisHistory),
  simulations: many(simulations),
  bets: many(userBets),
  strategies: many(strategies),
  backtestRuns: many(backtestRuns),
  auditLogs: many(auditLogs),
}));

export const lotteryTypesRelations = relations(lotteryTypes, ({ many }) => ({
  ruleVersions: many(lotteryRuleVersions),
  specialEvents: many(specialEvents),
  contests: many(contests),
  analyses: many(analysisHistory),
  simulations: many(simulations),
  backtestRuns: many(backtestRuns),
  userBets: many(userBets),
}));

export const lotteryRuleVersionsRelations = relations(lotteryRuleVersions, ({ one, many }) => ({
  lotteryType: one(lotteryTypes, {
    fields: [lotteryRuleVersions.lotteryTypeId],
    references: [lotteryTypes.id],
  }),
  contests: many(contests),
}));

export const specialEventsRelations = relations(specialEvents, ({ one, many }) => ({
  lotteryType: one(lotteryTypes, {
    fields: [specialEvents.lotteryTypeId],
    references: [lotteryTypes.id],
  }),
  contests: many(contests),
}));

export const contestsRelations = relations(contests, ({ one, many }) => ({
  lotteryType: one(lotteryTypes, {
    fields: [contests.lotteryTypeId],
    references: [lotteryTypes.id],
  }),
  ruleVersion: one(lotteryRuleVersions, {
    fields: [contests.ruleVersionId],
    references: [lotteryRuleVersions.id],
  }),
  specialEvent: one(specialEvents, {
    fields: [contests.specialEventId],
    references: [specialEvents.id],
  }),
  resultSource: one(dataSources, {
    fields: [contests.resultSourceId],
    references: [dataSources.id],
  }),
  drawnNumbers: many(drawnNumbers),
  prizeTiers: many(prizeTiers),
  userBets: many(userBets),
}));

export const drawnNumbersRelations = relations(drawnNumbers, ({ one }) => ({
  contest: one(contests, {
    fields: [drawnNumbers.contestId],
    references: [contests.id],
  }),
}));

export const prizeTiersRelations = relations(prizeTiers, ({ one }) => ({
  contest: one(contests, {
    fields: [prizeTiers.contestId],
    references: [contests.id],
  }),
}));

export const strategiesRelations = relations(strategies, ({ one, many }) => ({
  creator: one(users, {
    fields: [strategies.createdByUserId],
    references: [users.id],
  }),
  backtestRuns: many(backtestRuns),
}));

export const backtestRunsRelations = relations(backtestRuns, ({ one }) => ({
  strategy: one(strategies, {
    fields: [backtestRuns.strategyId],
    references: [strategies.id],
  }),
  lotteryType: one(lotteryTypes, {
    fields: [backtestRuns.lotteryTypeId],
    references: [lotteryTypes.id],
  }),
  user: one(users, {
    fields: [backtestRuns.userId],
    references: [users.id],
  }),
}));
