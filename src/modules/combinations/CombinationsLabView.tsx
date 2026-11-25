import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  Copy,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  classifyRuleTemporalStatus,
  selectActiveVerifiedRuleVersion,
} from '../probabilities/rule-validity';
import {
  NumberFrequencyChart,
  OverlapHistogramChart,
  StrategyComparisonChart,
} from './CombinationsCharts';
import {
  formatBigIntPtBr,
  formatBrlFromCents,
  parseNumberListInput,
  validateBetsClient,
  type CombinationsAnalyzeResponse,
  type CombinationsCompareResponse,
  type CombinationsCoverageResponse,
  type CombinationsGenerateResponse,
  type ContestRefItem,
  type GenerationMethod,
  type ModalityDetailResponse,
  type ModalityRuleVersionItem,
  type ModalitySummaryItem,
} from './types';

type LabSubTab = 'universe' | 'generator' | 'coverage' | 'comparator';
type ReferenceMode = 'current' | 'date' | 'contest';
type NumberPaintBrush = 'toggle' | 'fixed' | 'excluded' | 'clear';

interface StrategyDraft {
  id: string;
  name: string;
  chosenCount: number;
  desiredGamesCount: number;
  method: GenerationMethod;
  coverageTargetT: number;
  maxBudgetBrl: string;
  useCurrentConstraints: boolean;
  customFixedInput: string;
  customExcludedInput: string;
  useExplicitBets: boolean;
  explicitBetsInput: string;
}

const METHOD_LABELS: Record<GenerationMethod, string> = {
  exhaustive: 'Enumeração Exaustiva (Exata)',
  uniform_sampling: 'Amostragem Uniforme Sem Reposição',
  coverage_heuristic: 'Heurística Gulosa de Cobertura',
  combinatorial_search: 'Busca Combinatória com Refinamento',
};

function combBigIntClient(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  if (k === 0 || k === n) return 1n;
  const effK = Math.min(k, n - k);
  let res = 1n;
  for (let i = 1n; i <= BigInt(effK); i += 1n) {
    res = (res * (BigInt(n) - i + 1n)) / i;
  }
  return res;
}

function parseBrlToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
  if (!cleaned) return null;
  const val = Number(cleaned);
  if (!Number.isFinite(val) || val < 0) return null;
  return Math.round(val * 100);
}

