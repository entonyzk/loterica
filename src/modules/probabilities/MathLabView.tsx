import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  buildHypergeometricDistribution,
  exactCombinationsBigInt,
  hypergeometricDetail,
} from './combinatorics';
import {
  classifyRuleTemporalStatus,
  selectActiveVerifiedRuleVersion,
} from './rule-validity';
import {
  type CalculationMemoryEntry,
  type LotteryMathModelType,
  type PrizeTierConfigItem,
  type SpecializedHitPoint,
  computeSpecializedModalityAnalysis,
} from './specialized';

interface PythonExecutionState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
  totalCombinations?: string;
  executionSource?: string;
  distributionSum?: number;
  referenceDate?: string;
  endpointUsed?: 'theoretical' | 'specialized';
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
  mathModelType?: string | null;
  simpleBetPriceCents?: number | null;
  priceUpdatedAt?: string | null;
  priceSource?: string | null;
  prizeTiersConfig?: PrizeTierConfigItem[] | null;
  officialSource: string;
  isVerified: boolean;
  isLocked: boolean;
  validFrom: string;
  validTo: string | null;
}

interface LotteryDetailResponse extends LotterySummaryItem {
  ruleVersions: RuleVersionItem[];
}

interface ContestReferenceItem {
  id: number;
  lotteryTypeId: number;
  ruleVersionId: number | null;
  contestNumber: number;
  drawDate: string | null;
  status: string;
}

type CalculationMode = 'free' | 'modality';
type ReferenceMode = 'current' | 'date' | 'contest';
type SpecializedTab = 'probabilities' | 'simple_vs_multiple' | 'comparator';

