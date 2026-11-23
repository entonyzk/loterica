import React from 'react';
import { formatBrlFromCents, type StrategyEvaluatedItem } from './types';

export const StrategyComparisonChart: React.FC<{
  strategies: StrategyEvaluatedItem[];
}> = ({ strategies }) => {
  if (strategies.length === 0) return null;

  const maxCost = Math.max(
    ...strategies.map((s) => (s.total_cost_cents ? Number(s.total_cost_cents) : 0)),
    1
  );
  const maxCov = Math.max(...strategies.map((s) => s.coverage.coverage_percentage), 1);

  const width = 640;
  const height = 220;
  const padLeft = 44;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 48;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const slotW = chartW / strategies.length;
  const barW = Math.min(26, Math.max(12, slotW * 0.28));

  return (
    <div className="rounded-xl border border-white/8 bg-[#0D0F14] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-xs font-semibold text-[#F1F2F4]">
          Cobertura de Subconjuntos vs. Custo por Estratégia
        </h4>
        <div className="flex items-center gap-4 text-[11px] text-neutral-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#D4AF37]" aria-hidden="true" />
            <span>Cobertura t-subconjuntos (%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#8B5CF6]" aria-hidden="true" />
            <span>Custo relativo (R$)</span>
          </span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[440px] overflow-visible"
          role="img"
          aria-label="Gráfico comparativo de cobertura e custo entre estratégias"
        >
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padTop + chartH * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
            );
          })}

          <line
            x1={padLeft}
            y1={padTop + chartH}
            x2={width - padRight}
            y2={padTop + chartH}
            stroke="rgba(255,255,255,0.14)"
          />

          {strategies.map((strat, idx) => {
            const centerX = padLeft + slotW * idx + slotW / 2;
            const covNorm = strat.coverage.coverage_percentage / maxCov;
            const covH = Math.max(3, covNorm * chartH);
            const covY = padTop + chartH - covH;

            const costVal = strat.total_cost_cents ? Number(strat.total_cost_cents) : 0;
            const costNorm = costVal / maxCost;
            const costH = Math.max(3, costNorm * chartH);
            const costY = padTop + chartH - costH;

            const shortName =
              strat.name.length > 14 ? `${strat.name.slice(0, 13)}…` : strat.name;

            return (
              <g key={`${strat.index}-${strat.name}`}>
                <rect
                  x={centerX - barW - 3}
                  y={covY}
                  width={barW}
                  height={covH}
                  rx={3}
                  fill="#D4AF37"
                  fillOpacity={0.9}
                />
                <text
                  x={centerX - barW / 2 - 3}
                  y={covY - 5}
                  textAnchor="middle"
                  className="fill-[#E5C158] text-[9px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {strat.coverage.coverage_percentage.toFixed(1)}%
                </text>

                <rect
                  x={centerX + 3}
                  y={costY}
                  width={barW}
                  height={costH}
                  rx={3}
                  fill="#8B5CF6"
                  fillOpacity={0.85}
                />
                <text
                  x={centerX + barW / 2 + 3}
                  y={costY - 5}
                  textAnchor="middle"
                  className="fill-neutral-300 text-[9px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {strat.total_cost_cents ? formatBrlFromCents(strat.total_cost_cents) : 'N/D'}
                </text>

                <text
                  x={centerX}
                  y={padTop + chartH + 16}
                  textAnchor="middle"
                  className="fill-neutral-300 text-[10px]"
                >
                  {shortName}
                </text>
                <text
                  x={centerX}
                  y={padTop + chartH + 30}
                  textAnchor="middle"
                  className="fill-neutral-500 text-[9px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {strat.bets_count}×{strat.chosen_count}d
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const OverlapHistogramChart: React.FC<{
  histogram: Record<string, number>;
  title?: string;
}> = ({ histogram, title = 'Distribuição de Sobreposição entre Pares de Apostas' }) => {
  const entries = Object.entries(histogram).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-[#0D0F14] p-4 text-xs text-neutral-400">
        {title}: informe ou gere ao menos 2 apostas distintas para medir interseções par-a-par.
      </div>
    );
  }

  const maxCount = Math.max(...entries.map(([, c]) => c), 1);
  const width = 460;
  const height = 160;
  const padL = 24;
  const padR = 16;
  const padT = 22;
  const padB = 34;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const slotW = chartW / entries.length;
  const barW = Math.min(34, Math.max(12, slotW * 0.56));

  return (
    <div className="rounded-xl border border-white/8 bg-[#0D0F14] p-4">
      <h4 className="font-display text-xs font-semibold text-[#F1F2F4]">{title}</h4>
      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[300px] overflow-visible"
          role="img"
          aria-label={title}
        >
          <line
            x1={padL}
            y1={padT + chartH}
            x2={width - padR}
            y2={padT + chartH}
            stroke="rgba(255,255,255,0.12)"
          />
          {entries.map(([overlap, count], idx) => {
            const cx = padL + idx * slotW + slotW / 2;
            const h = Math.max(3, (count / maxCount) * chartH);
            const y = padT + chartH - h;
            return (
              <g key={overlap}>
                <rect
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={h}
                  rx={3}
                  fill="#8B5CF6"
                  fillOpacity={0.85}
                />
                <text
                  x={cx}
                  y={y - 5}
                  textAnchor="middle"
                  className="fill-neutral-200 text-[9px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {count}
                </text>
                <text
                  x={cx}
                  y={padT + chartH + 16}
                  textAnchor="middle"
                  className="fill-neutral-400 text-[10px]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {overlap} dez.
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export const NumberFrequencyChart: React.FC<{
  frequency: Array<{ number: number; count: number; pct_of_bets: number }>;
}> = ({ frequency }) => {
  if (frequency.length === 0) return null;
  const maxCount = Math.max(...frequency.map((f) => f.count), 1);

  return (
    <div className="rounded-xl border border-white/8 bg-[#0D0F14] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-xs font-semibold text-[#F1F2F4]">
          Distribuição das Dezenas Selecionadas no Conjunto (1..{frequency.length})
        </h4>
        <span className="font-mono-tabular text-[11px] text-neutral-400">
          Ocorrências por dezena nas apostas do conjunto
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${Math.max(480, frequency.length * 10)} 110`}
          className="h-28 w-full min-w-[440px]"
          role="img"
          aria-label="Distribuição de frequência das dezenas selecionadas no conjunto"
        >
          {frequency.map((item, idx) => {
            const totalW = Math.max(480, frequency.length * 10);
            const step = totalW / frequency.length;
            const barW = Math.max(3, step - 2);
            const h = item.count === 0 ? 2 : Math.max(4, (item.count / maxCount) * 70);
            const y = 84 - h;
            const x = idx * step + 1;
            const showLabel =
              frequency.length <= 25 || item.number === 1 || item.number % 5 === 0;
            return (
              <g key={item.number}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={1.5}
                  fill={item.count > 0 ? '#D4AF37' : 'rgba(255,255,255,0.1)'}
                  fillOpacity={item.count > 0 ? 0.85 : 1}
                >
                  <title>
                    Dezena {String(item.number).padStart(2, '0')}: {item.count}x (
                    {item.pct_of_bets}%)
                  </title>
                </rect>
                {showLabel && (
                  <text
                    x={x + barW / 2}
                    y={100}
                    textAnchor="middle"
                    className="fill-neutral-500 text-[8px]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {item.number}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
