import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  buildHypergeometricDistribution,
  exactCombinationsBigInt,
  hypergeometricDetail,
} from './combinatorics';

interface PythonExecutionState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  totalCombinations?: string;
  executionSource?: string;
  distributionSum?: number;
}

interface LotterySummaryItem {
  id: number;
  name: string;
  code: string;
  description: string;
  status: string;
  ruleVersionsCount?: number;
}

interface RuleVersionItem {
  id: number;
  versionNumber: number;
  minNumbersToChoose: number | null;
  maxNumbersToChoose: number | null;
  numberUniverseMin: number | null;
  numberUniverseMax: number | null;
  drawnNumbersCount: number | null;
  officialSource: string;
  isVerified: boolean;
  isLocked: boolean;
  validFrom: string;
  validTo: string | null;
}

interface LotteryDetailResponse extends LotterySummaryItem {
  ruleVersions: RuleVersionItem[];
}

type CalculationMode = 'free' | 'modality';

function formatBigIntPtBr(value: string): string {
  try {
    return BigInt(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export const MathLabView: React.FC = () => {
  const [mode, setMode] = useState<CalculationMode>('free');

  // Parâmetros livres
  const [universeSize, setUniverseSize] = useState(50);
  const [drawnCount, setDrawnCount] = useState(5);
  const [chosenCount, setChosenCount] = useState(5);

  // Estrutura para modalidades reais
  const [lotteries, setLotteries] = useState<LotterySummaryItem[]>([]);
  const [lotteriesLoading, setLotteriesLoading] = useState(false);
  const [lotteriesError, setLotteriesError] = useState<string | null>(null);
  const [selectedLotteryId, setSelectedLotteryId] = useState<number | null>(null);
  const [selectedLotteryDetail, setSelectedLotteryDetail] =
    useState<LotteryDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Linha expandida de detalhes matemáticos (por quantidade de acertos h)
  const [expandedHits, setExpandedHits] = useState<Record<number, boolean>>({});

  // Execução no motor Python
  const [pythonState, setPythonState] = useState<PythonExecutionState>({ status: 'idle' });

  // Carrega catálogo de modalidades ao entrar no laboratório
  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      setLotteriesLoading(true);
      setLotteriesError(null);
      try {
        const res = await fetch('/api/lotteries');
        if (!res.ok) {
          throw new Error(`Erro HTTP ${res.status} ao carregar modalidades.`);
        }
        const data = (await res.json()) as { items?: LotterySummaryItem[] };
        if (!active) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setLotteries(items);
        if (items.length > 0) {
          setSelectedLotteryId((prev) => prev ?? items[0].id);
        }
      } catch (err) {
        if (!active) return;
        setLotteriesError(
          err instanceof Error ? err.message : 'Falha ao consultar catálogo de modalidades.'
        );
      } finally {
        if (active) setLotteriesLoading(false);
      }
    };
    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  // Carrega versões de regra ao trocar modalidade
  useEffect(() => {
    if (selectedLotteryId == null) {
      setSelectedLotteryDetail(null);
      return;
    }
    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/lotteries/${selectedLotteryId}`);
        if (!res.ok) {
          throw new Error(`Erro HTTP ${res.status} ao carregar regras da modalidade.`);
        }
        const detail = (await res.json()) as LotteryDetailResponse;
        if (!active) return;
        setSelectedLotteryDetail(detail);
      } catch {
        if (!active) return;
        setSelectedLotteryDetail(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedLotteryId]);

  const activeVerifiedRule = useMemo(() => {
    if (!selectedLotteryDetail?.ruleVersions) return null;
    return (
      selectedLotteryDetail.ruleVersions.find(
        (rule) =>
          rule.isVerified &&
          rule.validTo === null &&
          rule.numberUniverseMin !== null &&
          rule.numberUniverseMax !== null &&
          rule.drawnNumbersCount !== null &&
          rule.minNumbersToChoose !== null &&
          rule.maxNumbersToChoose !== null
      ) ??
      selectedLotteryDetail.ruleVersions.find(
        (rule) =>
          rule.isVerified &&
          rule.numberUniverseMin !== null &&
          rule.numberUniverseMax !== null &&
          rule.drawnNumbersCount !== null &&
          rule.minNumbersToChoose !== null &&
          rule.maxNumbersToChoose !== null
      ) ??
      null
    );
  }, [selectedLotteryDetail]);

  // Carregamento automático dos parâmetros quando houver regra verificada no modo modalidade
  useEffect(() => {
    if (mode !== 'modality' || !activeVerifiedRule) return;
    const n =
      (activeVerifiedRule.numberUniverseMax ?? 1) -
      (activeVerifiedRule.numberUniverseMin ?? 1) +
      1;
    const k = activeVerifiedRule.drawnNumbersCount ?? 1;
    const minM = activeVerifiedRule.minNumbersToChoose ?? 1;
    const maxM = activeVerifiedRule.maxNumbersToChoose ?? minM;
    setUniverseSize(n);
    setDrawnCount(k);
    setChosenCount((prev) => (prev >= minM && prev <= maxM ? prev : minM));
    setExpandedHits({});
    setPythonState({ status: 'idle' });
  }, [mode, activeVerifiedRule]);

  const minChosenLimit =
    mode === 'modality' && activeVerifiedRule?.minNumbersToChoose != null
      ? activeVerifiedRule.minNumbersToChoose
      : 2;
  const maxChosenLimit =
    mode === 'modality' && activeVerifiedRule?.maxNumbersToChoose != null
      ? Math.min(activeVerifiedRule.maxNumbersToChoose, universeSize)
      : Math.min(20, universeSize);

  const safeDrawn = Math.min(Math.max(1, drawnCount), universeSize);
  const safeChosen = Math.min(Math.max(minChosenLimit, chosenCount), maxChosenLimit);

  const modalityAwaitingRules = mode === 'modality' && !activeVerifiedRule;

  const totalCombinations = useMemo(
    () => exactCombinationsBigInt(universeSize, safeChosen),
    [universeSize, safeChosen]
  );

  const distribution = useMemo(
    () => buildHypergeometricDistribution(universeSize, safeDrawn, safeChosen),
    [universeSize, safeDrawn, safeChosen]
  );

  // Comparação entre diferentes quantidades de dezenas (m)
  const chosenComparisonRows = useMemo(() => {
    const quantities: number[] = [];
    const upperBound = maxChosenLimit;
    const start = minChosenLimit;
    // Garante inclusão do m selecionado e de até 4 quantidades consecutivas válidas
    if (upperBound - start <= 5) {
      for (let m = start; m <= upperBound; m++) {
        quantities.push(m);
      }
    } else {
      const candidateSet = new Set<number>([
        start,
        safeChosen,
        Math.min(safeChosen + 1, upperBound),
        Math.min(safeChosen + 2, upperBound),
        Math.min(safeChosen + 3, upperBound),
      ]);
      for (const q of Array.from(candidateSet).sort((a, b) => a - b)) {
        quantities.push(q);
      }
    }

    const baseM = quantities[0] ?? safeChosen;
    const baseTopHits = Math.min(safeDrawn, baseM);
    const baseTopDetail = hypergeometricDetail(universeSize, safeDrawn, baseM, baseTopHits);

    return quantities.map((m) => {
      const topHits = Math.min(safeDrawn, m);
      const secondaryHits = Math.max(0, topHits - 1);
      const topDetail = hypergeometricDetail(universeSize, safeDrawn, m, topHits);
      const secondaryDetail = hypergeometricDetail(universeSize, safeDrawn, m, secondaryHits);
      const comb = exactCombinationsBigInt(universeSize, m);
      const relativeFactor =
        baseTopDetail.probability > 0 && topHits === baseTopHits
          ? topDetail.probability / baseTopDetail.probability
          : null;

      return {
        chosen: m,
        isSelected: m === safeChosen,
        totalCombinations: comb,
        topHits,
        topDetail,
        secondaryHits,
        secondaryDetail,
        relativeFactor,
      };
    });
  }, [universeSize, safeDrawn, safeChosen, minChosenLimit, maxChosenLimit]);

  const toggleExpandedHit = (hits: number) => {
    setExpandedHits((prev) => ({ ...prev, [hits]: !prev[hits] }));
  };

  const handleTestPythonEngine = async () => {
    if (modalityAwaitingRules) return;
    setPythonState({ status: 'loading' });
    try {
      const requestBody =
        mode === 'modality' && selectedLotteryDetail && activeVerifiedRule
          ? {
              mode: 'modality' as const,
              lotteryId: selectedLotteryDetail.id,
              lotteryCode: selectedLotteryDetail.code,
              ruleVersionId: activeVerifiedRule.id,
              universeSize,
              drawnCount: safeDrawn,
              chosenCount: safeChosen,
            }
          : {
              mode: 'free' as const,
              lotteryCode: 'generic-reference',
              universeSize,
              drawnCount: safeDrawn,
              chosenCount: safeChosen,
            };

      const response = await fetch('/api/math/python/theoretical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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
        distributionSum: payload.distribution_sum,
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
      <div className="flex flex-wrap items-end justify-between gap-4">
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
            Explorador combinatório exato (amostragem uniforme sem reposição). Exibe frações
            racionais brutas e simplificadas por MDC separadamente das aproximações decimais
            IEEE-754.
          </p>
        </div>

        {/* Alternador entre modo livre e modalidade */}
        <div
          className="inline-flex rounded-lg border border-white/10 bg-[#12141A] p-1"
          role="tablist"
          aria-label="Modo de parâmetros do laboratório"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'free'}
            onClick={() => {
              setMode('free');
              setPythonState({ status: 'idle' });
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'free'
                ? 'bg-[#181B22] text-[#E5C158] border border-[#D4AF37]/40'
                : 'text-neutral-400 hover:text-[#F1F2F4]'
            }`}
          >
            Parâmetros Livres
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'modality'}
            onClick={() => {
              setMode('modality');
              setPythonState({ status: 'idle' });
            }}
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'modality'
                ? 'bg-[#181B22] text-[#E5C158] border border-[#D4AF37]/40'
                : 'text-neutral-400 hover:text-[#F1F2F4]'
            }`}
          >
            Por Modalidade
          </button>
        </div>
      </div>

      {/* Painel de seleção de modalidade (quando mode === 'modality') */}
      {mode === 'modality' && (
        <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Seleção de Modalidade e Regras Verificadas
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Os parâmetros N, k e limites de m são carregados automaticamente apenas quando existe
                versão de regra oficial verificada no banco de dados.
              </p>
            </div>
            {selectedLotteryDetail && (
              <span className="font-mono-tabular text-xs text-neutral-400">
                ID #{selectedLotteryDetail.id} · Código: {selectedLotteryDetail.code} · Status:{' '}
                <span className="text-[#E5C158]">
                  {activeVerifiedRule
                    ? `Regra verificada ativa (ID #${activeVerifiedRule.id})`
                    : 'Aguardando configuração'}
                </span>
              </span>
            )}
          </div>

          {lotteriesLoading ? (
            <p className="text-xs text-neutral-400">Carregando catálogo de modalidades...</p>
          ) : lotteriesError ? (
            <p className="text-xs text-amber-300">{lotteriesError}</p>
          ) : lotteries.length === 0 ? (
            <p className="text-xs text-neutral-400">
              Nenhuma modalidade encontrada no catálogo. Utilize o modo Parâmetros Livres.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
              <label className="block md:col-span-5">
                <span className="block text-xs text-neutral-300 mb-1.5">Modalidade</span>
                <select
                  aria-label="Selecionar modalidade"
                  value={selectedLotteryId ?? ''}
                  onChange={(e) => setSelectedLotteryId(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2.5 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                >
                  {lotteries.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.name} ({lot.status === 'awaiting_rules' ? 'aguardando configuração' : lot.status})
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-7">
                {detailLoading ? (
                  <p className="text-xs text-neutral-400">Verificando versões de regras...</p>
                ) : activeVerifiedRule ? (
                  <div className="rounded-lg border border-[#D4AF37]/30 bg-[#0A0B0E] px-4 py-3 text-xs text-neutral-300">
                    <span className="font-medium text-[#E5C158]">
                      Regra v{activeVerifiedRule.versionNumber} (ID #{activeVerifiedRule.id}) carregada automaticamente:
                    </span>{' '}
                    Universo [{activeVerifiedRule.numberUniverseMin}..{activeVerifiedRule.numberUniverseMax}] (N=
                    {universeSize}) · Sorteio k={activeVerifiedRule.drawnNumbersCount} · Escolha m ∈ [
                    {activeVerifiedRule.minNumbersToChoose}..{activeVerifiedRule.maxNumbersToChoose}] · Fonte:{' '}
                    {activeVerifiedRule.officialSource}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-400/25 bg-[#0A0B0E] px-4 py-3 text-xs leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-300">
                      Modalidade aguardando configuração oficial (Etapa 2):
                    </span>{' '}
                    nenhuma regra verificada foi ingerida para{' '}
                    <span className="font-medium text-[#F1F2F4]">
                      {selectedLotteryDetail?.name ?? 'esta modalidade'}
                    </span>
                    . Regras não são inventadas pelo sistema; alterne para Parâmetros Livres para
                    exploração combinatória genérica.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Explorador Combinatório Interativo */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-4 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
              {mode === 'modality' && activeVerifiedRule
                ? `Parâmetros Carregados (${selectedLotteryDetail?.name})`
                : 'Parâmetros Teóricos (Local BigInt)'}
            </h2>
          </div>

          <div className="space-y-4">
            <label className="block">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>Universo Discreto (N)</span>
                <span className="font-mono-tabular text-[#E5C158]">{universeSize}</span>
              </div>
              <input
                type="range"
                min={mode === 'modality' && activeVerifiedRule ? Math.min(10, universeSize) : 10}
                max={mode === 'modality' && activeVerifiedRule ? Math.max(100, universeSize) : 100}
                disabled={mode === 'modality' && Boolean(activeVerifiedRule)}
                value={universeSize}
                onChange={(e) => setUniverseSize(Number(e.target.value))}
                className="mt-2 w-full accent-[#D4AF37] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>Elementos Sorteados (k)</span>
                <span className="font-mono-tabular text-[#8B5CF6]">{safeDrawn}</span>
              </div>
              <input
                type="range"
                min={mode === 'modality' && activeVerifiedRule ? Math.min(2, safeDrawn) : 2}
                max={
                  mode === 'modality' && activeVerifiedRule
                    ? Math.max(20, safeDrawn)
                    : Math.min(20, universeSize)
                }
                disabled={mode === 'modality' && Boolean(activeVerifiedRule)}
                value={safeDrawn}
                onChange={(e) => setDrawnCount(Number(e.target.value))}
                className="mt-2 w-full accent-[#7C3AED] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            <label className="block">
              <div className="flex justify-between text-xs text-neutral-300">
                <span>
                  Dezenas Escolhidas (m)
                  {mode === 'modality' && activeVerifiedRule
                    ? ` [${minChosenLimit}..${maxChosenLimit}]`
                    : ''}
                </span>
                <span className="font-mono-tabular text-[#E5C158]">{safeChosen}</span>
              </div>
              <input
                type="range"
                aria-label="Quantidade de dezenas escolhidas"
                min={minChosenLimit}
                max={maxChosenLimit}
                disabled={modalityAwaitingRules}
                value={safeChosen}
                onChange={(e) => setChosenCount(Number(e.target.value))}
                className="mt-2 w-full accent-[#D4AF37] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            {/* Botões rápidos de quantidade de dezenas para comparação imediata */}
            {!modalityAwaitingRules && (
              <div>
                <span className="block text-[11px] text-neutral-400 mb-2">
                  Seleção rápida de dezenas (m)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {chosenComparisonRows.map((row) => (
                    <button
                      key={row.chosen}
                      type="button"
                      onClick={() => setChosenCount(row.chosen)}
                      className={`rounded-md border px-2.5 py-1 font-mono-tabular text-xs transition-colors cursor-pointer ${
                        row.isSelected
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#E5C158]'
                          : 'border-white/10 bg-[#0A0B0E] text-neutral-300 hover:border-white/25'
                      }`}
                    >
                      {row.chosen}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/8 pt-4">
            <span className="text-xs text-neutral-400">
              Combinações Possíveis Exatas C({universeSize}, {safeChosen})
            </span>
            <p className="mt-1 font-mono-tabular text-lg font-semibold text-[#F1F2F4] break-all">
              {modalityAwaitingRules ? 'Aguardando regras verificadas' : totalCombinations.toLocaleString('pt-BR')}
            </p>
          </div>

          <div className="border-t border-white/8 pt-4 space-y-3">
            <button
              type="button"
              onClick={handleTestPythonEngine}
              disabled={pythonState.status === 'loading' || modalityAwaitingRules}
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
                Respondido por {pythonState.executionSource}: C(N,m) ={' '}
                {formatBigIntPtBr(pythonState.totalCombinations ?? '0')} · ΣP ={' '}
                {pythonState.distributionSum?.toFixed(12)}
              </p>
            )}
          </div>
        </div>

        {/* Tabela com detalhes expansíveis */}
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
              Distribuição Hipergeométrica P(X = h)
            </h2>
            <span className="font-mono-tabular text-xs text-neutral-400">
              Clique em Detalhes para inspecionar fração exata e fórmula
            </span>
          </div>

          {modalityAwaitingRules ? (
            <div className="mt-6 rounded-lg border border-white/8 bg-[#0A0B0E] p-6 text-xs text-neutral-300">
              Esta modalidade está marcada como <strong className="text-[#E5C158]">aguardando configuração</strong>.
              Nenhuma regra oficial foi inventada ou aplicada. Selecione outra modalidade com regra
              verificada ou utilize o modo <strong className="text-[#F1F2F4]">Parâmetros Livres</strong>.
            </div>
          ) : (
            <div className="mt-4 max-h-[28rem] overflow-x-auto overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Acertos (h)</th>
                    <th className="py-2 px-3 font-medium">Prob. Aprox. (%)</th>
                    <th className="py-2 px-3 font-medium">Notação Científica</th>
                    <th className="py-2 px-3 font-medium">Classificação</th>
                    <th className="py-2 px-3 text-right font-medium">Razão Aprox.</th>
                    <th className="py-2 pl-3 text-right font-medium">Cálculo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {distribution.map((row) => {
                    const isExpanded = Boolean(expandedHits[row.hits]);
                    return (
                      <React.Fragment key={row.hits}>
                        <tr className="hover:bg-white/[0.02]">
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
                                : 'Racional exato + aprox. float'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular text-neutral-300 whitespace-nowrap">
                            {row.oddsOneIn
                              ? `1 em ${formatBigIntPtBr(row.oddsOneIn)}`
                              : 'Impossível'}
                          </td>
                          <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={`Detalhes matemáticos para ${row.hits} acertos`}
                              onClick={() => toggleExpandedHit(row.hits)}
                              className="inline-flex items-center gap-1 rounded border border-white/12 bg-[#181B22] px-2 py-1 text-[11px] text-neutral-200 hover:border-[#D4AF37]/50 hover:text-[#E5C158] cursor-pointer"
                            >
                              <span>{isExpanded ? 'Ocultar' : 'Detalhes'}</span>
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[#0A0B0E]/80">
                            <td colSpan={6} className="p-4">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-medium text-[#E5C158]">
                                    Representação Racional Exata (BigInt)
                                  </p>
                                  <p className="font-mono-tabular text-neutral-300 break-all">
                                    <span className="text-neutral-500">Numerador exato:</span>{' '}
                                    {formatBigIntPtBr(row.rawNumerator)}
                                  </p>
                                  <p className="font-mono-tabular text-neutral-300 break-all">
                                    <span className="text-neutral-500">Denominador exato:</span>{' '}
                                    {formatBigIntPtBr(row.rawDenominator)}
                                  </p>
                                  <p className="font-mono-tabular text-neutral-200 break-all">
                                    <span className="text-neutral-500">Fração simplificada (MDC):</span>{' '}
                                    {row.exactNumerator} / {row.exactDenominator}
                                  </p>
                                </div>

                                <div className="space-y-1.5">
                                  <p className="text-[11px] font-medium text-[#8B5CF6]">
                                    Aproximações Numéricas & Fórmula
                                  </p>
                                  <p className="font-mono-tabular text-neutral-300">
                                    <span className="text-neutral-500">Prob. percentual aprox.:</span>{' '}
                                    {(row.probability * 100).toPrecision(8)}%
                                  </p>
                                  <p className="font-mono-tabular text-neutral-300">
                                    <span className="text-neutral-500">Notação científica:</span>{' '}
                                    {row.scientificNotation} ·{' '}
                                    <span className="text-neutral-500">Razão aprox.:</span>{' '}
                                    {row.oddsOneIn
                                      ? `1 em ${formatBigIntPtBr(row.oddsOneIn)}`
                                      : 'Impossível (0)'}
                                  </p>
                                  <p className="font-mono-tabular text-neutral-300 break-words">
                                    <span className="text-neutral-500">Fórmula:</span> P(X={row.hits}) = [C(k, h) ·
                                    C(N−k, m−h)] / C(N, m) = [C({safeDrawn}, {row.hits}) · C(
                                    {universeSize - safeDrawn}, {safeChosen - row.hits})] / C(
                                    {universeSize}, {safeChosen})
                                  </p>
                                  <p className="font-mono-tabular text-neutral-400">
                                    <span className="text-neutral-500">Parâmetros:</span> N={universeSize}, k=
                                    {safeDrawn}, m={safeChosen}, h={row.hits}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Comparação entre diferentes quantidades de dezenas */}
      {!modalityAwaitingRules && (
        <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Comparação entre Quantidades de Dezenas (m)
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Impacto combinatório ao variar a quantidade de dezenas selecionadas para N={universeSize}{' '}
                e k={safeDrawn}.
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-neutral-400">
              Cálculo exato BigInt
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/8 text-neutral-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Dezenas (m)</th>
                  <th className="py-2 px-3 font-medium">Combinações C(N, m)</th>
                  <th className="py-2 px-3 font-medium">Acerto Máximo (h)</th>
                  <th className="py-2 px-3 font-medium">Prob. Máx. Aprox.</th>
                  <th className="py-2 px-3 font-medium">Razão Máx. Aprox.</th>
                  <th className="py-2 px-3 font-medium">Faixa Secundária (h-1)</th>
                  <th className="py-2 pl-3 text-right font-medium">Fator vs. Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {chosenComparisonRows.map((item) => (
                  <tr
                    key={item.chosen}
                    className={
                      item.isSelected ? 'bg-[#D4AF37]/[0.06]' : 'hover:bg-white/[0.02]'
                    }
                  >
                    <td className="py-2.5 pr-3 font-mono-tabular font-medium text-[#F1F2F4]">
                      {item.chosen} {item.isSelected ? '· atual' : ''}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                      {item.totalCombinations.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                      {item.topHits} acertos
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                      {(item.topDetail.probability * 100).toPrecision(5)}%
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-300 whitespace-nowrap">
                      {item.topDetail.oddsOneIn
                        ? `1 em ${formatBigIntPtBr(item.topDetail.oddsOneIn)}`
                        : 'Impossível'}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-400 whitespace-nowrap">
                      {item.secondaryDetail.oddsOneIn
                        ? `${item.secondaryHits} acertos: 1 em ${formatBigIntPtBr(item.secondaryDetail.oddsOneIn)}`
                        : 'Impossível'}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono-tabular text-[#C4B5FD]">
                      {item.relativeFactor !== null ? `${item.relativeFactor.toFixed(2)}x` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Limite Arquitetural Python & IA */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Motor Científico Python (`/math_engine`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            A rota `POST /api/math/python/theoretical` executa chamadas HTTP reais com timeout
            configurável (`MATH_ENGINE_TIMEOUT_MS`), validação Zod e auditoria matemática de
            parâmetros, numeradores, denominadores e soma unitária. Inconsistências ou falhas
            retornam erro explícito (502/503/504), jamais fallback silencioso.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Separação Estrita da Camada de IA (`Gemini`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            O cliente `@google/genai` reside exclusivamente no servidor (`server/modules/ai/`).
            Ele nunca recebe autoridade para calcular probabilidades, gerar previsões de dezenas
            ou substituir algoritmos matemáticos verificáveis.
          </p>
        </div>
      </section>
    </div>
  );
};
