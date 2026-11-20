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
                    id: 10,
                    versionNumber: 1,
                    minNumbersToChoose: 6,
                    maxNumbersToChoose: 10,
                    numberUniverseMin: 1,
                    numberUniverseMax: 60,
                    drawnNumbersCount: 6,
                    officialSource: 'Fonte Verificada Teste',
                    isVerified: true,
                    isLocked: false,
                    validFrom: '2026-01-01T00:00:00.000Z',
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
  });
});
