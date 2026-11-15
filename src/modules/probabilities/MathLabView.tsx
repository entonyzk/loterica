import React, { useMemo, useState } from 'react';
import {
  buildHypergeometricDistribution,
  exactCombinationsBigInt,
} from './combinatorics';

interface PythonExecutionState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  totalCombinations?: string;
  executionSource?: string;
}

export const MathLabView: React.FC = () => {
  const [universeSize, setUniverseSize] = useState(50);
  const [drawnCount, setDrawnCount] = useState(5);
  const [chosenCount, setChosenCount] = useState(5);
  const [pythonState, setPythonState] = useState<PythonExecutionState>({ status: 'idle' });

  const safeDrawn = Math.min(drawnCount, universeSize);
  const safeChosen = Math.min(chosenCount, universeSize);

  const totalCombinations = useMemo(
    () => exactCombinationsBigInt(universeSize, safeChosen),
    [universeSize, safeChosen]
  );

  const distribution = useMemo(
    () => buildHypergeometricDistribution(universeSize, safeDrawn, safeChosen),
    [universeSize, safeDrawn, safeChosen]
  );

  const handleTestPythonEngine = async () => {
    setPythonState({ status: 'loading' });
    try {
      const response = await fetch('/api/math/python/theoretical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lotteryCode: 'generic-reference',
          universeSize,
          drawnCount: safeDrawn,
          chosenCount: safeChosen,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setPythonState({
          status: 'error',
          message: `${payload.error ?? 'ERROR'}: ${payload.message ?? 'Motor Python indisponível.'}`,
        });
        return;
      }
      setPythonState({
        status: 'success',
        totalCombinations: payload.total_combinations,
        executionSource: payload.execution_source,
      });
    } catch (err) {
      setPythonState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Falha de rede ao consultar motor Python.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="text-[#E5C158] font-medium">Módulo Matemático</span>
          <span aria-hidden="true">·</span>
          <span>Combinatória Determinística Local (BigInt) vs. Motor Python FastAPI</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[#F1F2F4]">
          Laboratório Matemático
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">
          Explorador combinatório teórico genérico (amostragem uniforme sem reposição). Exibe
          fração racional exata reduzida por MDC e aproximação IEEE-754 de 53 bits, sem truncar
          probabilidades muito pequenas.
        </p>
      </div>

      {/* Explorador Combinatório Interativo */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-4 space-y-5">
          <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Parâmetros Teóricos Livres (Local BigInt)
          </h2>

          <div className="space-y-4">
            <label className="block">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>Universo Discreto (N)</span>
                <span className="font-mono-tabular text-[#E5C158]">{universeSize}</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={universeSize}
                onChange={(e) => setUniverseSize(Number(e.target.value))}
                className="mt-2 w-full accent-[#D4AF37] cursor-pointer"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>Elementos Sorteados (k)</span>
                <span className="font-mono-tabular text-[#8B5CF6]">{safeDrawn}</span>
              </div>
              <input
                type="range"
                min={2}
                max={Math.min(20, universeSize)}
                value={safeDrawn}
                onChange={(e) => setDrawnCount(Number(e.target.value))}
                className="mt-2 w-full accent-[#7C3AED] cursor-pointer"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>Elementos Selecionados (m)</span>
                <span className="font-mono-tabular text-[#E5C158]">{safeChosen}</span>
              </div>
              <input
                type="range"
                min={2}
                max={Math.min(20, universeSize)}
                value={safeChosen}
                onChange={(e) => setChosenCount(Number(e.target.value))}
                className="mt-2 w-full accent-[#D4AF37] cursor-pointer"
              />
            </label>
          </div>

          <div className="border-t border-white/8 pt-4">
            <span className="text-xs text-neutral-400">Espaço Amostral Exato C(N, m)</span>
            <p className="mt-1 font-mono-tabular text-lg font-semibold text-[#F1F2F4] break-all">
              {totalCombinations.toLocaleString('pt-BR')}
            </p>
          </div>

          <div className="border-t border-white/8 pt-4 space-y-3">
            <button
              type="button"
              onClick={handleTestPythonEngine}
              disabled={pythonState.status === 'loading'}
              className="w-full rounded-lg border border-[#8B5CF6]/40 bg-[#181B22] px-4 py-2.5 text-xs font-medium text-[#C4B5FD] transition-colors hover:border-[#8B5CF6] disabled:opacity-50 cursor-pointer"
            >
              {pythonState.status === 'loading'
                ? 'Consultando Motor Python...'
                : 'Executar via Motor Python (HTTP)'}
            </button>

            {pythonState.status === 'error' && (
              <p className="text-xs leading-relaxed text-amber-300">{pythonState.message}</p>
            )}
            {pythonState.status === 'success' && (
              <p className="font-mono-tabular text-xs text-[#E5C158]">
                Respondido por {pythonState.executionSource}: C(N,m) = {pythonState.totalCombinations}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
              Distribuição Hipergeométrica P(X = h)
            </h2>
            <span className="font-mono-tabular text-xs text-neutral-400">
              Fração Racional Exata · Aproximação 53-bit
            </span>
          </div>

          <div className="mt-4 max-h-96 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/8 text-neutral-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Acertos (h)</th>
                  <th className="py-2 px-3 font-medium">Probabilidade (%)</th>
                  <th className="py-2 px-3 font-medium">Notação Científica</th>
                  <th className="py-2 px-3 font-medium">Precisão</th>
                  <th className="py-2 pl-3 text-right font-medium">Razão Aproximada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {distribution.map((row) => (
                  <tr key={row.hits} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 font-mono-tabular text-neutral-200">
                      {row.hits}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                      {(row.probability * 100).toPrecision(6)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                      {row.scientificNotation}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400 whitespace-nowrap">
                      {row.isImpossible
                        ? 'Zero exato'
                        : row.precisionClassification === 'exact'
                          ? 'Exato'
                          : 'Racional exato / Aprox. float'}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono-tabular text-neutral-300 whitespace-nowrap">
                      {row.oddsOneIn ? `1 em ${BigInt(row.oddsOneIn).toLocaleString('pt-BR')}` : 'Impossível'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Limite Arquitetural Python & IA */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Motor Científico Python (`/math_engine`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            A rota `POST /api/math/python/theoretical` executa chamadas HTTP reais com timeout
            configurável (`MATH_ENGINE_TIMEOUT_MS`) e validação Zod para `MATH_ENGINE_URL`. Se o
            serviço Python estiver offline, um erro HTTP 503/504 explícito é retornado, jamais
            mascarado como resultado válido.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Separação Estrita da Camada de IA (`Gemini`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            O cliente `@google/genai` reside exclusivamente no servidor (`server/modules/ai/`).
            Ele nunca recebe autoridade para calcular probabilidades, gerar porcentagens de previsão
            ou substituir algoritmos matemáticos verificáveis.
          </p>
        </div>
      </section>
    </div>
  );
};