export const CombinationsLabView: React.FC = () => {
  // --- Catálogo & Regras Oficiais ---
  const [lotteries, setLotteries] = useState<ModalitySummaryItem[]>([]);
  const [selectedLotteryId, setSelectedLotteryId] = useState<number | null>(null);
  const [lotteryDetail, setLotteryDetail] = useState<ModalityDetailResponse | null>(null);
  const [contests, setContests] = useState<ContestRefItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // --- Vigência Temporal ---
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('current');
  const [referenceDateInput, setReferenceDateInput] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [selectedContestId, setSelectedContestId] = useState<number | ''>('');

  // --- Parâmetros de Restrição Compartilhados ---
  const [chosenCount, setChosenCount] = useState<number>(6);
  const [fixedNumbers, setFixedNumbers] = useState<number[]>([]);
  const [excludedNumbers, setExcludedNumbers] = useState<number[]>([]);
  const [paintBrush, setPaintBrush] = useState<NumberPaintBrush>('toggle');
  const [desiredGamesCount, setDesiredGamesCount] = useState<number>(10);
  const [maxBudgetBrl, setMaxBudgetBrl] = useState<string>('120');

  // --- Navegação de Submódulos ---
  const [activeTab, setActiveTab] = useState<LabSubTab>('universe');

  // --- Estado Tab 1: Universo & Orçamento ---
  const [analyzeState, setAnalyzeState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    data?: CombinationsAnalyzeResponse;
    errorCode?: string;
    errorMessage?: string;
  }>({ status: 'idle' });

  // --- Estado Tab 2: Gerador Controlado ---
  const [genMethod, setGenMethod] = useState<GenerationMethod>('coverage_heuristic');
  const [genTargetT, setGenTargetT] = useState<number>(3);
  const [genSeed, setGenSeed] = useState<string>('202603');
  const [minEven, setMinEven] = useState<string>('');
  const [maxEven, setMaxEven] = useState<string>('');
  const [minSum, setMinSum] = useState<string>('');
  const [maxSum, setMaxSum] = useState<string>('');
  const [maxConsecutive, setMaxConsecutive] = useState<string>('');
  const [generateState, setGenerateState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    data?: CombinationsGenerateResponse;
    errorCode?: string;
    errorMessage?: string;
  }>({ status: 'idle' });
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  // --- Estado Tab 3: Cobertura & Análise de Conjunto ---
  const [betsTextarea, setBetsTextarea] = useState<string>('');
  const [coverageTargetT, setCoverageTargetT] = useState<number>(3);
  const [coverageState, setCoverageState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    coverageData?: CombinationsCoverageResponse;
    setAnalysisData?: CombinationsAnalyzeResponse;
    errorCode?: string;
    errorMessage?: string;
  }>({ status: 'idle' });

  // --- Estado Tab 4: Comparador de Estratégias (até 5) ---
  const [strategies, setStrategies] = useState<StrategyDraft[]>([
    {
      id: 's1',
      name: 'Base Simples (Amostragem)',
      chosenCount: 6,
      desiredGamesCount: 10,
      method: 'uniform_sampling',
      coverageTargetT: 3,
      maxBudgetBrl: '120',
      useCurrentConstraints: true,
      customFixedInput: '',
      customExcludedInput: '',
      useExplicitBets: false,
      explicitBetsInput: '',
    },
    {
      id: 's2',
      name: 'Heurística de Cobertura',
      chosenCount: 6,
      desiredGamesCount: 10,
      method: 'coverage_heuristic',
      coverageTargetT: 3,
      maxBudgetBrl: '120',
      useCurrentConstraints: true,
      customFixedInput: '',
      customExcludedInput: '',
      useExplicitBets: false,
      explicitBetsInput: '',
    },
    {
      id: 's3',
      name: 'Busca Combinatória',
      chosenCount: 6,
      desiredGamesCount: 10,
      method: 'combinatorial_search',
      coverageTargetT: 3,
      maxBudgetBrl: '120',
      useCurrentConstraints: true,
      customFixedInput: '',
      customExcludedInput: '',
      useExplicitBets: false,
      explicitBetsInput: '',
    },
  ]);
  const [compareState, setCompareState] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    data?: CombinationsCompareResponse;
    errorCode?: string;
    errorMessage?: string;
  }>({ status: 'idle' });

  // --- Carregamento Inicial do Catálogo ---
  useEffect(() => {
    let active = true;
    async function loadLotteries() {
      setLoadingCatalog(true);
      try {
        const res = await fetch('/api/lotteries');
        if (!res.ok) throw new Error('Falha ao carregar catálogo de loterias.');
        const data = await res.json();
        if (!active) return;
        const items: ModalitySummaryItem[] = Array.isArray(data.items) ? data.items : [];
        setLotteries(items);
        if (items.length > 0) {
          const preferred =
            items.find((l) => l.status === 'active') ??
            items.find((l) => l.code === 'mega-sena') ??
            items[0];
          setSelectedLotteryId(preferred.id);
        }
      } catch (err) {
        if (!active) return;
        setCatalogError(err instanceof Error ? err.message : 'Erro ao consultar modalidades.');
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }
    loadLotteries();
    return () => {
      active = false;
    };
  }, []);

  // --- Carregamento Detalhado da Modalidade ---
  useEffect(() => {
    if (!selectedLotteryId) return;
    let active = true;
    async function loadDetail() {
      try {
        const [detRes, conRes] = await Promise.all([
          fetch(`/api/lotteries/${selectedLotteryId}`),
          fetch(`/api/contests?lotteryId=${selectedLotteryId}&limit=30`),
        ]);
        if (!detRes.ok) throw new Error('Falha ao carregar regras da modalidade.');
        const detData: ModalityDetailResponse = await detRes.json();
        const conData = conRes.ok ? await conRes.json() : { items: [] };
        if (!active) return;
        setLotteryDetail(detData);
        const contestItems: ContestRefItem[] = Array.isArray(conData.items) ? conData.items : [];
        setContests(contestItems);
        setSelectedContestId(contestItems[0]?.id ?? '');
        setFixedNumbers([]);
        setExcludedNumbers([]);
        setAnalyzeState({ status: 'idle' });
        setGenerateState({ status: 'idle' });
        setCoverageState({ status: 'idle' });
        setCompareState({ status: 'idle' });
      } catch (err) {
        if (!active) return;
        setCatalogError(err instanceof Error ? err.message : 'Erro ao carregar regras.');
      }
    }
    loadDetail();
    return () => {
      active = false;
    };
  }, [selectedLotteryId]);

  const effectiveRefDate = useMemo(() => {
    if (referenceMode === 'date' && referenceDateInput) {
      const parsed = new Date(`${referenceDateInput}T12:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (referenceMode === 'contest' && selectedContestId !== '') {
      const c = contests.find((item) => item.id === Number(selectedContestId));
      if (c?.drawDate) {
        const parsed = new Date(c.drawDate);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }
    return new Date();
  }, [referenceMode, referenceDateInput, selectedContestId, contests]);

  const activeRule: ModalityRuleVersionItem | null = useMemo(() => {
    if (!lotteryDetail?.ruleVersions?.length) return null;
    if (referenceMode === 'contest' && selectedContestId !== '') {
      const c = contests.find((item) => item.id === Number(selectedContestId));
      if (c?.ruleVersionId) {
        const match = lotteryDetail.ruleVersions.find((r) => r.id === c.ruleVersionId);
        if (match && match.isVerified) return match;
      }
    }
    return selectActiveVerifiedRuleVersion(lotteryDetail.ruleVersions, effectiveRefDate);
  }, [lotteryDetail, referenceMode, selectedContestId, contests, effectiveRefDate]);

  // Ajusta chosenCount e targetT quando a regra verificada muda
  useEffect(() => {
    if (!activeRule) return;
    const minC = activeRule.minNumbersToChoose ?? activeRule.drawnNumbersCount ?? 6;
    const maxC = activeRule.maxNumbersToChoose ?? minC;
    const drawn = activeRule.drawnNumbersCount ?? minC;
    setChosenCount((prev) => (prev < minC || prev > maxC ? minC : prev));
    const defaultT = Math.min(3, drawn, minC);
    setGenTargetT(defaultT);
    setCoverageTargetT(defaultT);
    setStrategies((prev) =>
      prev.map((s) => ({
        ...s,
        chosenCount: s.chosenCount < minC || s.chosenCount > maxC ? minC : s.chosenCount,
        coverageTargetT: Math.min(s.coverageTargetT, drawn, Math.max(minC, s.chosenCount)),
      }))
    );
  }, [activeRule]);

  const universeSize = useMemo(() => {
    if (!activeRule || activeRule.numberUniverseMin == null || activeRule.numberUniverseMax == null) {
      return 0;
    }
    return activeRule.numberUniverseMax - activeRule.numberUniverseMin + 1;
  }, [activeRule]);

  const drawnCount = activeRule?.drawnNumbersCount ?? 0;
  const minChoose = activeRule?.minNumbersToChoose ?? drawnCount;
  const maxChoose = activeRule?.maxNumbersToChoose ?? minChoose;

  const variableCount = Math.max(0, universeSize - fixedNumbers.length - excludedNumbers.length);
  const constraintError = useMemo(() => {
    if (!activeRule) return null;
    if (fixedNumbers.length > chosenCount) {
      return `Quantidade de números fixos (${fixedNumbers.length}) excede o tamanho da aposta (${chosenCount}).`;
    }
    if (fixedNumbers.length + variableCount < chosenCount) {
      return `Dezenas disponíveis insuficientes (${fixedNumbers.length} fixos + ${variableCount} livres < ${chosenCount}). Remova excluídos.`;
    }
    return null;
  }, [activeRule, fixedNumbers.length, variableCount, chosenCount]);

  const coverageValidation = useMemo(() => {
    if (!activeRule || universeSize <= 0) {
      return { validBets: [] as number[][], errors: [], isEmpty: true };
    }
    return validateBetsClient({
      rawText: betsTextarea,
      chosenCount,
      universeSize,
      fixedNumbers,
      excludedNumbers,
    });
  }, [activeRule, betsTextarea, chosenCount, universeSize, fixedNumbers, excludedNumbers]);

  useEffect(() => {
    if (
      coverageState.status === 'success' &&
      (Boolean(constraintError) || coverageValidation.errors.length > 0)
    ) {
      setCoverageState({ status: 'idle' });
    }
  }, [constraintError, coverageValidation.errors.length, coverageState.status]);

  const strategyValidations = useMemo(() => {
    return strategies.map((strat) => {
      const errors: string[] = [];
      let stratFixed = fixedNumbers;
      let stratExcluded = excludedNumbers;

      if (!strat.useCurrentConstraints && universeSize > 0) {
        const parsedF = parseNumberListInput(strat.customFixedInput, universeSize, 'Fixos');
        const parsedE = parseNumberListInput(strat.customExcludedInput, universeSize, 'Excluídos');
        errors.push(...parsedF.errors, ...parsedE.errors);
        stratFixed = parsedF.numbers;
        stratExcluded = parsedE.numbers;
      }

      const excludedSet = new Set(stratExcluded);
      const conflict = stratFixed.filter((n) => excludedSet.has(n));
      if (conflict.length > 0) {
        errors.push(`Conflito entre fixos e excluídos (${conflict.join(', ')}).`);
      }

      if (stratFixed.length > strat.chosenCount) {
        errors.push(
          `Quantidade de fixos (${stratFixed.length}) excede o tamanho da aposta (${strat.chosenCount}).`
        );
      }

      const poolSize = Math.max(0, universeSize - stratExcluded.length);
      const effT = Math.max(1, Math.min(strat.coverageTargetT, drawnCount || 1, strat.chosenCount));
      if (universeSize > 0 && poolSize < strat.chosenCount) {
        errors.push(
          `Pool disponível (${poolSize} dezenas) insuficiente para aposta de ${strat.chosenCount} dezenas.`
        );
      }
      if (universeSize > 0 && poolSize < effT) {
        errors.push(`Pool disponível (${poolSize}) menor que o alvo de cobertura t=${effT}.`);
      }

      const budgetTrimmed = strat.maxBudgetBrl.trim();
      const budgetCents = budgetTrimmed ? parseBrlToCents(strat.maxBudgetBrl) : null;
      if (budgetTrimmed && budgetCents === null) {
        errors.push('Orçamento máximo inválido.');
      }

      const simplePrice = activeRule?.simpleBetPriceCents ?? null;
      const eqSimple =
        drawnCount > 0 && strat.chosenCount >= drawnCount
          ? combBigIntClient(strat.chosenCount, drawnCount)
          : 0n;
      const unitCostCents =
        simplePrice !== null ? eqSimple * BigInt(simplePrice) : null;

      let validExplicitBets: number[][] = [];
      if (strat.useExplicitBets && universeSize > 0) {
        const betCheck = validateBetsClient({
          rawText: strat.explicitBetsInput,
          chosenCount: strat.chosenCount,
          universeSize,
          fixedNumbers: stratFixed,
          excludedNumbers: stratExcluded,
        });
        if (betCheck.isEmpty) {
          errors.push('Informe ao menos 1 aposta explícita válida.');
        } else if (betCheck.errors.length > 0) {
          for (const issue of betCheck.errors.slice(0, 4)) {
            errors.push(`Aposta #${issue.betIndex}: ${issue.reasons.join('; ')}.`);
          }
          if (betCheck.errors.length > 4) {
            errors.push(`+ ${betCheck.errors.length - 4} aposta(s) com violação adicional.`);
          }
        } else {
          validExplicitBets = betCheck.validBets;
          if (budgetCents !== null && unitCostCents !== null) {
            const totalCost = BigInt(validExplicitBets.length) * unitCostCents;
            if (totalCost > BigInt(budgetCents)) {
              errors.push(
                `Apostas explícitas custam ${formatBrlFromCents(totalCost.toString())}, excedendo o orçamento de ${formatBrlFromCents(budgetCents)}.`
              );
            }
          }
        }
      } else if (
        budgetCents !== null &&
        unitCostCents !== null &&
        unitCostCents > 0n &&
        BigInt(budgetCents) < unitCostCents
      ) {
        errors.push(
          `Orçamento (${formatBrlFromCents(budgetCents)}) insuficiente para 1 aposta (${formatBrlFromCents(unitCostCents.toString())}).`
        );
      }

      return {
        id: strat.id,
        fixedNumbers: stratFixed,
        excludedNumbers: stratExcluded,
        budgetCents,
        validExplicitBets,
        errors,
      };
    });
  }, [strategies, fixedNumbers, excludedNumbers, universeSize, drawnCount, activeRule]);

  const hasStrategyValidationErrors = strategyValidations.some((v) => v.errors.length > 0);

  useEffect(() => {
    if (compareState.status === 'success' && hasStrategyValidationErrors) {
      setCompareState({ status: 'idle' });
    }
  }, [hasStrategyValidationErrors, compareState.status]);

  function buildTemporalContextPayload() {
    if (!lotteryDetail || !activeRule) return {};
    return {
      mode: 'modality' as const,
      lotteryId: lotteryDetail.id,
      lotteryCode: lotteryDetail.code,
      ruleVersionId: activeRule.id,
      ...(referenceMode === 'date' && referenceDateInput
        ? { referenceDate: `${referenceDateInput}T12:00:00.000Z` }
        : {}),
      ...(referenceMode === 'contest' && selectedContestId !== ''
        ? { contestId: Number(selectedContestId) }
        : {}),
      universeSize,
      drawnCount,
    };
  }

  function handleNumberClick(num: number) {
    const isFixed = fixedNumbers.includes(num);
    const isExcluded = excludedNumbers.includes(num);

    if (paintBrush === 'clear') {
      setFixedNumbers((prev) => prev.filter((x) => x !== num));
      setExcludedNumbers((prev) => prev.filter((x) => x !== num));
      return;
    }
    if (paintBrush === 'fixed') {
      setExcludedNumbers((prev) => prev.filter((x) => x !== num));
      setFixedNumbers((prev) =>
        isFixed ? prev.filter((x) => x !== num) : [...prev, num].sort((a, b) => a - b)
      );
      return;
    }
    if (paintBrush === 'excluded') {
      setFixedNumbers((prev) => prev.filter((x) => x !== num));
      setExcludedNumbers((prev) =>
        isExcluded ? prev.filter((x) => x !== num) : [...prev, num].sort((a, b) => a - b)
      );
      return;
    }

    // Modo ciclo: Livre -> Fixo -> Excluído -> Livre
    if (!isFixed && !isExcluded) {
      setFixedNumbers((prev) => [...prev, num].sort((a, b) => a - b));
    } else if (isFixed) {
      setFixedNumbers((prev) => prev.filter((x) => x !== num));
      setExcludedNumbers((prev) => [...prev, num].sort((a, b) => a - b));
    } else {
      setExcludedNumbers((prev) => prev.filter((x) => x !== num));
    }
  }

  async function runAnalyzeUniverse() {
    if (!activeRule || !lotteryDetail || constraintError) return;
    setAnalyzeState({ status: 'loading' });
    try {
      const budgetCents = parseBrlToCents(maxBudgetBrl);
      const res = await fetch('/api/math/python/combinations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildTemporalContextPayload(),
          chosenCount,
          fixedNumbers,
          excludedNumbers,
          desiredGamesCount,
          ...(budgetCents !== null ? { maxBudgetCents: budgetCents } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAnalyzeState({
          status: 'error',
          errorCode: json.error ?? `HTTP_${res.status}`,
          errorMessage: json.message ?? 'Falha na análise combinatória.',
        });
        return;
      }
      setAnalyzeState({ status: 'success', data: json });
    } catch (err) {
      setAnalyzeState({
        status: 'error',
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          err instanceof Error ? err.message : 'Falha ao consultar /api/math/python/combinations/analyze.',
      });
    }
  }

  async function runGenerateBets() {
    if (!activeRule || !lotteryDetail || constraintError) return;
    setGenerateState({ status: 'loading' });
    setCopiedMsg(null);
    try {
      const budgetCents = parseBrlToCents(maxBudgetBrl);
      const seedVal = genSeed.trim() ? Number(genSeed) : undefined;
      const body: Record<string, unknown> = {
        ...buildTemporalContextPayload(),
        chosenCount,
        fixedNumbers,
        excludedNumbers,
        desiredGamesCount: Math.min(300, Math.max(1, desiredGamesCount)),
        method: genMethod,
        coverageTargetT: Math.min(genTargetT, Math.min(drawnCount, chosenCount)),
        ...(seedVal !== undefined && Number.isInteger(seedVal) && seedVal >= 0
          ? { seed: seedVal }
          : {}),
        ...(budgetCents !== null ? { maxBudgetCents: budgetCents } : {}),
      };
      if (minEven.trim()) body.minEven = Number(minEven);
      if (maxEven.trim()) body.maxEven = Number(maxEven);
      if (minSum.trim()) body.minSum = Number(minSum);
      if (maxSum.trim()) body.maxSum = Number(maxSum);
      if (maxConsecutive.trim()) body.maxConsecutive = Number(maxConsecutive);

      const res = await fetch('/api/math/python/combinations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setGenerateState({
          status: 'error',
          errorCode: json.error ?? `HTTP_${res.status}`,
          errorMessage: json.message ?? 'Falha na geração controlada de combinações.',
        });
        return;
      }
      setGenerateState({ status: 'success', data: json });
    } catch (err) {
      setGenerateState({
        status: 'error',
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          err instanceof Error ? err.message : 'Falha ao consultar /api/math/python/combinations/generate.',
      });
    }
  }

  async function runCoverageAndSetAnalysis(explicitBets?: number[][]) {
    if (!activeRule || !lotteryDetail) return;
    if (constraintError) {
      setCoverageState({
        status: 'error',
        errorCode: 'CONSTRAINT_ERROR',
        errorMessage: constraintError,
      });
      return;
    }

    const validation = validateBetsClient({
      rawText: explicitBets ? undefined : betsTextarea,
      explicitBets,
      chosenCount,
      universeSize,
      fixedNumbers,
      excludedNumbers,
    });

    if (validation.isEmpty) {
      setCoverageState({
        status: 'error',
        errorCode: 'EMPTY_BETS',
        errorMessage: 'Informe ao menos 1 aposta (uma por linha) para estudar a cobertura e interseções.',
      });
      return;
    }

    if (validation.errors.length > 0) {
      const summary = validation.errors
        .slice(0, 5)
        .map((e) => `Aposta #${e.betIndex}: ${e.reasons.join('; ')}`)
        .join(' | ');
      setCoverageState({
        status: 'error',
        errorCode: 'INVALID_BETS',
        errorMessage: `Conjunto rejeitado sem cálculo de cobertura/probabilidade. ${summary}`,
      });
      return;
    }

    const parsedBets = validation.validBets;
    const activePool = Array.from({ length: universeSize }, (_, i) => i + 1).filter(
      (n) => !excludedNumbers.includes(n)
    );

    setCoverageState({ status: 'loading' });
    try {
      const budgetCents = parseBrlToCents(maxBudgetBrl);
      const [covRes, anaRes] = await Promise.all([
        fetch('/api/math/python/combinations/coverage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...buildTemporalContextPayload(),
            chosenCount,
            bets: parsedBets,
            targetSubsetSize: Math.min(coverageTargetT, Math.min(drawnCount, chosenCount)),
            fixedNumbers,
            excludedNumbers,
            ...(excludedNumbers.length > 0 && activePool.length >= coverageTargetT
              ? { poolNumbers: activePool }
              : {}),
          }),
        }),
        fetch('/api/math/python/combinations/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...buildTemporalContextPayload(),
            chosenCount,
            fixedNumbers,
            excludedNumbers,
            desiredGamesCount: parsedBets.length,
            ...(budgetCents !== null ? { maxBudgetCents: budgetCents } : {}),
            bets: parsedBets,
          }),
        }),
      ]);

      const [covJson, anaJson] = await Promise.all([covRes.json(), anaRes.json()]);
      if (!covRes.ok) {
        setCoverageState({
          status: 'error',
          errorCode: covJson.error ?? `HTTP_${covRes.status}`,
          errorMessage: covJson.message ?? 'Falha ao calcular cobertura.',
        });
        return;
      }
      if (!anaRes.ok) {
        setCoverageState({
          status: 'error',
          errorCode: anaJson.error ?? `HTTP_${anaRes.status}`,
          errorMessage: anaJson.message ?? 'Falha ao analisar conjunto de apostas.',
        });
        return;
      }
      setCoverageState({
        status: 'success',
        coverageData: covJson,
        setAnalysisData: anaJson,
      });
    } catch (err) {
      setCoverageState({
        status: 'error',
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          err instanceof Error ? err.message : 'Falha ao consultar cobertura no motor Python.',
      });
    }
  }

  async function runCompareStrategies() {
    if (!activeRule || !lotteryDetail) return;
    if (hasStrategyValidationErrors) {
      setCompareState({
        status: 'error',
        errorCode: 'INVALID_STRATEGY',
        errorMessage:
          'Corrija as violações de restrições, apostas explícitas ou orçamento nas estratégias antes de comparar.',
      });
      return;
    }

    setCompareState({ status: 'loading' });
    try {
      const res = await fetch('/api/math/python/combinations/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildTemporalContextPayload(),
          strategies: strategies.map((s, idx) => {
            const evalItem = strategyValidations[idx];
            return {
              name: s.name.trim() || `Estratégia ${idx + 1}`,
              chosenCount: s.chosenCount,
              fixedNumbers: evalItem?.fixedNumbers ?? [],
              excludedNumbers: evalItem?.excludedNumbers ?? [],
              desiredGamesCount: Math.min(300, Math.max(1, s.desiredGamesCount)),
              method: s.method,
              coverageTargetT: Math.min(s.coverageTargetT, drawnCount, s.chosenCount),
              seed: 2026 + idx * 17,
              ...(evalItem?.budgetCents !== null && evalItem?.budgetCents !== undefined
                ? { maxBudgetCents: evalItem.budgetCents }
                : {}),
              ...(s.useExplicitBets && evalItem?.validExplicitBets.length
                ? { bets: evalItem.validExplicitBets }
                : {}),
            };
          }),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCompareState({
          status: 'error',
          errorCode: json.error ?? `HTTP_${res.status}`,
          errorMessage: json.message ?? 'Falha ao comparar estratégias.',
        });
        return;
      }
      setCompareState({ status: 'success', data: json });
    } catch (err) {
      setCompareState({
        status: 'error',
        errorCode: 'NETWORK_ERROR',
        errorMessage:
          err instanceof Error ? err.message : 'Falha ao consultar comparador de estratégias.',
      });
    }
  }

  function handleCopyGeneratedBets() {
    if (!generateState.data) return;
    const text = generateState.data.generated_bets
      .map((bet) => bet.map((n) => String(n).padStart(2, '0')).join(' '))
      .join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedMsg(`${generateState.data.generated_bets.length} jogos copiados.`);
  }

  function handleSendGeneratedToCoverage() {
    if (!generateState.data) return;
    const bets = generateState.data.generated_bets;
    const text = bets
      .map((bet) => bet.map((n) => String(n).padStart(2, '0')).join(' '))
      .join('\n');
    setBetsTextarea(text);
    setActiveTab('coverage');
    runCoverageAndSetAnalysis(bets);
  }

  function renderPythonErrorBanner(
    state: { errorCode?: string; errorMessage?: string },
    onRetry: () => void
  ) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-500/35 bg-red-950/20 p-4 text-sm text-red-200"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="font-display font-semibold text-red-200">
              Falha no Motor Matemático Python ({state.errorCode ?? 'ERRO'})
            </p>
            <p className="text-xs leading-relaxed text-red-200/90">
              {state.errorMessage ?? 'Serviço matemático indisponível no momento.'}
            </p>
            <p className="text-[11px] text-red-300/80">
              Nenhum cálculo foi simulado ou substituído localmente no navegador.
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho Científico */}
      <header className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span className="text-[#E5C158] font-medium">Etapa 3 · Laboratório de Combinações</span>
              <span aria-hidden="true">·</span>
              <span>Combinatória Verificável · Motor Python FastAPI</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F1F2F4]">
              Laboratório de Combinações
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-neutral-300">
              Estudo combinatório exato de conjuntos de apostas, restrições de números fixos e
              excluídos, cobertura de subconjuntos, geração controlada sem duplicatas e comparação
              orçamentária. Combinações geradas não constituem previsão de resultados futuros nem
              garantia de premiação.
            </p>
          </div>

          <div className="rounded-lg border border-white/8 bg-[#0D0F14] px-4 py-3 text-xs text-neutral-300 lg:max-w-xs">
            <p className="font-medium text-[#E5C158]">Independência Estatística</p>
            <p className="mt-1 leading-relaxed text-neutral-400">
              Em sorteios justos e independentes, cada combinação simples possui exatamente a mesma
              probabilidade teórica de sorteio.
            </p>
          </div>
        </div>

        {/* Seleção de Modalidade e Vigência Temporal */}
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/8 pt-5 md:grid-cols-3">
          <div>
            <label
              htmlFor="comb-modality-select"
              className="block text-xs font-medium text-neutral-300"
            >
              Modalidade Oficial
            </label>
            <select
              id="comb-modality-select"
              aria-label="Modalidade do Laboratório de Combinações"
              value={selectedLotteryId ?? ''}
              disabled={loadingCatalog || lotteries.length === 0}
              onChange={(e) => setSelectedLotteryId(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
            >
              {lotteries.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.name} ({lot.status === 'active' ? 'Regras Verificadas' : 'Aguardando Configuração'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="comb-ref-mode"
              className="block text-xs font-medium text-neutral-300"
            >
              Vigência Temporal da Regra
            </label>
            <select
              id="comb-ref-mode"
              aria-label="Referência temporal das regras"
              value={referenceMode}
              onChange={(e) => setReferenceMode(e.target.value as ReferenceMode)}
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
            >
              <option value="current">Vigência Atual</option>
              <option value="date">Data Histórica Específica</option>
              <option value="contest">Concurso Histórico</option>
            </select>
          </div>

          <div>
            {referenceMode === 'date' ? (
              <>
                <label
                  htmlFor="comb-ref-date"
                  className="block text-xs font-medium text-neutral-300"
                >
                  Data de Referência
                </label>
                <input
                  id="comb-ref-date"
                  type="date"
                  value={referenceDateInput}
                  onChange={(e) => setReferenceDateInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 font-mono-tabular text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                />
              </>
            ) : referenceMode === 'contest' ? (
              <>
                <label
                  htmlFor="comb-ref-contest"
                  className="block text-xs font-medium text-neutral-300"
                >
                  Concurso Verificado
                </label>
                <select
                  id="comb-ref-contest"
                  value={selectedContestId}
                  onChange={(e) =>
                    setSelectedContestId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                >
                  {contests.length === 0 ? (
                    <option value="">Nenhum concurso ingerido nesta etapa</option>
                  ) : (
                    contests.map((c) => (
                      <option key={c.id} value={c.id}>
                        Concurso #{c.contestNumber}
                      </option>
                    ))
                  )}
                </select>
              </>
            ) : (
              <div className="flex h-full flex-col justify-end">
                <p className="text-xs text-neutral-400">Regra Verificada Ativa</p>
                <p className="mt-1 font-mono-tabular text-xs text-neutral-200">
                  {activeRule
                    ? `v${activeRule.versionNumber} (ID #${activeRule.id}) · Universo 1..${universeSize} · Sorteio ${drawnCount}`
                    : 'Nenhuma regra verificada vigente'}
                </p>
              </div>
            )}
          </div>
        </div>

        {catalogError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-red-200">
            {catalogError}
          </div>
        )}
      </header>

      {/* Bloqueio explícito se modalidade aguarda configuração */}
      {!loadingCatalog && lotteryDetail && !activeRule && (
        <section className="rounded-xl border border-amber-500/30 bg-[#12141A] p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="space-y-2">
              <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                Modalidade aguardando configuração oficial ({lotteryDetail.name})
              </h2>
              <p className="text-sm text-neutral-300">
                Esta modalidade ainda não possui versão de regras verificada e vigente para a data
                selecionada ({effectiveRefDate.toISOString().slice(0, 10)}). O Laboratório de
                Combinações não inventa parâmetros nem tabelas de preços sem comprovação oficial.
              </p>
              {lotteryDetail.ruleVersions.length > 0 && (
                <div className="mt-2 space-y-1 text-xs text-neutral-400">
                  {lotteryDetail.ruleVersions.map((rv) => (
                    <p key={rv.id}>
                      v{rv.versionNumber} (#{rv.id}):{' '}
                      {classifyRuleTemporalStatus(rv, effectiveRefDate) === 'future'
                        ? 'Vigência futura'
                        : classifyRuleTemporalStatus(rv, effectiveRefDate) === 'expired'
                          ? 'Expirada'
                          : 'Não verificada'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Workspace Completo quando há regra oficial verificada */}
      {activeRule && lotteryDetail && (
        <>
          {/* Painel de Configuração Combinatória + Matriz de Fixos/Excluídos/Livres */}
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                    Parâmetros da Aposta & Orçamento
                  </h2>
                  <span className="font-mono-tabular text-xs text-[#E5C158]">
                    {lotteryDetail.name} · v{activeRule.versionNumber}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="comb-chosen-count"
                      className="block text-xs text-neutral-400"
                    >
                      Dezenas por aposta (m)
                    </label>
                    <select
                      id="comb-chosen-count"
                      value={chosenCount}
                      onChange={(e) => setChosenCount(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 font-mono-tabular text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    >
                      {Array.from(
                        { length: Math.max(1, maxChoose - minChoose + 1) },
                        (_, idx) => minChoose + idx
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m} dezenas
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="comb-desired-games"
                      className="block text-xs text-neutral-400"
                    >
                      Apostas desejadas
                    </label>
                    <input
                      id="comb-desired-games"
                      type="number"
                      min={1}
                      max={300}
                      value={desiredGamesCount}
                      onChange={(e) =>
                        setDesiredGamesCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))
                      }
                      className="mt-1 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 font-mono-tabular text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="comb-max-budget"
                      className="block text-xs text-neutral-400"
                    >
                      Orçamento Máximo (R$)
                    </label>
                    <input
                      id="comb-max-budget"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 120,00"
                      value={maxBudgetBrl}
                      onChange={(e) => setMaxBudgetBrl(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 font-mono-tabular text-sm text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Resumo de Preço Oficial & Partição */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/8 bg-[#0D0F14] p-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-neutral-400">Fixos |F|</span>
                    <p className="mt-0.5 font-mono-tabular text-base font-semibold text-[#E5C158]">
                      {fixedNumbers.length}
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400">Excluídos |E|</span>
                    <p className="mt-0.5 font-mono-tabular text-base font-semibold text-red-400">
                      {excludedNumbers.length}
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400">Livres |V|</span>
                    <p className="mt-0.5 font-mono-tabular text-base font-semibold text-[#F1F2F4]">
                      {variableCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-neutral-400">Aposta Simples</span>
                    <p className="mt-0.5 font-mono-tabular text-base font-semibold text-neutral-200">
                      {formatBrlFromCents(activeRule.simpleBetPriceCents)}
                    </p>
                  </div>
                </div>

                {activeRule.priceUpdatedAt && (
                  <p className="text-[11px] text-neutral-500">
                    Tarifa oficial de referência atualizada em{' '}
                    <span className="font-mono-tabular text-neutral-300">
                      {activeRule.priceUpdatedAt.slice(0, 10)}
                    </span>{' '}
                    · Fonte: {activeRule.priceSource ?? activeRule.officialSource}
                  </p>
                )}

                {constraintError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-950/20 px-3 py-2.5 text-xs text-red-200">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                    <span>{constraintError}</span>
                  </div>
                )}
              </div>

              {/* Matriz 1..N de Seleção Fixo / Excluído / Livre */}
              <div className="space-y-3 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
                      Matriz de Restrições (1..{universeSize})
                    </h2>
                    <p className="text-xs text-neutral-400">
                      Clique para marcar Fixos (obrigatórios), Excluídos ou manter Livres.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        ['toggle', 'Alternar'],
                        ['fixed', 'Marcar Fixo'],
                        ['excluded', 'Marcar Excluído'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPaintBrush(id)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors whitespace-nowrap cursor-pointer ${
                          paintBrush === id
                            ? 'border-[#D4AF37]/60 bg-[#181B22] text-[#E5C158] font-medium'
                            : 'border-white/10 bg-[#0D0F14] text-neutral-300 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setFixedNumbers([]);
                        setExcludedNumbers([]);
                      }}
                      className="rounded-md border border-white/10 bg-[#0D0F14] px-2.5 py-1 text-xs text-neutral-400 hover:text-white whitespace-nowrap cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div
                  className="grid grid-cols-10 gap-1.5 rounded-lg border border-white/8 bg-[#0D0F14] p-3"
                  role="group"
                  aria-label="Grade de dezenas fixas e excluídas"
                >
                  {Array.from({ length: universeSize }, (_, i) => i + 1).map((num) => {
                    const isFixed = fixedNumbers.includes(num);
                    const isExcluded = excludedNumbers.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleNumberClick(num)}
                        aria-pressed={isFixed || isExcluded}
                        aria-label={`Dezena ${String(num).padStart(2, '0')} (${
                          isFixed ? 'Fixa' : isExcluded ? 'Excluída' : 'Livre'
                        })`}
                        className={`min-h-[34px] rounded-md border font-mono-tabular text-xs transition-colors cursor-pointer ${
                          isFixed
                            ? 'border-[#D4AF37] bg-[#D4AF37]/20 font-semibold text-[#E5C158]'
                            : isExcluded
                              ? 'border-red-500/45 bg-red-950/35 text-red-300 line-through'
                              : 'border-white/8 bg-[#12141A] text-neutral-300 hover:border-white/25'
                        }`}
                      >
                        {String(num).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs border border-[#D4AF37] bg-[#D4AF37]/25" />
                    <span>Fixo (obrigatório em todas as apostas)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs border border-red-500/50 bg-red-950/40" />
                    <span>Excluído (removido do espaço)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs border border-white/12 bg-[#12141A]" />
                    <span>Livre</span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Navegação dos Submódulos do Laboratório de Combinações */}
          <div
            role="tablist"
            aria-label="Ferramentas do Laboratório de Combinações"
            className="flex flex-wrap gap-2 border-b border-white/8 pb-3"
          >
            {(
              [
                { id: 'universe', label: 'Universo, Fixos & Orçamento', icon: Layers },
                { id: 'generator', label: 'Gerador Controlado', icon: Sparkles },
                { id: 'coverage', label: 'Cobertura & Análise de Conjunto', icon: CheckCircle2 },
                { id: 'comparator', label: 'Comparador de Estratégias (até 5)', icon: BarChart2 },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-[#D4AF37]/60 bg-[#181B22] text-[#E5C158]'
                      : 'border-white/8 bg-[#12141A] text-neutral-300 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: UNIVERSO RESTRITO, PERMUTAÇÕES & ORÇAMENTO */}
          {activeTab === 'universe' && (
            <section className="space-y-5 rounded-xl border border-white/8 bg-[#12141A] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                    Espaço Combinatório Restrito, Permutações e Orçamento
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Calcula exatamente |Ω_restrito| = C(|V|, m − |F|), custo unitário oficial e
                    impacto do teto orçamentário no motor Python.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(constraintError) || analyzeState.status === 'loading'}
                  onClick={runAnalyzeUniverse}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {analyzeState.status === 'loading' ? 'Calculando no Python…' : 'Calcular Espaço & Orçamento'}
                </button>
              </div>

              {analyzeState.status === 'error' &&
                renderPythonErrorBanner(analyzeState, runAnalyzeUniverse)}

              {analyzeState.status === 'success' && analyzeState.data && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4">
                      <span className="text-xs text-neutral-400">Universo Completo C(N, m)</span>
                      <p className="mt-2 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                        {formatBigIntPtBr(
                          analyzeState.data.combinatorics.total_unrestricted_combinations
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        Espaço simples C(N, k):{' '}
                        {formatBigIntPtBr(
                          analyzeState.data.combinatorics.total_simple_space_combinations
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#D4AF37]/30 bg-[#0D0F14] p-4">
                      <span className="text-xs text-[#E5C158]">Espaço Restrito |Ω_restrito|</span>
                      <p className="mt-2 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                        {formatBigIntPtBr(analyzeState.data.combinatorics.restricted_combinations)}
                      </p>
                      <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                        {analyzeState.data.combinatorics.restricted_share_percentage} do total · Fator{' '}
                        {analyzeState.data.combinatorics.reduction_factor.toLocaleString('pt-BR')}×
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4">
                      <span className="text-xs text-neutral-400">Apostas que Cabem no Orçamento</span>
                      <p className="mt-2 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                        {analyzeState.data.budget_and_costs.planned_games_count} /{' '}
                        {analyzeState.data.budget_and_costs.desired_games_count}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        Custo unitário ({chosenCount}d):{' '}
                        <span className="font-mono-tabular text-neutral-200">
                          {formatBrlFromCents(analyzeState.data.budget_and_costs.unit_bet_cost_cents)}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4">
                      <span className="text-xs text-neutral-400">Custo Planejado & Sobra</span>
                      <p className="mt-2 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                        {formatBrlFromCents(
                          analyzeState.data.budget_and_costs.planned_total_cost_cents
                        )}
                      </p>
                      <p className="mt-1 font-mono-tabular text-[11px] text-neutral-400">
                        Saldo restante:{' '}
                        {analyzeState.data.budget_and_costs.remaining_budget_cents !== null
                          ? formatBrlFromCents(
                              analyzeState.data.budget_and_costs.remaining_budget_cents
                            )
                          : 'Sem teto definido'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4 text-xs space-y-2">
                      <p className="font-display text-sm font-semibold text-[#F1F2F4]">
                        Fórmula Combinatória & Distinção de Permutações
                      </p>
                      <p className="font-mono-tabular text-[#E5C158]">
                        {analyzeState.data.combinatorics.formula}
                      </p>
                      <p className="font-mono-tabular text-neutral-300">
                        {analyzeState.data.combinatorics.substituted_formula}
                      </p>
                      <p className="text-neutral-400">
                        Simples equivalentes C({chosenCount}, {drawnCount}):{' '}
                        <span className="font-mono-tabular text-neutral-200">
                          {formatBigIntPtBr(
                            analyzeState.data.combinatorics.equivalent_simple_bets_per_game
                          )}
                        </span>{' '}
                        · Arranjos ordenados P({chosenCount}, {drawnCount}):{' '}
                        <span className="font-mono-tabular text-neutral-200">
                          {formatBigIntPtBr(analyzeState.data.combinatorics.permutations_k_from_m)}
                        </span>
                      </p>
                      <p className="leading-relaxed text-neutral-400">
                        {analyzeState.data.combinatorics.permutations_applicability_note}
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4 text-xs space-y-2">
                      <p className="font-display text-sm font-semibold text-[#F1F2F4]">
                        Auditoria Orçamentária & Combinações Deixadas de Fora
                      </p>
                      <p className="text-neutral-300">
                        Deixadas de fora pelo limite de orçamento:{' '}
                        <span className="font-mono-tabular font-semibold text-[#E5C158]">
                          {formatBigIntPtBr(analyzeState.data.budget_and_costs.left_out_by_budget)}
                        </span>{' '}
                        apostas
                      </p>
                      <p className="text-neutral-300">
                        Deixadas de fora em relação ao espaço restrito |Ω_restrito|:{' '}
                        <span className="font-mono-tabular text-neutral-200">
                          {formatBigIntPtBr(
                            analyzeState.data.budget_and_costs.left_out_from_restricted_space
                          )}
                        </span>{' '}
                        combinações
                      </p>
                      <p className="text-neutral-400">
                        Custo para fechar todo o espaço restrito:{' '}
                        <span className="font-mono-tabular text-neutral-200">
                          {formatBrlFromCents(
                            analyzeState.data.budget_and_costs.full_restricted_closure_cost_cents
                          )}
                        </span>
                      </p>
                      <p className="text-neutral-400">
                        Participação exata planejada no espaço restrito:{' '}
                        <span className="font-mono-tabular text-neutral-200">
                          {analyzeState.data.budget_and_costs.planned_vs_restricted_fraction} (
                          {analyzeState.data.budget_and_costs.planned_vs_restricted_percentage})
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: GERADOR CONTROLADO SEM DUPLICATAS */}
          {activeTab === 'generator' && (
            <section className="space-y-5 rounded-xl border border-white/8 bg-[#12141A] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                    Gerador Controlado de Combinações (Zero Duplicatas)
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Gera apostas respeitando fixos, excluídos, filtros de composição e orçamento
                    máximo, distinguindo métodos exatos de heurísticas.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(constraintError) || generateState.status === 'loading'}
                  onClick={runGenerateBets}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {generateState.status === 'loading' ? 'Gerando no Python…' : 'Gerar Combinações'}
                </button>
              </div>

              {/* Controles de Método, Semente e Filtros de Composição */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-white/8 bg-[#0D0F14] p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label htmlFor="gen-method" className="block text-xs text-neutral-400">
                    Método de Construção
                  </label>
                  <select
                    id="gen-method"
                    value={genMethod}
                    onChange={(e) => setGenMethod(e.target.value as GenerationMethod)}
                    className="mt-1 w-full rounded-lg border border-white/12 bg-[#12141A] px-3 py-2 text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    {Object.entries(METHOD_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="gen-target-t" className="block text-xs text-neutral-400">
                    Alvo de cobertura (t)
                  </label>
                  <select
                    id="gen-target-t"
                    value={genTargetT}
                    onChange={(e) => setGenTargetT(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/12 bg-[#12141A] px-3 py-2 font-mono-tabular text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  >
                    {Array.from(
                      { length: Math.max(1, Math.min(drawnCount, chosenCount)) },
                      (_, i) => i + 1
                    ).map((t) => (
                      <option key={t} value={t}>
                        t = {t} dezenas
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="gen-seed" className="block text-xs text-neutral-400">
                    Semente reproduzível
                  </label>
                  <input
                    id="gen-seed"
                    type="number"
                    min={0}
                    value={genSeed}
                    disabled={genMethod === 'exhaustive'}
                    onChange={(e) => setGenSeed(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/12 bg-[#12141A] px-3 py-2 font-mono-tabular text-xs text-[#F1F2F4] disabled:opacity-50 focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="gen-min-even" className="block text-xs text-neutral-400">
                    Pares mínimos
                  </label>
                  <input
                    id="gen-min-even"
                    type="number"
                    min={0}
                    max={chosenCount}
                    placeholder="Opcional"
                    value={minEven}
                    onChange={(e) => setMinEven(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/12 bg-[#12141A] px-3 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                  />
                </div>
                <div>
                  <label htmlFor="gen-max-even" className="block text-xs text-neutral-400">
                    Pares máximos
                  </label>
                  <input
                    id="gen-max-even"
                    type="number"
                    min={0}
                    max={chosenCount}
                    placeholder="Opcional"
                    value={maxEven}
                    onChange={(e) => setMaxEven(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/12 bg-[#12141A] px-3 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                  />
                </div>
                <div>
                  <label htmlFor="gen-min-sum" className="block text-xs text-neutral-400">
                    Soma mínima / máxima
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      id="gen-min-sum"
                      type="number"
                      min={0}
                      placeholder="Mín"
                      value={minSum}
                      onChange={(e) => setMinSum(e.target.value)}
                      className="w-1/2 rounded-lg border border-white/12 bg-[#12141A] px-2.5 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                    />
                    <input
                      aria-label="Soma máxima"
                      type="number"
                      min={0}
                      placeholder="Máx"
                      value={maxSum}
                      onChange={(e) => setMaxSum(e.target.value)}
                      className="w-1/2 rounded-lg border border-white/12 bg-[#12141A] px-2.5 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="gen-max-consec" className="block text-xs text-neutral-400">
                    Máx. consecutivas
                  </label>
                  <input
                    id="gen-max-consec"
                    type="number"
                    min={1}
                    max={chosenCount}
                    placeholder="Ex: 3"
                    value={maxConsecutive}
                    onChange={(e) => setMaxConsecutive(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/12 bg-[#12141A] px-3 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                  />
                </div>
              </div>

              {generateState.status === 'error' &&
                renderPythonErrorBanner(generateState, runGenerateBets)}

              {generateState.status === 'success' && generateState.data && (
                <div className="space-y-4">
                  {/* Banner de Classificação Científica (Exato vs Heurística) */}
                  <div
                    className={`rounded-lg border p-4 text-xs ${
                      generateState.data.method_classification.is_exact_solution
                        ? 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F1F2F4]'
                        : 'border-[#8B5CF6]/40 bg-[#8B5CF6]/10 text-neutral-200'
                    }`}
                  >
                    <p className="font-display text-sm font-semibold text-[#E5C158]">
                      {generateState.data.method_classification.label}
                    </p>
                    <p className="mt-1 leading-relaxed text-neutral-300">
                      {generateState.data.method_classification.disclaimer}
                    </p>
                  </div>

                  {/* Métricas de Geração & Orçamento */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-3 text-xs">
                      <span className="text-neutral-400">Jogos Gerados (0 duplicatas)</span>
                      <p className="mt-1 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                        {generateState.data.generation_summary.generated_count}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-3 text-xs">
                      <span className="text-neutral-400">Custo Total Oficial</span>
                      <p className="mt-1 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                        {formatBrlFromCents(generateState.data.budget_summary.total_cost_cents)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-3 text-xs">
                      <span className="text-neutral-400">
                        Cobertura (t={generateState.data.coverage_summary.target_subset_size})
                      </span>
                      <p className="mt-1 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                        {generateState.data.coverage_summary.coverage.coverage_percentage.toFixed(2)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-3 text-xs">
                      <span className="text-neutral-400">Deixadas de Fora (Espaço)</span>
                      <p className="mt-1 font-mono-tabular text-lg font-semibold text-neutral-200">
                        {formatBigIntPtBr(
                          generateState.data.generation_summary.left_out_from_restricted_space
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Ações & Lista de Apostas Geradas */}
                  <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/8">
                      <span className="font-display text-xs font-semibold text-[#F1F2F4]">
                        Conjunto Gerado ({generateState.data.generated_bets.length} combinações
                        distintas)
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {copiedMsg && (
                          <span className="text-xs text-[#E5C158]">{copiedMsg}</span>
                        )}
                        <button
                          type="button"
                          onClick={handleCopyGeneratedBets}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-[#12141A] px-2.5 py-1 text-xs text-neutral-200 hover:border-white/25 whitespace-nowrap cursor-pointer"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          Copiar Jogos
                        </button>
                        <button
                          type="button"
                          onClick={handleSendGeneratedToCoverage}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#D4AF37]/40 bg-[#12141A] px-2.5 py-1 text-xs font-medium text-[#E5C158] hover:bg-[#181B22] whitespace-nowrap cursor-pointer"
                        >
                          Analisar Cobertura Completa
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-72 overflow-y-auto pr-1">
                      {generateState.data.generated_bets.map((bet, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-md border border-white/6 bg-[#12141A] px-3 py-2 font-mono-tabular text-xs"
                        >
                          <span className="text-neutral-500">#{idx + 1}</span>
                          <span className="text-[#F1F2F4] tracking-wide">
                            {bet.map((n) => String(n).padStart(2, '0')).join(' · ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <OverlapHistogramChart
                      histogram={generateState.data.bet_set_analysis.intersections.overlap_histogram}
                    />
                    <NumberFrequencyChart
                      frequency={generateState.data.bet_set_analysis.distribution.number_frequency}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: SISTEMA DE COBERTURA & ANÁLISE DE CONJUNTO */}
          {activeTab === 'coverage' && (
            <section className="space-y-5 rounded-xl border border-white/8 bg-[#12141A] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                    Estudo de Cobertura de Subconjuntos & Redundância
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Mede exatamente quantos t-subconjuntos são cobertos, exibe subconjuntos
                    descobertos, repetições, interseções e separa cobertura de garantia de prêmio.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    Boolean(constraintError) ||
                    coverageValidation.errors.length > 0 ||
                    coverageState.status === 'loading'
                  }
                  onClick={() => runCoverageAndSetAnalysis()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {coverageState.status === 'loading'
                    ? 'Auditando no Python…'
                    : 'Calcular Cobertura & Interseções'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-9">
                  <label htmlFor="cov-bets-input" className="block text-xs text-neutral-300">
                    Apostas do Conjunto (uma por linha, exatamente {chosenCount} dezenas por aposta)
                  </label>
                  <textarea
                    id="cov-bets-input"
                    rows={5}
                    value={betsTextarea}
                    onChange={(e) => setBetsTextarea(e.target.value)}
                    placeholder={`Exemplos (Mega-Sena 6 dezenas):\n01 02 03 04 05 06\n01 02 07 08 09 10`}
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0D0F14] p-3 font-mono-tabular text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div className="space-y-3 lg:col-span-3">
                  <div>
                    <label htmlFor="cov-target-t" className="block text-xs text-neutral-300">
                      Tamanho do subconjunto (t)
                    </label>
                    <select
                      id="cov-target-t"
                      value={coverageTargetT}
                      onChange={(e) => setCoverageTargetT(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 font-mono-tabular text-xs text-[#F1F2F4] focus:border-[#D4AF37] focus:outline-none"
                    >
                      {Array.from(
                        { length: Math.max(1, Math.min(drawnCount, chosenCount)) },
                        (_, i) => i + 1
                      ).map((t) => (
                        <option key={t} value={t}>
                          t = {t} dezenas
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] leading-relaxed text-neutral-400">
                    {excludedNumbers.length > 0
                      ? `Pool ativo P = U \\ E (${universeSize - excludedNumbers.length} dezenas).`
                      : `Pool ativo P = universo completo (1..${universeSize}).`}
                    {fixedNumbers.length > 0
                      ? ` Fixos obrigatórios: ${fixedNumbers.map((n) => String(n).padStart(2, '0')).join(', ')}.`
                      : ''}
                  </p>
                </div>
              </div>

              {!coverageValidation.isEmpty && coverageValidation.errors.length > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/35 bg-red-950/20 p-3.5 text-xs text-red-200 space-y-1.5"
                >
                  <p className="font-display font-semibold text-red-200 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                    <span>
                      Conjunto inválido ({coverageValidation.errors.length} aposta(s) com violação) —
                      cálculo bloqueado
                    </span>
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5 text-red-200/90">
                    {coverageValidation.errors.slice(0, 6).map((issue) => (
                      <li key={issue.betIndex}>
                        <span className="font-mono-tabular font-semibold">Aposta #{issue.betIndex}:</span>{' '}
                        {issue.reasons.join('; ')}.
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {coverageState.status === 'error' &&
                renderPythonErrorBanner(coverageState, () => runCoverageAndSetAnalysis())}

              {coverageState.status === 'success' &&
                coverageState.coverageData &&
                coverageState.setAnalysisData?.bet_set_analysis && (
                  <div className="space-y-4">
                    {/* Aviso Obrigatório: Cobertura != Garantia de Prêmio */}
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-950/15 p-3.5 text-xs text-amber-100">
                      <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                        aria-hidden="true"
                      />
                      <p className="leading-relaxed">
                        {coverageState.coverageData.coverage_vs_guarantee_notice}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border border-[#D4AF37]/30 bg-[#0D0F14] p-4 text-xs">
                        <span className="text-neutral-400">
                          Cobertura t={coverageState.coverageData.target_subset_size} (Pool{' '}
                          {coverageState.coverageData.pool_size})
                        </span>
                        <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#E5C158]">
                          {coverageState.coverageData.coverage.coverage_percentage.toFixed(4)}%
                        </p>
                        <p className="mt-0.5 font-mono-tabular text-[11px] text-neutral-400">
                          {coverageState.coverageData.coverage.coverage_fraction}
                        </p>
                      </div>

                      <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4 text-xs">
                        <span className="text-neutral-400">Subconjuntos Cobertos / Faltantes</span>
                        <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                          {formatBigIntPtBr(
                            coverageState.coverageData.coverage.covered_subsets_count
                          )}{' '}
                          /{' '}
                          <span className="text-neutral-400">
                            {formatBigIntPtBr(
                              coverageState.coverageData.coverage.uncovered_subsets_count
                            )}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {coverageState.coverageData.coverage.is_full_coverage_proven
                            ? 'Cobertura integral 100% comprovada (0 descobertos)'
                            : 'Cobertura parcial (há subconjuntos descobertos)'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4 text-xs">
                        <span className="text-neutral-400">Distintas vs. Repetidas</span>
                        <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                          {
                            coverageState.setAnalysisData.bet_set_analysis.counts
                              .distinct_bets_count
                          }{' '}
                          /{' '}
                          <span className="text-red-300">
                            {
                              coverageState.setAnalysisData.bet_set_analysis.counts
                                .repeated_bets_count
                            }{' '}
                            rep.
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          Desperdício em repetidas:{' '}
                          {formatBrlFromCents(
                            coverageState.setAnalysisData.bet_set_analysis.costs
                              .wasted_on_duplicates_cents
                          )}
                        </p>
                      </div>

                      <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4 text-xs">
                        <span className="text-neutral-400">Redundância & Sobreposição Média</span>
                        <p className="mt-1.5 font-mono-tabular text-lg font-semibold text-[#F1F2F4]">
                          {coverageState.setAnalysisData.bet_set_analysis.redundancy
                            .redundancy_rate_percentage ?? 'N/D'}
                        </p>
                        <p className="mt-0.5 font-mono-tabular text-[11px] text-neutral-400">
                          Média par-a-par:{' '}
                          {coverageState.setAnalysisData.bet_set_analysis.intersections.avg_overlap}{' '}
                          dezenas em comum
                        </p>
                      </div>
                    </div>

                    {coverageState.coverageData.uncovered_sample.length > 0 && (
                      <div className="rounded-lg border border-white/8 bg-[#0D0F14] p-4 text-xs">
                        <p className="font-display font-semibold text-[#F1F2F4]">
                          Amostra de Subconjuntos Descobertos (
                          {coverageState.coverageData.coverage.enumeration_mode === 'exhaustive'
                            ? 'Enumeração exaustiva'
                            : 'Amostra verificada'}
                          )
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {coverageState.coverageData.uncovered_sample.slice(0, 20).map((sub, i) => (
                            <span
                              key={i}
                              className="rounded-md border border-white/10 bg-[#12141A] px-2 py-1 font-mono-tabular text-[11px] text-neutral-300"
                            >
                              {sub.map((n) => String(n).padStart(2, '0')).join(' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <OverlapHistogramChart
                        histogram={
                          coverageState.setAnalysisData.bet_set_analysis.intersections
                            .overlap_histogram
                        }
                      />
                      <NumberFrequencyChart
                        frequency={
                          coverageState.setAnalysisData.bet_set_analysis.distribution
                            .number_frequency
                        }
                      />
                    </div>
                  </div>
                )}
            </section>
          )}

          {/* TAB 4: COMPARADOR SIMULTÂNEO DE ATÉ 5 ESTRATÉGIAS */}
          {activeTab === 'comparator' && (
            <section className="space-y-5 rounded-xl border border-white/8 bg-[#12141A] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
                    Comparador de Estratégias Combinatórias (até 5 simultâneas)
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Compara custo oficial, combinações simples distintas, interseções, cobertura de
                    subconjuntos e deltas em relação à Estratégia #1.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {strategies.length < 5 && (
                    <button
                      type="button"
                      onClick={() =>
                        setStrategies((prev) => [
                          ...prev,
                          {
                            id: `s-${Date.now()}`,
                            name: `Estratégia ${prev.length + 1}`,
                            chosenCount,
                            desiredGamesCount: 10,
                            method: 'coverage_heuristic',
                            coverageTargetT: Math.min(3, drawnCount, chosenCount),
                            maxBudgetBrl: maxBudgetBrl || '120',
                            useCurrentConstraints: true,
                            customFixedInput: '',
                            customExcludedInput: '',
                            useExplicitBets: false,
                            explicitBetsInput: '',
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#0D0F14] px-3 py-2 text-xs font-medium text-neutral-200 hover:border-white/25 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Adicionar Estratégia ({strategies.length}/5)
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={hasStrategyValidationErrors || compareState.status === 'loading'}
                    onClick={runCompareStrategies}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {compareState.status === 'loading'
                      ? 'Comparando no Python…'
                      : 'Comparar Estratégias'}
                  </button>
                </div>
              </div>

              {/* Editor das Estratégias (1..5) */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {strategies.map((strat, idx) => {
                  const stratEval = strategyValidations[idx];
                  const hasErr = (stratEval?.errors.length ?? 0) > 0;
                  return (
                    <div
                      key={strat.id}
                      className={`space-y-2.5 rounded-lg border bg-[#0D0F14] p-4 text-xs ${
                        hasErr ? 'border-red-500/45' : 'border-white/8'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-[#E5C158] font-medium">
                          Estratégia #{idx + 1} {idx === 0 ? '(Referência)' : ''}
                        </span>
                        {strategies.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remover estratégia ${strat.name}`}
                            onClick={() =>
                              setStrategies((prev) => prev.filter((item) => item.id !== strat.id))
                            }
                            className="rounded p-1 text-neutral-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        aria-label={`Nome da estratégia ${idx + 1}`}
                        value={strat.name}
                        onChange={(e) =>
                          setStrategies((prev) =>
                            prev.map((item) =>
                              item.id === strat.id ? { ...item, name: e.target.value } : item
                            )
                          )
                        }
                        className="w-full rounded-md border border-white/12 bg-[#12141A] px-2.5 py-1.5 text-xs text-[#F1F2F4]"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-neutral-400">Dezenas (m)</span>
                          <select
                            value={strat.chosenCount}
                            onChange={(e) =>
                              setStrategies((prev) =>
                                prev.map((item) =>
                                  item.id === strat.id
                                    ? { ...item, chosenCount: Number(e.target.value) }
                                    : item
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] px-2 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                          >
                            {Array.from(
                              { length: Math.max(1, maxChoose - minChoose + 1) },
                              (_, i) => minChoose + i
                            ).map((m) => (
                              <option key={m} value={m}>
                                {m}d
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-[11px] text-neutral-400">Jogos</span>
                          <input
                            type="number"
                            min={1}
                            max={300}
                            disabled={strat.useExplicitBets}
                            value={strat.desiredGamesCount}
                            onChange={(e) =>
                              setStrategies((prev) =>
                                prev.map((item) =>
                                  item.id === strat.id
                                    ? {
                                        ...item,
                                        desiredGamesCount: Math.max(
                                          1,
                                          Math.min(300, Number(e.target.value) || 1)
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] px-2 py-1.5 font-mono-tabular text-xs text-[#F1F2F4] disabled:opacity-50"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-neutral-400">Método</span>
                          <select
                            disabled={strat.useExplicitBets}
                            value={strat.method}
                            onChange={(e) =>
                              setStrategies((prev) =>
                                prev.map((item) =>
                                  item.id === strat.id
                                    ? { ...item, method: e.target.value as GenerationMethod }
                                    : item
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] px-2 py-1.5 text-[11px] text-[#F1F2F4] disabled:opacity-50"
                          >
                            <option value="uniform_sampling">Amostragem</option>
                            <option value="coverage_heuristic">Heurística</option>
                            <option value="combinatorial_search">Busca 1-opt</option>
                            <option value="exhaustive">Exaustiva</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-[11px] text-neutral-400">Orçamento (R$)</span>
                          <input
                            type="text"
                            value={strat.maxBudgetBrl}
                            onChange={(e) =>
                              setStrategies((prev) =>
                                prev.map((item) =>
                                  item.id === strat.id
                                    ? { ...item, maxBudgetBrl: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] px-2 py-1.5 font-mono-tabular text-xs text-[#F1F2F4]"
                          />
                        </label>
                      </div>

                      <div className="space-y-1.5 border-t border-white/6 pt-2">
                        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={strat.useCurrentConstraints}
                            onChange={(e) =>
                              setStrategies((prev) =>
                                prev.map((item) =>
                                  item.id === strat.id
                                    ? { ...item, useCurrentConstraints: e.target.checked }
                                    : item
                                )
                              )
                            }
                            className="rounded border-white/20 bg-[#12141A]"
                          />
                          <span>Usar fixos/excluídos da grade global</span>
                        </label>

                        {!strat.useCurrentConstraints && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <label className="block">
                              <span className="text-[10px] text-neutral-400">
                                Fixos próprios
                              </span>
                              <input
                                type="text"
                                aria-label={`Fixos próprios da estratégia ${idx + 1}`}
                                placeholder="Ex: 01 02"
                                value={strat.customFixedInput}
                                onChange={(e) =>
                                  setStrategies((prev) =>
                                    prev.map((item) =>
                                      item.id === strat.id
                                        ? { ...item, customFixedInput: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] px-2 py-1 font-mono-tabular text-[11px] text-[#F1F2F4]"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[10px] text-neutral-400">
                                Excluídos próprios
                              </span>
                              <input
                                type="text"
                                aria-label={`Excluídos próprios da estratégia ${idx + 1}`}
                                placeholder="Ex: 59 60"
                                value={strat.customExcludedInput}
                                onChange={(e) =>
                                  setStrategies((prev) =>
                                    prev.map((item) =>
                                      item.id === strat.id
                                        ? { ...item, customExcludedInput: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] px-2 py-1 font-mono-tabular text-[11px] text-[#F1F2F4]"
                              />
                            </label>
                          </div>
                        )}

                        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={strat.useExplicitBets}
                            onChange={(e) =>
                              setStrategies((prev) =>
                                prev.map((item) =>
                                  item.id === strat.id
                                    ? { ...item, useExplicitBets: e.target.checked }
                                    : item
                                )
                              )
                            }
                            className="rounded border-white/20 bg-[#12141A]"
                          />
                          <span>Informar apostas explícitas manualmente</span>
                        </label>

                        {strat.useExplicitBets && (
                          <label className="block pt-1">
                            <span className="text-[10px] text-neutral-400">
                              Apostas ({strat.chosenCount} dezenas por linha)
                            </span>
                            <textarea
                              rows={3}
                              aria-label={`Apostas explícitas da estratégia ${idx + 1}`}
                              placeholder={`01 02 03 04 05 06`}
                              value={strat.explicitBetsInput}
                              onChange={(e) =>
                                setStrategies((prev) =>
                                  prev.map((item) =>
                                    item.id === strat.id
                                      ? { ...item, explicitBetsInput: e.target.value }
                                      : item
                                  )
                                )
                              }
                              className="mt-0.5 w-full rounded-md border border-white/12 bg-[#12141A] p-2 font-mono-tabular text-[11px] text-[#F1F2F4]"
                            />
                          </label>
                        )}
                      </div>

                      {hasErr && stratEval && (
                        <div
                          role="alert"
                          className="rounded-md border border-red-500/35 bg-red-950/25 px-2.5 py-2 text-[11px] text-red-200 space-y-0.5"
                        >
                          {stratEval.errors.map((errMsg, eIdx) => (
                            <p key={eIdx}>{errMsg}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {compareState.status === 'error' &&
                renderPythonErrorBanner(compareState, runCompareStrategies)}

              {compareState.status === 'success' && compareState.data && (
                <div className="space-y-5">
                  {compareState.data.has_heterogeneous_universes &&
                    compareState.data.universe_comparison_notice && (
                      <div
                        role="status"
                        className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-950/20 p-3.5 text-xs text-amber-100"
                      >
                        <AlertTriangle
                          className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                          aria-hidden="true"
                        />
                        <p className="leading-relaxed">
                          {compareState.data.universe_comparison_notice}
                        </p>
                      </div>
                    )}

                  <StrategyComparisonChart
                    strategies={compareState.data.strategies}
                    hasHeterogeneousUniverses={compareState.data.has_heterogeneous_universes}
                  />

                  <div className="overflow-x-auto rounded-lg border border-white/8 bg-[#0D0F14]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/8 text-neutral-400">
                          <th className="py-3 px-4 font-medium">Estratégia & Universo Ativo</th>
                          <th className="py-3 px-3 font-medium text-right">Jogos</th>
                          <th className="py-3 px-3 font-medium text-right">Custo Total</th>
                          <th className="py-3 px-3 font-medium text-right">Δ Custo</th>
                          <th className="py-3 px-3 font-medium text-right">Simples Distintas</th>
                          <th className="py-3 px-3 font-medium text-right">Cobertura (t)</th>
                          <th className="py-3 px-3 font-medium text-right">Δ Cobertura</th>
                          <th className="py-3 px-4 font-medium text-right">Natureza</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6 font-mono-tabular">
                        {compareState.data.strategies.map((s) => (
                          <tr key={s.index} className="hover:bg-white/[0.02]">
                            <td className="py-3 px-4 font-sans text-neutral-200">
                              <div className="font-medium">
                                #{s.index} · {s.name} ({s.chosen_count}d)
                              </div>
                              <div className="mt-0.5 font-mono-tabular text-[11px] text-neutral-400">
                                Pool |P|={s.restrictions.pool_size} · Fixos:{' '}
                                {s.restrictions.fixed_numbers.length} · Excl:{' '}
                                {s.restrictions.excluded_numbers.length} · |Ω_restrito|=
                                {formatBigIntPtBr(s.restrictions.restricted_combinations)}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right text-neutral-200">{s.bets_count}</td>
                            <td className="py-3 px-3 text-right text-[#E5C158]">
                              {formatBrlFromCents(s.total_cost_cents)}
                            </td>
                            <td className="py-3 px-3 text-right text-neutral-400">
                              {s.index === 1
                                ? 'Base'
                                : s.delta_vs_baseline.cost_cents !== null
                                  ? formatBrlFromCents(s.delta_vs_baseline.cost_cents)
                                  : '—'}
                            </td>
                            <td className="py-3 px-3 text-right text-neutral-200">
                              {s.distinct_simple_combinations
                                ? formatBigIntPtBr(s.distinct_simple_combinations)
                                : 'N/D'}
                            </td>
                            <td className="py-3 px-3 text-right text-[#E5C158]">
                              {s.coverage.coverage_percentage.toFixed(2)}% (t=
                              {s.coverage.target_subset_size})
                            </td>
                            <td className="py-3 px-3 text-right text-neutral-300">
                              {s.index === 1
                                ? 'Base'
                                : !s.coverage_comparable_with_baseline ||
                                    s.delta_vs_baseline.coverage_percentage_points === null
                                  ? 'Universos distintos'
                                  : `${s.delta_vs_baseline.coverage_percentage_points >= 0 ? '+' : ''}${s.delta_vs_baseline.coverage_percentage_points.toFixed(2)} p.p.`}
                            </td>
                            <td className="py-3 px-4 font-sans text-right text-neutral-400">
                              {s.is_exact_method ? 'Exata' : 'Heurística / Amostral'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};
