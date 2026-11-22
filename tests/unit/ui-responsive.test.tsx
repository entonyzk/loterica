// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

function installFetchMock(options?: { withVerifiedRule?: boolean }) {
  const withVerifiedRule = options?.withVerifiedRule ?? false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
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

  it('exibe detalhes expansíveis dos cálculos e tabela de comparação no Laboratório Matemático', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    expect(
      await screen.findByRole('heading', { name: 'Laboratório Matemático' })
    ).toBeInTheDocument();

    // Seção de comparação entre quantidades de dezenas
    expect(
      screen.getByRole('heading', { name: /Comparação entre Quantidades de Dezenas/i })
    ).toBeInTheDocument();

    // Expandir detalhes de uma linha da distribuição
    const expandBtn = screen.getByRole('button', {
      name: /Detalhes matemáticos para 5 acertos/i,
    });
    fireEvent.click(expandBtn);

    expect(screen.getByText(/Numerador exato:/i)).toBeInTheDocument();
    expect(screen.getByText(/Denominador exato:/i)).toBeInTheDocument();
    expect(screen.getByText(/Fração simplificada \(MDC\):/i)).toBeInTheDocument();
    expect(screen.getByText(/P\(X=5\) = \[C\(k, h\)/i)).toBeInTheDocument();

    // Alternar para modo Por Modalidade (sem regras verificadas -> aguardando configuração)
    fireEvent.click(screen.getByRole('tab', { name: 'Por Modalidade' }));
    expect(
      await screen.findByText(/Modalidade aguardando configuração oficial/i)
    ).toBeInTheDocument();
  });

  it('carrega parâmetros automaticamente quando a modalidade possui regra verificada', async () => {
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

    // Aciona motor Python e verifica envio dos identificadores estritos da modalidade
    fireEvent.click(screen.getByRole('button', { name: /Executar via Motor Python/i }));
    const fetchMock = vi.mocked(globalThis.fetch);
    const pythonCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/api/math/python/theoretical')
    );
    expect(pythonCall).toBeDefined();
    const sentBody = JSON.parse(String((pythonCall![1] as RequestInit).body));
    expect(sentBody).toMatchObject({
      mode: 'modality',
      lotteryId: 1,
      lotteryCode: 'mega-sena',
      ruleVersionId: 10,
      universeSize: 60,
      drawnCount: 6,
      chosenCount: 6,
    });
    expect(typeof sentBody.referenceDate).toBe('string');

    // Alternar referência temporal para data histórica (2021) deve carregar regra histórica #9 (v0)
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

  it('exibe calculadora especializada Etapa 2 (faixas, apostas múltiplas, comparador e memória de cálculo)', async () => {
    installFetchMock({ withVerifiedRule: true });
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    await screen.findByRole('heading', { name: 'Laboratório Matemático' });

    fireEvent.click(screen.getByRole('tab', { name: 'Por Modalidade' }));
    expect(
      await screen.findByText(/Regra v1 \(ID #10\) carregada automaticamente:/i)
    ).toBeInTheDocument();

    // KPIs da Etapa 2 e preço oficial
    expect(screen.getByText(/Probabilidade de Premiação/i)).toBeInTheDocument();
    expect(screen.getByText(/Prob\. de Não Premiar/i)).toBeInTheDocument();
    const costMatches = screen.getAllByText(/R\$\s*6,00/);
    expect(costMatches.length).toBeGreaterThan(0);

    // Abrir memória de cálculo da premiação global
    const memButtons = screen.getAllByRole('button', { name: 'Memória' });
    fireEvent.click(memButtons[0]);
    expect(
      await screen.findByText(/Memória de Cálculo Racional Exato \(BigInt\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Fórmula, Substituição & Aproximação Decimal/i)).toBeInTheDocument();

    // Acionar validação especializada no motor Python na aba Probabilidades & Faixas
    fireEvent.click(
      screen.getByRole('button', { name: /Validar Modelo Especializado no Python/i })
    );
    const fetchMock = vi.mocked(globalThis.fetch);
    const specializedCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('/api/math/python/specialized')
    );
    expect(specializedCall).toBeDefined();

    // Alternar para aba Apostas Simples vs. Múltiplas
    fireEvent.click(screen.getByRole('tab', { name: 'Apostas Simples vs. Múltiplas' }));
    expect(
      await screen.findByRole('heading', { name: /Calculadora de Apostas Simples vs\. Múltiplas/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Igualar custo/i })).toBeInTheDocument();

    // Alternar para aba Comparador Matemático
    fireEvent.click(screen.getByRole('tab', { name: 'Comparador Matemático' }));
    expect(
      await screen.findByRole('heading', { name: /Comparador Matemático \(Mega-Sena\)/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Princípio de Equiprobabilidade:/i)).toBeInTheDocument();
  });
});

