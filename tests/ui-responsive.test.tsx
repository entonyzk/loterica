// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';

// Mock leve apenas de APIs ausentes no JSDOM e chamadas de rede iniciais da UI
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

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/lotteries')) {
        return new Response(
          JSON.stringify({ total: 8, rulesVerified: false, items: [] }),
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LOTUS AI — Responsividade e Navegação da Interface', () => {
  it('renderiza navegação desktop, barra inferior mobile com safe-area e alvos >= 44px', () => {
    render(<App />);

    // Sidebar desktop
    const desktopNav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(desktopNav).toBeInTheDocument();

    // Barra inferior mobile (WebView Android / PWA)
    const mobileNav = screen.getByRole('navigation', { name: 'Navegação rápida móvel' });
    expect(mobileNav).toBeInTheDocument();
    expect(mobileNav.className).toContain('lg:hidden');
    expect(mobileNav.className).toContain('pb-[env(safe-area-inset-bottom)]');

    const mobileButtons = mobileNav.querySelectorAll('button');
    expect(mobileButtons.length).toBe(5);
    for (const btn of mobileButtons) {
      expect(btn.className).toContain('min-h-[44px]');
    }

    // Botão drawer mobile
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toBeInTheDocument();
  });

  it('permite navegar entre módulos ativos e planejados sem falhas de renderização', async () => {
    render(<App />);

    // Navegar para Laboratório matemático
    fireEvent.click(screen.getByRole('button', { name: /Laboratório matemático/i }));
    expect(
      await screen.findByRole('heading', { name: 'Laboratório Matemático' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Executar via Motor Python/i })
    ).toBeInTheDocument();

    // Navegar para módulo planejado (Simulador)
    fireEvent.click(screen.getByRole('button', { name: /Simulador/i }));
    expect(
      await screen.findByRole('heading', { name: 'Simulador Monte Carlo' })
    ).toBeInTheDocument();
  });
});
