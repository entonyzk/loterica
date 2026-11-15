import React, { useEffect, useState } from 'react';

interface ContestRow {
  id: number;
  lotteryName: string;
  lotteryCode: string;
  contestNumber: number;
  drawDate: string | null;
  status: string;
}

export const HistoryView: React.FC = () => {
  const [contests, setContests] = useState<ContestRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/contests');
        if (!res.ok) throw new Error('Falha ao consultar concursos no PostgreSQL.');
        const data = await res.json();
        if (!active) return;
        setContests(data.items ?? []);
        setNotice(data.notice ?? null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="text-[#E5C158] font-medium">Etapa 1 — Estrutura Ativa</span>
          <span aria-hidden="true">·</span>
          <span>Ingestão Oficial Prevista na Etapa 2</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[#F1F2F4]">
          Histórico de Concursos e Análises
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Consulta direta às tabelas `contests`, `drawn_numbers`, `prize_tiers` e
          `analysis_history` no Cloud SQL PostgreSQL.
        </p>
      </div>

      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
          Concursos Registrados
        </h2>

        {error ? (
          <p className="mt-4 text-sm text-red-300">{error}</p>
        ) : loading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-white/5" />
        ) : contests.length === 0 ? (
          <div className="mt-4 border-t border-white/8 pt-4">
            <p className="text-sm text-neutral-200">
              Nenhum concurso oficial ingerido até o momento.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">
              {notice ??
                'Os concursos históricos e faixas de premiação aparecerão aqui somente após a validação e sincronização de fontes oficiais na Etapa 2.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/8 text-xs text-neutral-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Modalidade</th>
                  <th className="py-2 px-4 font-medium">Concurso</th>
                  <th className="py-2 px-4 font-medium">Data</th>
                  <th className="py-2 pl-4 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {contests.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 text-neutral-200">{c.lotteryName}</td>
                    <td className="py-2.5 px-4 font-mono-tabular text-[#E5C158]">
                      #{c.contestNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular text-neutral-400">
                      {c.drawDate ? new Date(c.drawDate).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="py-2.5 pl-4 text-right text-xs text-neutral-300">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
          Histórico de Análises, Simulações e Apostas do Usuário
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-neutral-400">
          As tabelas relacionais `analysis_history`, `simulations` e `user_bets` já estão criadas e
          indexadas por `user_id` no PostgreSQL. A gravação de novas execuções será ativada
          conforme os módulos analíticos forem liberados nas Etapas 3 a 6.
        </p>
      </section>
    </div>
  );
};
