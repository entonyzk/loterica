import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';

interface SpecialEventItem {
  id: number;
  name: string;
  eventType: string;
  year: number;
  inheritsMainRules: boolean;
  applicableRules: { note?: string } | null;
}

interface ActiveRuleSummary {
  id: number;
  versionNumber: number;
  mathModelType: string;
  numberUniverseMin: number | null;
  numberUniverseMax: number | null;
  drawnNumbersCount: number | null;
  minNumbersToChoose: number | null;
  maxNumbersToChoose: number | null;
  simpleBetPriceCents: number | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  prizeTiersConfig?: Array<{
    hits: number;
    tierName: string;
    tierOrder: number;
    isMainPrize: boolean;
  }> | null;
  officialSource: string;
  validFrom: string;
  validTo: string | null;
}

interface LotteryItem {
  id: number;
  name: string;
  code: string;
  description: string;
  status: string;
  specialEvents: SpecialEventItem[];
  ruleVersionsCount: number;
  activeRuleVersionId?: number | null;
  activeRuleSummary?: ActiveRuleSummary | null;
  currentRulesSummary?: { preparedModelType?: string } | null;
  updatedAt: string;
}

function formatBrlFromCents(cents: number | null | undefined): string {
  if (cents == null) return 'Não informado';
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export const LotteriesView: React.FC = () => {
  const [lotteries, setLotteries] = useState<LotteryItem[]>([]);
  const [selected, setSelected] = useState<LotteryItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'with_events' | 'awaiting_rules'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadLotteries() {
      try {
        const res = await fetch('/api/lotteries');
        if (!res.ok) throw new Error('Erro ao carregar modalidades do banco PostgreSQL.');
        const data = await res.json();
        if (!active) return;
        const items: LotteryItem[] = data.items ?? [];
        setLotteries(items);
        if (items.length > 0) setSelected(items[0]);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadLotteries();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return lotteries.filter((item) => {
      if (filter === 'active' && !item.activeRuleSummary) return false;
      if (filter === 'with_events' && item.specialEvents.length === 0) return false;
      if (filter === 'awaiting_rules' && item.status !== 'awaiting_rules') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesEvent = item.specialEvents.some((e) => e.name.toLowerCase().includes(q));
        return matchesName || matchesEvent;
      }
      return true;
    });
  }, [lotteries, filter, search]);

  const activeRule = selected?.activeRuleSummary ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#F1F2F4]">
            Catálogo de Modalidades
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Regras oficiais versionadas em PostgreSQL com vigência temporal, fonte documental e
            modelos matemáticos especializados por modalidade.
          </p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/8 bg-[#12141A] p-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filter === 'all'
                ? 'bg-[#D4AF37] text-[#0A0B0E]'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Todas ({lotteries.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filter === 'active'
                ? 'bg-[#D4AF37] text-[#0A0B0E]'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Regras Verificadas
          </button>
          <button
            type="button"
            onClick={() => setFilter('with_events')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filter === 'with_events'
                ? 'bg-[#D4AF37] text-[#0A0B0E]'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Com Eventos Especiais
          </button>
          <button
            type="button"
            onClick={() => setFilter('awaiting_rules')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filter === 'awaiting_rules'
                ? 'bg-[#D4AF37] text-[#0A0B0E]'
                : 'text-neutral-300 hover:text-white'
            }`}
          >
            Aguardando Regras
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar modalidade ou evento..."
            className="w-full rounded-lg border border-white/10 bg-[#12141A] py-2 pl-9 pr-3 text-sm text-[#F1F2F4] placeholder:text-neutral-500 focus:border-[#D4AF37] focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-[#12141A] p-5 text-sm text-red-300">
          {error}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="h-64 animate-pulse rounded-xl border border-white/8 bg-[#12141A] lg:col-span-5" />
          <div className="h-64 animate-pulse rounded-xl border border-white/8 bg-[#12141A] lg:col-span-7" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Lista de Modalidades */}
          <div className="divide-y divide-white/8 overflow-hidden rounded-xl border border-white/8 bg-[#12141A] lg:col-span-5">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-neutral-400">
                Nenhuma modalidade corresponde ao filtro aplicado.
              </div>
            ) : (
              filtered.map((item) => {
                const isActive = selected?.id === item.id;
                const hasVerified = Boolean(item.activeRuleSummary);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors cursor-pointer ${
                      isActive ? 'bg-[#181B22]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-display text-sm font-semibold ${
                            isActive ? 'text-[#E5C158]' : 'text-[#F1F2F4]'
                          }`}
                        >
                          {item.name}
                        </span>
                        <span className="font-mono-tabular text-xs text-neutral-500">
                          {item.code}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-neutral-400">
                        {hasVerified
                          ? `Regra v${item.activeRuleSummary?.versionNumber} verificada · Aposta simples ${formatBrlFromCents(item.activeRuleSummary?.simpleBetPriceCents)}`
                          : 'Aguardando regras oficiais verificadas'}
                        {item.specialEvents.length > 0
                          ? ` · ${item.specialEvents.map((e) => e.name).join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#E5C158]' : 'text-neutral-500'
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                );
              })
            )}
          </div>

          {/* Painel de Estrutura Versionada da Modalidade Selecionada */}
          <div className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-7">
            {selected ? (
              <div className="space-y-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                    <span className="font-mono-tabular text-[#E5C158]">ID #{selected.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{selected.code}</span>
                    <span aria-hidden="true">·</span>
                    <span>Versões de regra registradas: {selected.ruleVersionsCount}</span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-semibold text-[#F1F2F4]">
                    {selected.name}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                    {selected.description}
                  </p>
                </div>

                <div className="border-t border-white/8 pt-5">
                  <h3 className="text-xs font-semibold text-neutral-200">
                    {activeRule
                      ? `Regra Oficial Vigente v${activeRule.versionNumber} (Verificada)`
                      : 'Estrutura de Configuração Preparada (`lottery_rule_versions`)'}
                  </h3>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                    <div className="flex justify-between border-b border-white/6 pb-2">
                      <dt className="text-neutral-400">Mín. / Máx. de dezenas</dt>
                      <dd className="font-mono-tabular text-neutral-200">
                        {activeRule
                          ? `${activeRule.minNumbersToChoose} a ${activeRule.maxNumbersToChoose} dezenas`
                          : 'Aguardando verificação'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/6 pb-2">
                      <dt className="text-neutral-400">Universo numérico</dt>
                      <dd className="font-mono-tabular text-neutral-200">
                        {activeRule
                          ? `${activeRule.numberUniverseMin} a ${activeRule.numberUniverseMax}`
                          : 'Aguardando verificação'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/6 pb-2">
                      <dt className="text-neutral-400">Dezenas sorteadas</dt>
                      <dd className="font-mono-tabular text-neutral-200">
                        {activeRule ? `${activeRule.drawnNumbersCount} números` : 'Aguardando verificação'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/6 pb-2">
                      <dt className="text-neutral-400">Modelo matemático</dt>
                      <dd className="font-mono-tabular text-[#C4B5FD]">
                        {activeRule?.mathModelType ??
                          selected.currentRulesSummary?.preparedModelType ??
                          'hypergeometric_single_group'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/6 pb-2">
                      <dt className="text-neutral-400">Aposta simples oficial</dt>
                      <dd className="font-mono-tabular text-[#E5C158]">
                        {activeRule
                          ? formatBrlFromCents(activeRule.simpleBetPriceCents)
                          : 'Não cadastrada'}
                      </dd>
                    </div>
                    <div className="flex justify-between border-b border-white/6 pb-2">
                      <dt className="text-neutral-400">Atualização do preço</dt>
                      <dd className="font-mono-tabular text-neutral-300">
                        {activeRule?.priceUpdatedAt
                          ? activeRule.priceUpdatedAt.slice(0, 10)
                          : '—'}
                      </dd>
                    </div>
                  </dl>

                  {activeRule && (
                    <div className="mt-4 space-y-2 text-xs text-neutral-400">
                      {Array.isArray(activeRule.prizeTiersConfig) &&
                        activeRule.prizeTiersConfig.length > 0 && (
                          <p>
                            <span className="text-neutral-300 font-medium">Faixas oficiais:</span>{' '}
                            {activeRule.prizeTiersConfig
                              .map((t) => `${t.tierName} (${t.hits})`)
                              .join(' · ')}
                          </p>
                        )}
                      <p className="break-words">
                        <span className="text-neutral-300 font-medium">Fonte oficial:</span>{' '}
                        {activeRule.officialSource}
                      </p>
                      {activeRule.priceSource && (
                        <p className="break-words">
                          <span className="text-neutral-300 font-medium">Fonte da tabela de preços:</span>{' '}
                          {activeRule.priceSource}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Eventos Especiais Vinculados */}
                <div className="border-t border-white/8 pt-5">
                  <h3 className="text-xs font-semibold text-neutral-200">
                    Concursos Especiais Vinculados (`special_events`)
                  </h3>
                  {selected.specialEvents.length === 0 ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      Nenhum concurso especial anual vinculado a esta modalidade base.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {selected.specialEvents.map((evt) => (
                        <li
                          key={evt.id}
                          className="border-b border-white/6 pb-3 last:border-b-0 last:pb-0"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[#E5C158]">{evt.name}</span>
                            <span className="font-mono-tabular text-neutral-400">
                              Ciclo {evt.year} ·{' '}
                              {evt.inheritsMainRules
                                ? 'Herda regras da modalidade principal'
                                : 'Regras específicas'}
                            </span>
                          </div>
                          {evt.applicableRules?.note && (
                            <p className="mt-1 text-xs text-neutral-400">
                              {evt.applicableRules.note}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">
                Selecione uma modalidade na lista ao lado para inspecionar sua estrutura.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