function formatBigIntPtBr(value: string): string {
  try {
    return BigInt(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function formatBrlFromCentsStr(centsStr: string | number | null | undefined): string {
  if (centsStr === null || centsStr === undefined) return 'Preço não cadastrado';
  const num = Number(centsStr);
  if (!Number.isFinite(num)) return 'Preço indisponível';
  return (num / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatOddsDisplay(probability: number, oddsOneIn: string | null): string {
  if (!oddsOneIn || probability <= 0) return 'Impossível';
  if (probability > 0.05) {
    const exactRatio = 1 / probability;
    return `1 em ${exactRatio.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
  }
  return `1 em ${formatBigIntPtBr(oddsOneIn)}`;
}

const MemoryPanel: React.FC<{ memory: CalculationMemoryEntry }> = ({ memory }) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[#E5C158]">
        Memória de Cálculo Racional Exato (BigInt)
      </p>
      <p className="font-mono-tabular text-neutral-300 break-all">
        <span className="text-neutral-500">Numerador exato:</span>{' '}
        {formatBigIntPtBr(memory.rawNumerator)}
      </p>
      <p className="font-mono-tabular text-neutral-300 break-all">
        <span className="text-neutral-500">Denominador exato:</span>{' '}
        {formatBigIntPtBr(memory.rawDenominator)}
      </p>
      <p className="font-mono-tabular text-neutral-200 break-all">
        <span className="text-neutral-500">Fração simplificada (MDC):</span>{' '}
        {memory.simplifiedFraction}
      </p>
      <p className="text-neutral-300 leading-relaxed pt-1">
        <span className="text-neutral-500 font-medium">Em linguagem simples:</span>{' '}
        {memory.plainExplanation}
      </p>
    </div>

    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[#8B5CF6]">
        Fórmula, Substituição & Aproximação Decimal
      </p>
      <p className="font-mono-tabular text-neutral-300 break-words">
        <span className="text-neutral-500">Fórmula:</span> {memory.formula}
      </p>
      <p className="font-mono-tabular text-neutral-300 break-words">
        <span className="text-neutral-500">Substituição:</span> {memory.substitutedParameters}
      </p>
      <p className="font-mono-tabular text-neutral-300">
        <span className="text-neutral-500">Resultado decimal / %:</span>{' '}
        {memory.decimalProbability.toPrecision(8)} ({memory.percentageFormatted})
      </p>
      <p className="font-mono-tabular text-neutral-300">
        <span className="text-neutral-500">Notação científica:</span> {memory.scientificNotation} ·{' '}
        <span className="text-neutral-500">Razão:</span>{' '}
        {formatOddsDisplay(memory.decimalProbability, memory.oddsOneIn)}
      </p>
    </div>
  </div>
);

export const MathLabView: React.FC = () => {
  const [mode, setMode] = useState<CalculationMode>('free');
  const [specializedTab, setSpecializedTab] = useState<SpecializedTab>('probabilities');

  // Parâmetros livres
  const [universeSize, setUniverseSize] = useState(50);
  const [drawnCount, setDrawnCount] = useState(5);
  const [chosenCount, setChosenCount] = useState(5);

  // Estrutura para modalidades reais e vigência temporal
  const [lotteries, setLotteries] = useState<LotterySummaryItem[]>([]);
  const [lotteriesLoading, setLotteriesLoading] = useState(false);
  const [lotteriesError, setLotteriesError] = useState<string | null>(null);
  const [selectedLotteryId, setSelectedLotteryId] = useState<number | null>(null);
  const [selectedLotteryDetail, setSelectedLotteryDetail] =
    useState<LotteryDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('current');
  const [customReferenceDate, setCustomReferenceDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [contests, setContests] = useState<ContestReferenceItem[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<number | null>(null);

  // Controles especializados (Simples vs Múltiplas & Comparador A vs B)
  const [simpleGamesCount, setSimpleGamesCount] = useState(7);
  const [compareConfigA, setCompareConfigA] = useState<number>(6);
  const [compareConfigB, setCompareConfigB] = useState<number>(7);

  // Memória de cálculo expansível
  const [expandedHits, setExpandedHits] = useState<Record<number, boolean>>({});
  const [expandedAggregate, setExpandedAggregate] = useState<'none' | 'any' | 'no'>('none');

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

  // Carrega concursos históricos (quando disponíveis) ao trocar modalidade
  useEffect(() => {
    if (selectedLotteryId == null) {
      setContests([]);
      setSelectedContestId(null);
      return;
    }
    let active = true;
    const loadContests = async () => {
      try {
        const res = await fetch(`/api/contests?lotteryId=${selectedLotteryId}&limit=50`);
        if (!res.ok) return;
        const data = (await res.json()) as { items?: ContestReferenceItem[] };
        if (!active) return;
        const list = Array.isArray(data.items) ? data.items : [];
        setContests(list);
        setSelectedContestId(list[0]?.id ?? null);
      } catch {
        if (!active) return;
        setContests([]);
        setSelectedContestId(null);
      }
    };
    void loadContests();
    return () => {
      active = false;
    };
  }, [selectedLotteryId]);

  const selectedContest = useMemo(
    () => contests.find((c) => c.id === selectedContestId) ?? null,
    [contests, selectedContestId]
  );

  const effectiveReferenceDate = useMemo(() => {
    if (referenceMode === 'contest' && selectedContest?.drawDate) {
      const parsed = new Date(selectedContest.drawDate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (referenceMode === 'date' && customReferenceDate) {
      const isoCandidate = customReferenceDate.includes('T')
        ? customReferenceDate
        : `${customReferenceDate}T12:00:00.000Z`;
      const parsed = new Date(isoCandidate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }, [referenceMode, selectedContest, customReferenceDate, selectedLotteryId]);

  const activeVerifiedRule = useMemo(() => {
    if (!selectedLotteryDetail?.ruleVersions) return null;
    if (referenceMode === 'contest' && selectedContest?.ruleVersionId != null) {
      const linked = selectedLotteryDetail.ruleVersions.find(
        (r) => r.id === selectedContest.ruleVersionId
      );
      if (linked && classifyRuleTemporalStatus(linked, effectiveReferenceDate) === 'active') {
        return linked;
      }
      return null;
    }
    return selectActiveVerifiedRuleVersion(
      selectedLotteryDetail.ruleVersions,
      effectiveReferenceDate
    );
  }, [selectedLotteryDetail, effectiveReferenceDate, referenceMode, selectedContest]);

  const temporalDiagnostic = useMemo(() => {
    const versions = selectedLotteryDetail?.ruleVersions ?? [];
    const verifiedCount = versions.filter((r) => r.isVerified).length;
    const futureCount = versions.filter(
      (r) => classifyRuleTemporalStatus(r, effectiveReferenceDate) === 'future'
    ).length;
    const expiredCount = versions.filter(
      (r) => classifyRuleTemporalStatus(r, effectiveReferenceDate) === 'expired'
    ).length;
    return { total: versions.length, verifiedCount, futureCount, expiredCount };
  }, [selectedLotteryDetail, effectiveReferenceDate]);

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
    setCompareConfigA(minM);
    setCompareConfigB(Math.min(minM + 1, maxM));
    const nextEq =
      minM + 1 <= maxM && minM + 1 >= k ? Number(exactCombinationsBigInt(minM + 1, k)) : 1;
    setSimpleGamesCount(Math.min(nextEq, 1000));
    setExpandedHits({});
    setExpandedAggregate('none');
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

  const specializedAnalysis = useMemo(() => {
    if (mode !== 'modality' || !activeVerifiedRule || !selectedLotteryDetail) return null;
    return computeSpecializedModalityAnalysis({
      lotteryCode: selectedLotteryDetail.code,
      mathModelType: (activeVerifiedRule.mathModelType ?? 'hypergeometric_single_group') as LotteryMathModelType,
      universeSize,
      drawnCount: safeDrawn,
      chosenCount: safeChosen,
      minNumbersToChoose: minChosenLimit,
      maxNumbersToChoose: maxChosenLimit,
      prizeTiers: Array.isArray(activeVerifiedRule.prizeTiersConfig)
        ? activeVerifiedRule.prizeTiersConfig
        : [],
      simpleBetPriceCents: activeVerifiedRule.simpleBetPriceCents ?? null,
      priceUpdatedAt: activeVerifiedRule.priceUpdatedAt ?? null,
      priceSource: activeVerifiedRule.priceSource ?? null,
      simpleGamesCount,
    });
  }, [
    mode,
    activeVerifiedRule,
    selectedLotteryDetail,
    universeSize,
    safeDrawn,
    safeChosen,
    minChosenLimit,
    maxChosenLimit,
    simpleGamesCount,
  ]);

  const compareRowA = useMemo(
    () =>
      specializedAnalysis?.comparisonRows.find((r) => r.chosenCount === compareConfigA) ??
      specializedAnalysis?.comparisonRows[0] ??
      null,
    [specializedAnalysis, compareConfigA]
  );
  const compareRowB = useMemo(
    () =>
      specializedAnalysis?.comparisonRows.find((r) => r.chosenCount === compareConfigB) ??
      specializedAnalysis?.comparisonRows[Math.min(1, (specializedAnalysis?.comparisonRows.length ?? 1) - 1)] ??
      null,
    [specializedAnalysis, compareConfigB]
  );

  // Comparação entre diferentes quantidades de dezenas (modo livre e resumo rápido)
  const chosenComparisonRows = useMemo(() => {
    const quantities: number[] = [];
    const upperBound = maxChosenLimit;
    const start = minChosenLimit;
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

  const handleTestPythonEngine = async (endpoint: 'theoretical' | 'specialized' = 'theoretical') => {
    if (modalityAwaitingRules) return;
    setPythonState({ status: 'loading', endpointUsed: endpoint });
    try {
      const targetUrl =
        endpoint === 'specialized'
          ? '/api/math/python/specialized'
          : '/api/math/python/theoretical';
      const requestBody =
        mode === 'modality' && selectedLotteryDetail && activeVerifiedRule
          ? {
              mode: 'modality' as const,
              lotteryId: selectedLotteryDetail.id,
              lotteryCode: selectedLotteryDetail.code,
              ruleVersionId: activeVerifiedRule.id,
              ...(referenceMode === 'contest' && selectedContest
                ? {
                    contestId: selectedContest.id,
                    contestNumber: selectedContest.contestNumber,
                  }
                : {}),
              referenceDate: effectiveReferenceDate.toISOString(),
              universeSize,
              drawnCount: safeDrawn,
              chosenCount: safeChosen,
              ...(endpoint === 'specialized' ? { simpleGamesCount } : {}),
            }
          : {
              mode: 'free' as const,
              lotteryCode: 'generic-reference',
              universeSize,
              drawnCount: safeDrawn,
              chosenCount: safeChosen,
            };

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        setPythonState({
          status: 'error',
          endpointUsed: endpoint,
          message: `${payload.error ?? 'ERROR'}: ${payload.message ?? 'Motor Python indisponível.'}`,
        });
        return;
      }
      setPythonState({
        status: 'success',
        endpointUsed: endpoint,
        totalCombinations: payload.total_combinations,
        executionSource: payload.execution_source,
        distributionSum: payload.distribution_sum,
        referenceDate:
          payload.modalityContext?.referenceDate ?? effectiveReferenceDate.toISOString(),
      });
    } catch (err) {
      setPythonState({
        status: 'error',
        endpointUsed: endpoint,
        message: err instanceof Error ? err.message : 'Falha de rede ao consultar motor Python.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="text-[#E5C158] font-medium">Etapa 2 · Motor Especializado</span>
            <span aria-hidden="true">·</span>
            <span>Combinatória Racional Exata (BigInt / Python FastAPI)</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold text-[#F1F2F4]">
            Laboratório Matemático
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            Calculadora especializada por modalidade (Mega-Sena e Lotofácil) e explorador
            combinatório livre. Exibe frações exatas, memória de cálculo, apostas simples vs.
            múltiplas e custos oficiais verificados.
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
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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
            className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
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
                Parâmetros N, k, limites de m, faixas de premiação e preços oficiais são carregados
                exclusivamente de versões verificadas no banco PostgreSQL.
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
            <div className="space-y-4">
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
                        {lot.name} (
                        {lot.status === 'awaiting_rules' ? 'aguardando configuração' : lot.status})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block md:col-span-4">
                  <span className="block text-xs text-neutral-300 mb-1.5">
                    Referência Temporal da Regra
                  </span>
                  <select
                    aria-label="Referência temporal da regra"
                    value={referenceMode}
                    onChange={(e) => setReferenceMode(e.target.value as ReferenceMode)}
                    className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2.5 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="current">Vigência Atual</option>
                    <option value="date">Data Histórica de Referência</option>
                    <option value="contest" disabled={contests.length === 0}>
                      Concurso Histórico ({contests.length})
                    </option>
                  </select>
                </label>

                {referenceMode === 'date' && (
                  <label className="block md:col-span-3">
                    <span className="block text-xs text-neutral-300 mb-1.5">
                      Data de Referência
                    </span>
                    <input
                      type="date"
                      aria-label="Data de referência da regra"
                      value={customReferenceDate}
                      onChange={(e) => setCustomReferenceDate(e.target.value)}
                      className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    />
                  </label>
                )}

                {referenceMode === 'contest' && contests.length > 0 && (
                  <label className="block md:col-span-3">
                    <span className="block text-xs text-neutral-300 mb-1.5">Concurso</span>
                    <select
                      aria-label="Selecionar concurso histórico"
                      value={selectedContestId ?? ''}
                      onChange={(e) => setSelectedContestId(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/12 bg-[#0A0B0E] px-3 py-2.5 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    >
                      {contests.map((c) => (
                        <option key={c.id} value={c.id}>
                          Concurso {c.contestNumber}
                          {c.drawDate ? ` (${c.drawDate.slice(0, 10)})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div>
                {detailLoading ? (
                  <p className="text-xs text-neutral-400">Verificando versões de regras...</p>
                ) : activeVerifiedRule ? (
                  <div className="rounded-lg border border-[#D4AF37]/30 bg-[#0A0B0E] px-4 py-3 text-xs text-neutral-300 space-y-1.5">
                    <div>
                      <span className="font-medium text-[#E5C158]">
                        Regra v{activeVerifiedRule.versionNumber} (ID #{activeVerifiedRule.id}) carregada automaticamente:
                      </span>{' '}
                      Universo [{activeVerifiedRule.numberUniverseMin}..
                      {activeVerifiedRule.numberUniverseMax}] (N={universeSize}) · Sorteio k=
                      {activeVerifiedRule.drawnNumbersCount} · Escolha m ∈ [
                      {activeVerifiedRule.minNumbersToChoose}..
                      {activeVerifiedRule.maxNumbersToChoose}] · Fonte:{' '}
                      {activeVerifiedRule.officialSource}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono-tabular text-[11px] text-neutral-400">
                      <span>
                        Vigência: {activeVerifiedRule.validFrom.slice(0, 10)} até{' '}
                        {activeVerifiedRule.validTo
                          ? activeVerifiedRule.validTo.slice(0, 10)
                          : 'vigência aberta'}
                      </span>
                      <span>
                        Data de referência: {effectiveReferenceDate.toISOString().slice(0, 10)}
                      </span>
                      {activeVerifiedRule.simpleBetPriceCents != null && (
                        <span className="text-[#E5C158]">
                          Aposta simples oficial:{' '}
                          {formatBrlFromCentsStr(activeVerifiedRule.simpleBetPriceCents)}
                          {activeVerifiedRule.priceUpdatedAt
                            ? ` (atualizado em ${activeVerifiedRule.priceUpdatedAt.slice(0, 10)})`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : temporalDiagnostic.verifiedCount > 0 ? (
                  <div className="rounded-lg border border-amber-400/25 bg-[#0A0B0E] px-4 py-3 text-xs leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-300">
                      Nenhuma regra verificada vigente na data de referência (
                      {effectiveReferenceDate.toISOString().slice(0, 10)}):
                    </span>{' '}
                    regras com vigência futura ({temporalDiagnostic.futureCount}) ou expirada (
                    {temporalDiagnostic.expiredCount}) não são aplicadas. Selecione uma
                    data/concurso dentro da vigência oficial ou use Parâmetros Livres.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-400/25 bg-[#0A0B0E] px-4 py-3 text-xs leading-relaxed text-amber-200/90">
                    <span className="font-semibold text-amber-300">
                      Modalidade aguardando configuração oficial:
                    </span>{' '}
                    nenhuma regra verificada foi ingerida para{' '}
                    <span className="font-medium text-[#F1F2F4]">
                      {selectedLotteryDetail?.name ?? 'esta modalidade'}
                    </span>
                    . Regras e preços não são inventados pelo sistema; selecione Mega-Sena,
                    Lotofácil ou alterne para Parâmetros Livres.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Sub-navegação especializada quando modalidade verificada está ativa */}
      {mode === 'modality' && activeVerifiedRule && specializedAnalysis && (
        <div className="space-y-6">
          {/* 4 KPIs principais da aposta selecionada */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <p className="text-xs text-neutral-400">
                Combinações C({universeSize}, {safeChosen})
              </p>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                {formatBigIntPtBr(specializedAnalysis.totalChosenCombinations)}
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                Espaço simples C({universeSize},{safeDrawn}):{' '}
                {formatBigIntPtBr(specializedAnalysis.totalSpaceSimpleCombinations)}
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <p className="text-xs text-neutral-400">
                Aposta com {safeChosen} Dezenas
              </p>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                {formatBrlFromCentsStr(specializedAnalysis.multipleBet.totalCostCents)}
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                {formatBigIntPtBr(specializedAnalysis.multipleBet.equivalentSimpleBets)} jogo(s) simples
                equivalente(s)
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">Probabilidade de Premiação</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAggregate((prev) => (prev === 'any' ? 'none' : 'any'))
                  }
                  className="text-[11px] text-[#E5C158] hover:underline cursor-pointer"
                >
                  {expandedAggregate === 'any' ? 'Ocultar memória' : 'Memória'}
                </button>
              </div>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}%
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                {formatOddsDisplay(
                  specializedAnalysis.anyPrize.probability,
                  specializedAnalysis.anyPrize.oddsOneIn
                )}
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">Prob. de Não Premiar</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAggregate((prev) => (prev === 'no' ? 'none' : 'no'))
                  }
                  className="text-[11px] text-[#C4B5FD] hover:underline cursor-pointer"
                >
                  {expandedAggregate === 'no' ? 'Ocultar memória' : 'Memória'}
                </button>
              </div>
              <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                {(specializedAnalysis.noPrize.probability * 100).toPrecision(6)}%
              </p>
              <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                Fração: {specializedAnalysis.noPrize.exactNumerator} /{' '}
                {specializedAnalysis.noPrize.exactDenominator}
              </p>
            </div>
          </section>

          {expandedAggregate !== 'none' && (
            <section className="rounded-xl border border-[#D4AF37]/30 bg-[#0A0B0E] p-5">
              <MemoryPanel
                memory={
                  expandedAggregate === 'any'
                    ? specializedAnalysis.anyPrize.memory
                    : specializedAnalysis.noPrize.memory
                }
              />
            </section>
          )}

          {/* Abas da calculadora especializada */}
          <div
            className="flex flex-wrap items-center gap-1 rounded-lg border border-white/8 bg-[#12141A] p-1 w-fit"
            role="tablist"
            aria-label="Ferramentas especializadas da modalidade"
          >
            <button
              type="button"
              role="tab"
              aria-selected={specializedTab === 'probabilities'}
              onClick={() => setSpecializedTab('probabilities')}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                specializedTab === 'probabilities'
                  ? 'bg-[#D4AF37] text-[#0A0B0E]'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Probabilidades & Faixas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={specializedTab === 'simple_vs_multiple'}
              onClick={() => setSpecializedTab('simple_vs_multiple')}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                specializedTab === 'simple_vs_multiple'
                  ? 'bg-[#D4AF37] text-[#0A0B0E]'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Apostas Simples vs. Múltiplas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={specializedTab === 'comparator'}
              onClick={() => setSpecializedTab('comparator')}
              className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                specializedTab === 'comparator'
                  ? 'bg-[#D4AF37] text-[#0A0B0E]'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Comparador Matemático
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo da aba Apostas Simples vs Múltiplas */}
      {mode === 'modality' &&
        activeVerifiedRule &&
        specializedAnalysis &&
        specializedTab === 'simple_vs_multiple' && (
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                  Calculadora de Apostas Simples vs. Múltiplas ({selectedLotteryDetail?.name})
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  Compara um volante múltiplo com{' '}
                  <span className="font-mono-tabular text-[#E5C158]">{safeChosen} dezenas</span>{' '}
                  contra uma quantidade escolhida de jogos simples distintos de {safeDrawn} dezenas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-neutral-300 flex items-center gap-2">
                  <span>Qtd. jogos simples:</span>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    aria-label="Quantidade de jogos simples"
                    value={simpleGamesCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val >= 1) {
                        setSimpleGamesCount(Math.min(1000000, Math.floor(val)));
                      }
                    }}
                    className="w-24 rounded-lg border border-white/12 bg-[#0A0B0E] px-2.5 py-1.5 font-mono-tabular text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSimpleGamesCount(
                      Math.min(
                        1000000,
                        Number(specializedAnalysis.multipleBet.equivalentSimpleBets) || 1
                      )
                    )
                  }
                  className="rounded-lg border border-[#D4AF37]/40 bg-[#181B22] px-3 py-1.5 text-xs text-[#E5C158] hover:border-[#D4AF37] cursor-pointer whitespace-nowrap"
                >
                  Igualar custo ({formatBigIntPtBr(specializedAnalysis.multipleBet.equivalentSimpleBets)})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2.5 pr-4 font-medium">Métrica Combinatória</th>
                    <th className="py-2.5 px-4 font-medium text-[#E5C158]">
                      1 Aposta de {safeChosen} Dezenas
                    </th>
                    <th className="py-2.5 pl-4 font-medium text-[#C4B5FD]">
                      {specializedAnalysis.simpleGamesComparison.simpleGamesCount.toLocaleString('pt-BR')}{' '}
                      Jogo(s) Simples Distinto(s)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">Combinações simples adquiridas</td>
                    <td className="py-3 px-4 font-mono-tabular text-[#F1F2F4]">
                      {formatBigIntPtBr(specializedAnalysis.multipleBet.equivalentSimpleBets)}
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-[#F1F2F4]">
                      {specializedAnalysis.simpleGamesComparison.simpleGamesCount.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">Custo total oficial</td>
                    <td className="py-3 px-4 font-mono-tabular text-[#E5C158]">
                      {formatBrlFromCentsStr(specializedAnalysis.multipleBet.totalCostCents)}
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-[#C4B5FD]">
                      {formatBrlFromCentsStr(
                        specializedAnalysis.simpleGamesComparison.totalCostCents
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      Cobertura do espaço C({universeSize}, {safeDrawn})
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-neutral-200">
                      {(
                        specializedAnalysis.multipleBet.combinatorialCoverage.probability * 100
                      ).toPrecision(6)}
                      % ({specializedAnalysis.multipleBet.combinatorialCoverage.simplifiedNumerator}{' '}
                      /{' '}
                      {formatBigIntPtBr(
                        specializedAnalysis.multipleBet.combinatorialCoverage.simplifiedDenominator
                      )}
                      )
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-neutral-200">
                      {(
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.probability * 100
                      ).toPrecision(6)}
                      % ({specializedAnalysis.simpleGamesComparison.topPrizeExact.simplifiedNumerator}{' '}
                      /{' '}
                      {formatBigIntPtBr(
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.simplifiedDenominator
                      )}
                      )
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      Probabilidade na faixa principal ({safeDrawn} acertos)
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-[#E5C158]">
                      {formatOddsDisplay(
                        specializedAnalysis.multipleBet.combinatorialCoverage.probability,
                        specializedAnalysis.multipleBet.combinatorialCoverage.oddsOneIn
                      )}
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-[#C4B5FD]">
                      {formatOddsDisplay(
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.probability,
                        specializedAnalysis.simpleGamesComparison.topPrizeExact.oddsOneIn
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 text-neutral-300">
                      Premiação global no bilhete / expectativa nos jogos simples
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-neutral-200">
                      Exata: {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}% (ao
                      menos 1 faixa)
                    </td>
                    <td className="py-3 pl-4 font-mono-tabular text-neutral-200">
                      Esperado:{' '}
                      {specializedAnalysis.simpleGamesComparison.expectedWinningGamesPerDraw.toFixed(
                        4
                      )}{' '}
                      bilhete(s) premiado(s) · Mod. indep.:{' '}
                      {(
                        specializedAnalysis.simpleGamesComparison
                          .independentModelAnyPrizeProbability * 100
                      ).toPrecision(5)}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {specializedAnalysis.multipleBet.isMultipleBet && (
              <div className="border-t border-white/8 pt-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#E5C158]">
                  Desdobramento de Prêmios em Aposta Múltipla ({safeChosen} dezenas)
                </h3>
                <p className="text-xs text-neutral-400">
                  Ao acertar <span className="text-neutral-200">h</span> dezenas no volante múltiplo,
                  o bilhete acumula múltiplas premiações simples conforme a identidade de Vandermonde:
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                  {specializedAnalysis.prizeTiers.map((tier) => (
                    <div
                      key={tier.hits}
                      className="rounded-lg border border-white/8 bg-[#0A0B0E] px-3.5 py-2.5 text-xs"
                    >
                      <p className="font-medium text-[#F1F2F4]">
                        Se acertar {tier.hits} ({tier.tierName})
                      </p>
                      <p className="mt-1 font-mono-tabular text-[#E5C158]">
                        {tier.embeddedSimpleWins
                          .map(
                            (w) =>
                              `${formatBigIntPtBr(w.winningSimpleCombinations)}× ${w.tierName}`
                          )
                          .join(' + ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-neutral-400 border-t border-white/8 pt-3">
              Fonte oficial dos preços: {specializedAnalysis.multipleBet.priceSource ?? 'Caixa'} ·{' '}
              {specializedAnalysis.simpleGamesComparison.equiprobabilityNotice}
            </p>
          </section>
        )}

      {/* Conteúdo da aba Comparador Matemático */}
      {mode === 'modality' &&
        activeVerifiedRule &&
        specializedAnalysis &&
        specializedTab === 'comparator' && (
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                  Comparador Matemático ({selectedLotteryDetail?.name})
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  Compare lado a lado duas quantidades de dezenas válidas nas regras oficiais.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-neutral-300 flex items-center gap-2">
                  <span>Configuração A:</span>
                  <select
                    aria-label="Configuração A de dezenas"
                    value={compareConfigA}
                    onChange={(e) => setCompareConfigA(Number(e.target.value))}
                    className="rounded-lg border border-white/12 bg-[#0A0B0E] px-2.5 py-1.5 text-xs text-[#E5C158]"
                  >
                    {specializedAnalysis.comparisonRows.map((r) => (
                      <option key={r.chosenCount} value={r.chosenCount}>
                        {r.chosenCount} dezenas
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-neutral-300 flex items-center gap-2">
                  <span>Configuração B:</span>
                  <select
                    aria-label="Configuração B de dezenas"
                    value={compareConfigB}
                    onChange={(e) => setCompareConfigB(Number(e.target.value))}
                    className="rounded-lg border border-white/12 bg-[#0A0B0E] px-2.5 py-1.5 text-xs text-[#C4B5FD]"
                  >
                    {specializedAnalysis.comparisonRows.map((r) => (
                      <option key={r.chosenCount} value={r.chosenCount}>
                        {r.chosenCount} dezenas
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {compareRowA && compareRowB && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { label: 'Configuração A', row: compareRowA, accent: 'text-[#E5C158]' },
                  { label: 'Configuração B', row: compareRowB, accent: 'text-[#C4B5FD]' },
                ].map(({ label, row, accent }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-white/10 bg-[#0A0B0E] p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${accent}`}>
                        {label}: {row.chosenCount} dezenas
                      </span>
                      <span className="font-mono-tabular text-neutral-400">
                        {row.coverageFactorVsMinimum} vs. mínima
                      </span>
                    </div>
                    <p className="font-mono-tabular text-neutral-300">
                      Jogos simples equivalentes:{' '}
                      <span className="text-[#F1F2F4]">
                        {formatBigIntPtBr(row.equivalentSimpleBets)}
                      </span>{' '}
                      · Custo: <span className={accent}>{formatBrlFromCentsStr(row.totalCostCents)}</span>
                    </p>
                    <p className="font-mono-tabular text-neutral-300">
                      Faixa principal ({row.mainPrizeHits} acertos):{' '}
                      <span className="text-[#F1F2F4]">
                        {formatOddsDisplay(row.mainPrizeProbability, row.mainPrizeOddsOneIn)}
                      </span>{' '}
                      ({(row.mainPrizeProbability * 100).toPrecision(5)}%)
                    </p>
                    <p className="font-mono-tabular text-neutral-300">
                      Qualquer premiação:{' '}
                      <span className="text-[#F1F2F4]">
                        {formatOddsDisplay(row.anyPrizeProbability, row.anyPrizeOddsOneIn)}
                      </span>{' '}
                      ({(row.anyPrizeProbability * 100).toPrecision(5)}%)
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Dezenas (m)</th>
                    <th className="py-2 px-3 font-medium">Jogos Simples</th>
                    <th className="py-2 px-3 font-medium">Custo Oficial</th>
                    <th className="py-2 px-3 font-medium">Faixa Principal</th>
                    <th className="py-2 px-3 font-medium">Qualquer Prêmio</th>
                    <th className="py-2 pl-3 text-right font-medium">Ganho vs. Mín.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {specializedAnalysis.comparisonRows.map((row) => (
                    <tr
                      key={row.chosenCount}
                      onClick={() => setChosenCount(row.chosenCount)}
                      className={`cursor-pointer ${
                        row.isSelected ? 'bg-[#D4AF37]/[0.08]' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-mono-tabular font-medium text-[#F1F2F4]">
                        {row.chosenCount} {row.isSelected ? '· selecionado' : ''}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                        {formatBigIntPtBr(row.equivalentSimpleBets)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                        {formatBrlFromCentsStr(row.totalCostCents)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-200 whitespace-nowrap">
                        {formatOddsDisplay(row.mainPrizeProbability, row.mainPrizeOddsOneIn)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300 whitespace-nowrap">
                        {(row.anyPrizeProbability * 100).toPrecision(5)}% (
                        {formatOddsDisplay(row.anyPrizeProbability, row.anyPrizeOddsOneIn)})
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono-tabular text-[#C4B5FD]">
                        {row.coverageFactorVsMinimum}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-white/8 bg-[#0A0B0E] px-4 py-3 text-xs text-neutral-300">
              <strong className="text-[#E5C158]">Princípio de Equiprobabilidade:</strong>{' '}
              {specializedAnalysis.equiprobabilityAxiom}
            </div>
          </section>
        )}

      {/* Faixas de Premiação Oficiais (quando na aba principal da modalidade) */}
      {mode === 'modality' &&
        activeVerifiedRule &&
        specializedAnalysis &&
        specializedTab === 'probabilities' && (
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                  Faixas Oficiais de Premiação — {selectedLotteryDetail?.name} ({safeChosen} dezenas)
                </h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Todas as faixas previstas nas regras oficiais vigentes com frações racionais e
                  razão 1 em N.
                </p>
              </div>
              <span className="font-mono-tabular text-xs text-[#E5C158]">
                Premiação total: {(specializedAnalysis.anyPrize.probability * 100).toPrecision(5)}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/8 text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Faixa Oficial</th>
                    <th className="py-2 px-3 font-medium">Acertos</th>
                    <th className="py-2 px-3 font-medium">Fração Simplificada</th>
                    <th className="py-2 px-3 font-medium">Prob. Aprox.</th>
                    <th className="py-2 px-3 font-medium">Notação Científica</th>
                    <th className="py-2 pl-3 text-right font-medium">Razão 1 em N</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {specializedAnalysis.prizeTiers.map((tier) => (
                    <tr key={tier.hits} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-3 font-medium text-[#F1F2F4]">
                        {tier.tierName}
                        {tier.isMainPrize ? (
                          <span className="ml-2 text-[11px] text-[#E5C158]">· Principal</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                        {tier.hits}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                        {tier.exactNumerator} / {formatBigIntPtBr(tier.exactDenominator)}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-[#E5C158]">
                        {(tier.probability * 100).toPrecision(6)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-neutral-300">
                        {tier.scientificNotation}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono-tabular text-neutral-200 whitespace-nowrap">
                        {formatOddsDisplay(tier.probability, tier.oddsOneIn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* Explorador Combinatório Interativo (sempre acessível para Parâmetros Livres e aba Probabilidades) */}
      {(mode === 'free' || specializedTab === 'probabilities' || modalityAwaitingRules) && (
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
                    {(specializedAnalysis
                      ? specializedAnalysis.comparisonRows.map((r) => r.chosenCount)
                      : chosenComparisonRows.map((r) => r.chosen)
                    ).map((mVal) => (
                      <button
                        key={mVal}
                        type="button"
                        onClick={() => setChosenCount(mVal)}
                        className={`rounded-md border px-2.5 py-1 font-mono-tabular text-xs transition-colors cursor-pointer ${
                          mVal === safeChosen
                            ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#E5C158]'
                            : 'border-white/10 bg-[#0A0B0E] text-neutral-300 hover:border-white/25'
                        }`}
                      >
                        {mVal}
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
                {modalityAwaitingRules
                  ? 'Aguardando regras verificadas'
                  : totalCombinations.toLocaleString('pt-BR')}
              </p>
            </div>

            <div className="border-t border-white/8 pt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => handleTestPythonEngine('theoretical')}
                disabled={pythonState.status === 'loading' || modalityAwaitingRules}
                className="w-full rounded-lg border border-[#8B5CF6]/40 bg-[#181B22] px-4 py-2.5 text-xs font-medium text-[#C4B5FD] transition-colors hover:border-[#8B5CF6] disabled:opacity-50 cursor-pointer"
              >
                {pythonState.status === 'loading' && pythonState.endpointUsed === 'theoretical'
                  ? 'Consultando Motor Python...'
                  : 'Executar via Motor Python (HTTP)'}
              </button>

              {mode === 'modality' && activeVerifiedRule && (
                <button
                  type="button"
                  onClick={() => handleTestPythonEngine('specialized')}
                  disabled={pythonState.status === 'loading'}
                  className="w-full rounded-lg border border-[#D4AF37]/40 bg-[#181B22] px-4 py-2 text-xs font-medium text-[#E5C158] transition-colors hover:border-[#D4AF37] disabled:opacity-50 cursor-pointer"
                >
                  {pythonState.status === 'loading' && pythonState.endpointUsed === 'specialized'
                    ? 'Executando Modelo Especializado...'
                    : 'Validar Modelo Especializado no Python'}
                </button>
              )}

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

          {/* Tabela com Memória de Cálculo expansível */}
          <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Distribuição Hipergeométrica P(X = h) e Memória de Cálculo
              </h2>
              <span className="font-mono-tabular text-xs text-neutral-400">
                Clique em Detalhes para inspecionar fórmula, fração e explicação
              </span>
            </div>

            {modalityAwaitingRules ? (
              <div className="mt-6 rounded-lg border border-white/8 bg-[#0A0B0E] p-6 text-xs text-neutral-300">
                Esta modalidade está marcada como{' '}
                <strong className="text-[#E5C158]">aguardando configuração</strong>. Nenhuma regra
                oficial foi inventada ou aplicada. Selecione Mega-Sena, Lotofácil ou utilize o modo{' '}
                <strong className="text-[#F1F2F4]">Parâmetros Livres</strong>.
              </div>
            ) : (
              <div className="mt-4 max-h-[30rem] overflow-x-auto overflow-y-auto">
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
                    {(specializedAnalysis ? specializedAnalysis.distribution : distribution).map(
                      (row) => {
                        const isExpanded = Boolean(expandedHits[row.hits]);
                        const tierLabel =
                          'tierName' in row && row.tierName ? ` · ${row.tierName}` : '';
                        return (
                          <React.Fragment key={row.hits}>
                            <tr className="hover:bg-white/[0.02]">
                              <td className="py-2.5 pr-3 font-mono-tabular text-neutral-200 whitespace-nowrap">
                                {row.hits}
                                {tierLabel ? (
                                  <span className="text-[#E5C158]">{tierLabel}</span>
                                ) : null}
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
                                {formatOddsDisplay(row.probability, row.oddsOneIn)}
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
                                  {'memory' in row ? (
                                    <MemoryPanel memory={(row as SpecializedHitPoint).memory} />
                                  ) : (
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
                                          <span className="text-neutral-500">
                                            Denominador exato:
                                          </span>{' '}
                                          {formatBigIntPtBr(row.rawDenominator)}
                                        </p>
                                        <p className="font-mono-tabular text-neutral-200 break-all">
                                          <span className="text-neutral-500">
                                            Fração simplificada (MDC):
                                          </span>{' '}
                                          {row.exactNumerator} / {row.exactDenominator}
                                        </p>
                                      </div>

                                      <div className="space-y-1.5">
                                        <p className="text-[11px] font-medium text-[#8B5CF6]">
                                          Aproximações Numéricas & Fórmula
                                        </p>
                                        <p className="font-mono-tabular text-neutral-300">
                                          <span className="text-neutral-500">
                                            Prob. percentual aprox.:
                                          </span>{' '}
                                          {(row.probability * 100).toPrecision(8)}%
                                        </p>
                                        <p className="font-mono-tabular text-neutral-300">
                                          <span className="text-neutral-500">
                                            Notação científica:
                                          </span>{' '}
                                          {row.scientificNotation} ·{' '}
                                          <span className="text-neutral-500">Razão aprox.:</span>{' '}
                                          {formatOddsDisplay(row.probability, row.oddsOneIn)}
                                        </p>
                                        <p className="font-mono-tabular text-neutral-300 break-words">
                                          <span className="text-neutral-500">Fórmula:</span> P(X=
                                          {row.hits}) = [C(k, h) · C(N−k, m−h)] / C(N, m) = [C(
                                          {safeDrawn}, {row.hits}) · C({universeSize - safeDrawn},{' '}
                                          {safeChosen - row.hits})] / C({universeSize},{' '}
                                          {safeChosen})
                                        </p>
                                        <p className="font-mono-tabular text-neutral-400">
                                          <span className="text-neutral-500">Parâmetros:</span> N=
                                          {universeSize}, k={safeDrawn}, m={safeChosen}, h=
                                          {row.hits}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Comparação rápida entre diferentes quantidades de dezenas */}
      {!modalityAwaitingRules && (mode === 'free' || specializedTab === 'probabilities') && (
        <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                Comparação entre Quantidades de Dezenas (m)
              </h2>
              <p className="mt-1 text-xs text-neutral-400">
                Impacto combinatório ao variar a quantidade de dezenas selecionadas para N=
                {universeSize} e k={safeDrawn}.
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
                    className={item.isSelected ? 'bg-[#D4AF37]/[0.06]' : 'hover:bg-white/[0.02]'}
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
                      {formatOddsDisplay(item.topDetail.probability, item.topDetail.oddsOneIn)}
                    </td>
                    <td className="py-2.5 px-3 font-mono-tabular text-neutral-400 whitespace-nowrap">
                      {item.secondaryDetail.oddsOneIn
                        ? `${item.secondaryHits} acertos: ${formatOddsDisplay(item.secondaryDetail.probability, item.secondaryDetail.oddsOneIn)}`
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
            Os modelos especializados (`/v1/probabilities/specialized`) e teóricos executam em
            aritmética racional exata, com validação Zod e auditoria matemática de parâmetros,
            frações, custos e invariantes pelo backend Node.js.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#12141A] p-6">
          <h3 className="font-display text-sm font-semibold text-[#F1F2F4]">
            Separação Estrita da Camada de IA (`Gemini`)
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            O cliente `@google/genai` nunca calcula probabilidades nem prevê dezenas vencedoras.
            Resultados passados não alteram as chances dos sorteios futuros.
          </p>
        </div>
      </section>
    </div>
  );
};
