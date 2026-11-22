// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { computeSpecializedModalityAnalysis } from '../../src/modules/probabilities/specialized';

function buildPythonSpecializedSnakePayload(params: {
  lotteryCode: string;
  universeSize: number;
  drawnCount: number;
  chosenCount: number;
  simpleGamesCount?: number;
  simpleBets?: number[][];
}) {
  const analysis = computeSpecializedModalityAnalysis({
    lotteryCode: params.lotteryCode,
    universeSize: params.universeSize,
    drawnCount: params.drawnCount,
    chosenCount: params.chosenCount,
    minNumbersToChoose: params.drawnCount,
    maxNumbersToChoose: params.universeSize === 60 ? 20 : 10,
    prizeTiers:
      params.drawnCount === 6
        ? [
            { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
            { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
            { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
          ]
        : [
            { hits: 5, tierName: 'Quina Histórica', tierOrder: 1, isMainPrize: true },
            { hits: 4, tierName: 'Quadra Histórica', tierOrder: 2, isMainPrize: false },
          ],
    simpleBetPriceCents: 600,
    priceUpdatedAt: '2025-07-10T00:00:00.000Z',
    priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx',
    simpleGamesCount: params.simpleGamesCount,
    simpleBets: params.simpleBets,
  });

  const toMem = (m: typeof analysis.anyPrize.memory) => ({
    title: m.title,
    formula: m.formula,
    substituted_parameters: m.substitutedParameters,
    raw_numerator: m.rawNumerator,
    raw_denominator: m.rawDenominator,
    simplified_fraction: m.simplifiedFraction,
    decimal_probability: m.decimalProbability,
    percentage_formatted: m.percentageFormatted,
    scientific_notation: m.scientificNotation,
    odds_one_in: m.oddsOneIn,
    plain_explanation: m.plainExplanation,
  });

  const toHit = (h: (typeof analysis.distribution)[number]) => ({
    hits: h.hits,
    probability: h.probability,
    raw_numerator: h.rawNumerator,
    raw_denominator: h.rawDenominator,
    exact_numerator: h.exactNumerator,
    exact_denominator: h.exactDenominator,
    scientific_notation: h.scientificNotation,
    is_impossible: h.isImpossible,
    precision_classification: h.precisionClassification,
    odds_one_in: h.oddsOneIn,
    tier_name: h.tierName,
    is_prize_tier: h.isPrizeTier,
    is_main_prize: h.isMainPrize,
    embedded_simple_wins: h.embeddedSimpleWins.map((w) => ({
      tier_name: w.tierName,
      target_hits: w.targetHits,
      winning_simple_combinations: w.winningSimpleCombinations,
    })),
    ...(h.expectedEmbeddedWinsPerDraw !== undefined
      ? { expected_embedded_wins_per_draw: h.expectedEmbeddedWinsPerDraw }
      : {}),
    ...(h.atLeastOneWin
      ? {
          at_least_one_win: {
            triggering_volante_hits: h.atLeastOneWin.triggeringVolanteHits,
            probability: h.atLeastOneWin.probability,
            raw_numerator: h.atLeastOneWin.rawNumerator,
            raw_denominator: h.atLeastOneWin.rawDenominator,
            exact_numerator: h.atLeastOneWin.exactNumerator,
            exact_denominator: h.atLeastOneWin.exactDenominator,
            scientific_notation: h.atLeastOneWin.scientificNotation,
            odds_one_in: h.atLeastOneWin.oddsOneIn,
            precision_classification: h.atLeastOneWin.precisionClassification,
            memory: toMem(h.atLeastOneWin.memory),
          },
        }
      : {}),
    memory: toMem(h.memory),
  });

  const distByHits: Record<string, ReturnType<typeof toHit>> = {};
  for (const d of analysis.distribution) {
    distByHits[String(d.hits)] = toHit(d);
  }
  const union = analysis.simpleGamesComparison.exactUnionAnalysis;

  return {
    lottery_code: analysis.lotteryCode,
    math_model_type: analysis.mathModelType,
    universe_size: analysis.universeSize,
    drawn_count: analysis.drawnCount,
    chosen_count: analysis.chosenCount,
    total_space_simple_combinations: analysis.totalSpaceSimpleCombinations,
    total_combinations: analysis.totalChosenCombinations,
    distribution_by_hits: distByHits,
    distribution_sum: analysis.distribution.reduce((a, b) => a + b.probability, 0),
    distribution_sum_tolerance: 1e-9,
    prize_tiers: analysis.prizeTiers.map(toHit),
    any_prize: {
      label: analysis.anyPrize.label,
      probability: analysis.anyPrize.probability,
      raw_numerator: analysis.anyPrize.rawNumerator,
      raw_denominator: analysis.anyPrize.rawDenominator,
      exact_numerator: analysis.anyPrize.exactNumerator,
      exact_denominator: analysis.anyPrize.exactDenominator,
      scientific_notation: analysis.anyPrize.scientificNotation,
      odds_one_in: analysis.anyPrize.oddsOneIn,
      precision_classification: analysis.anyPrize.precisionClassification,
      memory: toMem(analysis.anyPrize.memory),
    },
    no_prize: {
      label: analysis.noPrize.label,
      probability: analysis.noPrize.probability,
      raw_numerator: analysis.noPrize.rawNumerator,
      raw_denominator: analysis.noPrize.rawDenominator,
      exact_numerator: analysis.noPrize.exactNumerator,
      exact_denominator: analysis.noPrize.exactDenominator,
      scientific_notation: analysis.noPrize.scientificNotation,
      odds_one_in: analysis.noPrize.oddsOneIn,
      precision_classification: analysis.noPrize.precisionClassification,
      memory: toMem(analysis.noPrize.memory),
    },
    multiple_bet: {
      chosen_count: analysis.multipleBet.chosenCount,
      drawn_count: analysis.multipleBet.drawnCount,
      is_multiple_bet: analysis.multipleBet.isMultipleBet,
      equivalent_simple_bets: analysis.multipleBet.equivalentSimpleBets,
      simple_bet_price_cents: analysis.multipleBet.simpleBetPriceCents,
      total_cost_cents: analysis.multipleBet.totalCostCents,
      price_updated_at: analysis.multipleBet.priceUpdatedAt,
      price_source: analysis.multipleBet.priceSource,
      combinatorial_coverage: {
        numerator: analysis.multipleBet.combinatorialCoverage.numerator,
        denominator: analysis.multipleBet.combinatorialCoverage.denominator,
        simplified_numerator: analysis.multipleBet.combinatorialCoverage.simplifiedNumerator,
        simplified_denominator: analysis.multipleBet.combinatorialCoverage.simplifiedDenominator,
        probability: analysis.multipleBet.combinatorialCoverage.probability,
        scientific_notation: analysis.multipleBet.combinatorialCoverage.scientificNotation,
        odds_one_in: analysis.multipleBet.combinatorialCoverage.oddsOneIn,
      },
    },
    simple_games_comparison: {
      simple_games_count: analysis.simpleGamesComparison.simpleGamesCount,
      simple_bet_price_cents: analysis.simpleGamesComparison.simpleBetPriceCents,
      total_cost_cents: analysis.simpleGamesComparison.totalCostCents,
      top_prize_exact: {
        numerator: analysis.simpleGamesComparison.topPrizeExact.numerator,
        denominator: analysis.simpleGamesComparison.topPrizeExact.denominator,
        simplified_numerator: analysis.simpleGamesComparison.topPrizeExact.simplifiedNumerator,
        simplified_denominator: analysis.simpleGamesComparison.topPrizeExact.simplifiedDenominator,
        probability: analysis.simpleGamesComparison.topPrizeExact.probability,
        scientific_notation: analysis.simpleGamesComparison.topPrizeExact.scientificNotation,
        odds_one_in: analysis.simpleGamesComparison.topPrizeExact.oddsOneIn,
      },
      expected_winning_games_per_draw: analysis.simpleGamesComparison.expectedWinningGamesPerDraw,
      expected_secondary_winning_games_per_draw:
        analysis.simpleGamesComparison.expectedSecondaryWinningGamesPerDraw,
      secondary_prize_status: analysis.simpleGamesComparison.secondaryPrizeStatus,
      overlap_dependency_notice: analysis.simpleGamesComparison.overlapDependencyNotice,
      exact_union_analysis: union
        ? {
            games_count: union.gamesCount,
            pairwise_overlap_summary: {
              pair_count: union.pairwiseOverlapSummary.pairCount,
              min_overlap: union.pairwiseOverlapSummary.minOverlap,
              max_overlap: union.pairwiseOverlapSummary.maxOverlap,
              avg_overlap: union.pairwiseOverlapSummary.avgOverlap,
              disjoint_pairs_count: union.pairwiseOverlapSummary.disjointPairsCount,
            },
            main_prize_union: {
              raw_numerator: union.mainPrizeUnion.rawNumerator,
              raw_denominator: union.mainPrizeUnion.rawDenominator,
              exact_numerator: union.mainPrizeUnion.exactNumerator,
              exact_denominator: union.mainPrizeUnion.exactDenominator,
              probability: union.mainPrizeUnion.probability,
              scientific_notation: union.mainPrizeUnion.scientificNotation,
              odds_one_in: union.mainPrizeUnion.oddsOneIn,
            },
            any_prize_union: {
              raw_numerator: union.anyPrizeUnion.rawNumerator,
              raw_denominator: union.anyPrizeUnion.rawDenominator,
              exact_numerator: union.anyPrizeUnion.exactNumerator,
              exact_denominator: union.anyPrizeUnion.exactDenominator,
              probability: union.anyPrizeUnion.probability,
              scientific_notation: union.anyPrizeUnion.scientificNotation,
              odds_one_in: union.anyPrizeUnion.oddsOneIn,
              memory: toMem(union.anyPrizeUnion.memory),
            },
            secondary_prize_union: {
              raw_numerator: union.secondaryPrizeUnion.rawNumerator,
              raw_denominator: union.secondaryPrizeUnion.rawDenominator,
              exact_numerator: union.secondaryPrizeUnion.exactNumerator,
              exact_denominator: union.secondaryPrizeUnion.exactDenominator,
              probability: union.secondaryPrizeUnion.probability,
              scientific_notation: union.secondaryPrizeUnion.scientificNotation,
              odds_one_in: union.secondaryPrizeUnion.oddsOneIn,
              memory: toMem(union.secondaryPrizeUnion.memory),
            },
          }
        : null,
      illustrative_independent_approximation: {
        value: analysis.simpleGamesComparison.illustrativeIndependentApproximation.value,
        is_exact: false,
        warning: analysis.simpleGamesComparison.illustrativeIndependentApproximation.warning,
      },
      equiprobability_notice: analysis.simpleGamesComparison.equiprobabilityNotice,
    },
    comparison_rows: analysis.comparisonRows.map((r) => ({
      chosen_count: r.chosenCount,
      is_selected: r.isSelected,
      equivalent_simple_bets: r.equivalentSimpleBets,
      total_cost_cents: r.totalCostCents,
      total_space_combinations: r.totalSpaceCombinations,
      main_prize_hits: r.mainPrizeHits,
      main_prize_probability: r.mainPrizeProbability,
      main_prize_odds_one_in: r.mainPrizeOddsOneIn,
      any_prize_probability: r.anyPrizeProbability,
      any_prize_odds_one_in: r.anyPrizeOddsOneIn,
      no_prize_probability: r.noPrizeProbability,
      coverage_factor_vs_minimum: r.coverageFactorVsMinimum,
    })),
    axiom_notice: analysis.equiprobabilityAxiom,
    execution_source: 'python_fastapi_engine',
    engine_status: 'verified_combinatorics',
  };
}

function installFetchMock(options?: {
  withVerifiedRule?: boolean;
  pythonSpecializedUnavailable?: boolean;
}) {
  const withVerifiedRule = options?.withVerifiedRule ?? false;
  const pythonSpecializedUnavailable = options?.pythonSpecializedUnavailable ?? false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/math/python/specialized')) {
        if (pythonSpecializedUnavailable) {
          return new Response(
            JSON.stringify({
              error: 'MATH_ENGINE_UNAVAILABLE',
              message: 'Motor matemático Python indisponível no momento.',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
        const payload = buildPythonSpecializedSnakePayload({
          lotteryCode: reqBody.lotteryCode ?? 'mega-sena',
          universeSize: reqBody.universeSize ?? 60,
          drawnCount: reqBody.drawnCount ?? 6,
          chosenCount: reqBody.chosenCount ?? 6,
          simpleGamesCount: reqBody.simpleGamesCount,
          simpleBets: reqBody.simpleBets,
        });
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/lotteries/1')) {
        return new Response(
          JSON.stringify({
            id: 1,
            name: 'Mega-Sena',
            code: 'mega-sena',
            description: 'Modalidade numérica principal',
            status: withVerifiedRule ? 'active' : 'awaiting_rules',
            ruleVersions: withVerifiedRule
              ? [
                  {
                    id: 9,
                    versionNumber: 0,
                    minNumbersToChoose: 5,
                    maxNumbersToChoose: 10,
                    numberUniverseMin: 1,
                    numberUniverseMax: 50,
                    drawnNumbersCount: 5,
                    mathModelType: 'hypergeometric_single_group',
                    simpleBetPriceCents: 600,
                    officialSource: 'Regra Histórica Teste',
                    isVerified: true,
                    isLocked: true,
                    validFrom: '2018-01-01T00:00:00.000Z',
                    validTo: '2025-12-31T23:59:59.000Z',
                  },
                  {
                    id: 10,
                    versionNumber: 1,
                    minNumbersToChoose: 6,
                    maxNumbersToChoose: 20,
                    numberUniverseMin: 1,
                    numberUniverseMax: 60,
                    drawnNumbersCount: 6,
                    mathModelType: 'hypergeometric_single_group',
                    simpleBetPriceCents: 600,
                    priceUpdatedAt: '2025-07-10T00:00:00.000Z',
                    priceSource: 'https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx',
                    prizeTiersConfig: [
                      { hits: 6, tierName: 'Sena', tierOrder: 1, isMainPrize: true },
                      { hits: 5, tierName: 'Quina', tierOrder: 2, isMainPrize: false },
                      { hits: 4, tierName: 'Quadra', tierOrder: 3, isMainPrize: false },
                    ],
                    officialSource: 'Fonte Verificada Teste',
                    isVerified: true,
                    isLocked: false,
                    validFrom: '2026-01-01T00:00:00.000Z',
                    validTo: null,
                  },
                  {
                    id: 12,
                    versionNumber: 2,
                    minNumbersToChoose: 6,
                    maxNumbersToChoose: 15,
                    numberUniverseMin: 1,
                    numberUniverseMax: 70,
                    drawnNumbersCount: 6,
                    officialSource: 'Regra Futura Teste',
                    isVerified: true,
                    isLocked: false,
                    validFrom: '2099-01-01T00:00:00.000Z',
                    validTo: null,
                  },
                ]
              : [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/lotteries')) {
        return new Response(
          JSON.stringify({
            total: 1,
            rulesVerified: withVerifiedRule,
            items: [
              {
                id: 1,
                name: 'Mega-Sena',
                code: 'mega-sena',
                description: 'Modalidade numérica principal',
                status: withVerifiedRule ? 'active' : 'awaiting_rules',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/contests')) {
        return new Response(
          JSON.stringify({ total: 0, hasVerifiedSourceData: false, items: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/health')) {
        return new Response(
          JSON.stringify({
            status: 'operational',
            axiom:
              'Em sorteios justos e independentes, resultados anteriores não alteram a probabilidade matemática dos próximos resultados.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ paths: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  installFetchMock({ withVerifiedRule: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Unitários UI — Responsividade e Laboratório Matemático', () => {
  it('renderiza navegação desktop, barra inferior mobile com safe-area e alvos >= 44px', () => {
    render(<App />);

    const desktopNav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(desktopNav).toBeInTheDocument();

    const mobileNav = screen.getByRole('navigation', { name: 'Navegação rápida móvel' });
    expect(mobileNav).toBeInTheDocument();
    expect(mobileNav.className).toContain('lg:hidden');
    expect(mobileNav.className).toContain('pb-[env(safe-area-inset-bottom)]');

    const mobileButtons = mobileNav.querySelectorAll('button');
    expect(mobileButtons.length).toBe(5);
    for (const btn of mobileButtons) {
      expect(btn.className).toContain('min-h-[44px]');
    }

    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();
  });

  it('exibe detalhes expansíveis dos cálculos no modo livre e bloqueia modalidade sem regra verificada', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    expect(
      await screen.findByRole('heading', { name: 'Laboratório Matemático' })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: /Comparação entre Quantidades de Dezenas/i })
    ).toBeInTheDocument();

    const expandBtn = screen.getByRole('button', {
      name: /Detalhes matemáticos para 5 acertos/i,
    });
    fireEvent.click(expandBtn);

    expect(screen.getByText(/Numerador exato:/i)).toBeInTheDocument();
    expect(screen.getByText(/Denominador exato:/i)).toBeInTheDocument();
    expect(screen.getByText(/Fração simplificada \(MDC\):/i)).toBeInTheDocument();
    expect(screen.getByText(/P\(X=5\) = \[C\(k, h\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Por Modalidade' }));
    expect(
      await screen.findByText(/Modalidade aguardando configuração oficial/i)
    ).toBeInTheDocument();
  });

  it('consulta /api/math/python/specialized no modo Por Modalidade e respeita vigência temporal', async () => {
    installFetchMock({ withVerifiedRule: true });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    await screen.findByRole('heading', { name: 'Laboratório Matemático' });

    fireEvent.click(screen.getByRole('tab', { name: 'Por Modalidade' }));
    expect(
      await screen.findByText(/Regra v1 \(ID #10\) carregada automaticamente:/i)
    ).toBeInTheDocument();

    const combinationsMatches = await screen.findAllByText('50.063.860');
    expect(combinationsMatches.length).toBeGreaterThan(0);

    const fetchMock = vi.mocked(globalThis.fetch);
    const specializedCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/api/math/python/specialized')
    );
    expect(specializedCall).toBeDefined();
    const sentSpecialized = JSON.parse(String((specializedCall![1] as RequestInit).body));
    expect(sentSpecialized).toMatchObject({
      mode: 'modality',
      lotteryId: 1,
      lotteryCode: 'mega-sena',
      ruleVersionId: 10,
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 6,
    });

    // Alternar referência temporal para data histórica (2021) carrega regra histórica #9 (v0)
    fireEvent.change(screen.getByLabelText('Referência temporal da regra'), {
      target: { value: 'date' },
    });
    fireEvent.change(screen.getByLabelText('Data de referência da regra'), {
      target: { value: '2021-06-15' },
    });
    expect(
      await screen.findByText(/Regra v0 \(ID #9\) carregada automaticamente:/i)
    ).toBeInTheDocument();
  });

  it('exibe clareza A/B/C nas múltiplas, aviso de sobreposição e cálculo de união exata via Python', async () => {
    installFetchMock({ withVerifiedRule: true });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    await screen.findByRole('heading', { name: 'Laboratório Matemático' });

    fireEvent.click(screen.getByRole('tab', { name: 'Por Modalidade' }));
    expect(
      await screen.findByText(/Regra v1 \(ID #10\) carregada automaticamente:/i)
    ).toBeInTheDocument();

    expect(await screen.findByText(/Probabilidade de Premiação/i)).toBeInTheDocument();
    expect(screen.getByText(/Prob\. de Não Premiar/i)).toBeInTheDocument();
    expect(screen.getByText(/A\. P\(H_volante = h\)/i)).toBeInTheDocument();
    expect(screen.getByText(/C\. P\(≥ 1 aposta na faixa\)/i)).toBeInTheDocument();

    const memButtons = screen.getAllByRole('button', { name: 'Memória' });
    fireEvent.click(memButtons[0]);
    expect(
      await screen.findByText(/Memória de Cálculo Racional Exato \(BigInt\)/i)
    ).toBeInTheDocument();

    // Aba Apostas Simples vs. Múltiplas: exibe dependência de sobreposição e permite informar combinações
    fireEvent.click(screen.getByRole('tab', { name: 'Apostas Simples vs. Múltiplas' }));
    expect(
      await screen.findByRole('heading', { name: /Calculadora de Apostas Simples vs\. Múltiplas/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Depende da sobreposição \(informe as combinações abaixo\)/i)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Combinações simples explícitas'), {
      target: { value: '01 02 03 04 05 06\n07 08 09 10 11 12' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Calcular União Exata \(Python\)/i }));

    expect(await screen.findByText(/União exata \(qualquer\):/i)).toBeInTheDocument();
    expect(screen.getByText(/União exata \(secundário\):/i)).toBeInTheDocument();
    expect(screen.getByText(/Estrutura de Sobreposição \(2 jogos\)/i)).toBeInTheDocument();

    // Aba Comparador Matemático
    fireEvent.click(screen.getByRole('tab', { name: 'Comparador Matemático' }));
    expect(
      await screen.findByRole('heading', { name: /Comparador Matemático \(Mega-Sena\)/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Princípio de Equiprobabilidade:/i)).toBeInTheDocument();
  });

  it('exibe erro explícito de indisponibilidade do motor Python sem fallback local silencioso', async () => {
    installFetchMock({ withVerifiedRule: true, pythonSpecializedUnavailable: true });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    await screen.findByRole('heading', { name: 'Laboratório Matemático' });

    fireEvent.click(screen.getByRole('tab', { name: 'Por Modalidade' }));
    expect(
      await screen.findByText(/Motor Matemático Especializado Indisponível \(MATH_ENGINE_UNAVAILABLE\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhum cálculo foi simulado ou substituído localmente no navegador/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Consultar Motor Python Novamente/i })).toBeInTheDocument();
    expect(screen.queryByText(/Probabilidade de Premiação/i)).not.toBeInTheDocument();
  });
});
