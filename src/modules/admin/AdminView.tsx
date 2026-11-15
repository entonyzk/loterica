import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface OpenApiPathInfo {
  path: string;
  method: string;
  summary: string;
  status: string;
}

interface DataSourceItem {
  id: number;
  name: string;
  sourceType: string;
  endpointUrl: string;
  validationStatus: string;
  lastCheckedAt: string | null;
}

const RBAC_MATRIX = [
  { role: 'user', scope: 'Consulta modalidades, concursos públicos e histórico próprio' },
  { role: 'analyst', scope: 'Executa análises estatísticas, simulações e backtests (Etapas 3–5)' },
  { role: 'admin', scope: 'Gerencia modalidades, versões de regras, fontes de dados e auditoria' },
  { role: 'super_admin', scope: 'Controle completo de permissões, configurações e manutenção crítica' },
];

export const AdminView: React.FC = () => {
  const { profile, idToken } = useAuth();
  const [openApiRoutes, setOpenApiRoutes] = useState<OpenApiPathInfo[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceItem[] | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  useEffect(() => {
    let active = true;
    async function loadOpenApi() {
      try {
        const res = await fetch('/api/docs/openapi.json');
        if (!res.ok) return;
        const spec = await res.json();
        if (!active || !spec.paths) return;

        const list: OpenApiPathInfo[] = [];
        for (const [pathKey, methodsObj] of Object.entries(spec.paths)) {
          for (const [methodKey, op] of Object.entries(
            methodsObj as Record<string, { summary?: string; 'x-lotus-status'?: string }>
          )) {
            list.push({
              path: pathKey,
              method: methodKey.toUpperCase(),
              summary: op.summary ?? '',
              status: op['x-lotus-status'] ?? 'planned',
            });
          }
        }
        setOpenApiRoutes(list);
      } catch (err) {
        console.error('Failed to load OpenAPI spec:', err);
      }
    }
    loadOpenApi();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadAdminDataSources() {
      if (!idToken || !isAdmin) {
        setDataSources(null);
        return;
      }
      try {
        const res = await fetch('/api/admin/data-sources', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Acesso restrito a administradores.');
        }
        const json = await res.json();
        if (!active) return;
        setDataSources(json.items ?? []);
        setAdminError(null);
      } catch (err) {
        if (!active) return;
        setAdminError(err instanceof Error ? err.message : 'Erro ao consultar fontes.');
      }
    }
    loadAdminDataSources();
    return () => {
      active = false;
    };
  }, [idToken, isAdmin]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="text-[#E5C158] font-medium">Estrutura Inicial</span>
          <span aria-hidden="true">·</span>
          <span>Governança RBAC, Fontes Oficiais e Contratos OpenAPI 3.1</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[#F1F2F4]">
          Painel Administrativo e Arquitetura
        </h1>
      </div>

      {/* Fontes de Dados Protegidas por RBAC */}
      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
              Fontes de Dados Oficiais (`GET /api/admin/data-sources`)
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">
              Endpoint protegido por Firebase Auth + RBAC (`admin` ou `super_admin`)
            </p>
          </div>
        </div>

        {!isAdmin ? (
          <div className="mt-4 flex items-start gap-3 border-t border-white/8 pt-4 text-xs text-neutral-300">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden="true" />
            <div>
              <p className="font-medium text-neutral-200">
                Acesso administrativo protegido por controle de permissões (RBAC).
              </p>
              <p className="mt-1 text-neutral-400">
                Seu nível atual é <span className="font-mono-tabular text-[#E5C158]">{profile?.role ?? 'visitante'}</span>.
                Somente contas com papel `admin` ou `super_admin` podem consultar e validar
                fontes oficiais e logs de auditoria via API.
              </p>
            </div>
          </div>
        ) : adminError ? (
          <p className="mt-4 text-xs text-red-300">{adminError}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/8 text-neutral-400">
                <tr>
                  <th className="py-2 pr-4 font-medium">Fonte</th>
                  <th className="py-2 px-4 font-medium">Tipo</th>
                  <th className="py-2 px-4 font-medium">Endpoint</th>
                  <th className="py-2 pl-4 text-right font-medium">Validação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {(dataSources ?? []).map((src) => (
                  <tr key={src.id}>
                    <td className="py-2.5 pr-4 text-neutral-200">{src.name}</td>
                    <td className="py-2.5 px-4 font-mono-tabular text-neutral-400">
                      {src.sourceType}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular text-neutral-400">
                      {src.endpointUrl}
                    </td>
                    <td className="py-2.5 pl-4 text-right font-mono-tabular text-[#E5C158]">
                      {src.validationStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Matriz RBAC */}
      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
          Modelo de Permissões (RBAC)
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/8 text-neutral-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Perfil</th>
                <th className="py-2 pl-4 font-medium">Escopo Autorizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {RBAC_MATRIX.map((row) => (
                <tr key={row.role}>
                  <td className="py-2.5 pr-4 font-mono-tabular text-[#E5C158]">{row.role}</td>
                  <td className="py-2.5 pl-4 text-neutral-300">{row.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contratos OpenAPI 3.1 */}
      <section className="rounded-xl border border-white/8 bg-[#12141A] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-[#F1F2F4]">
            Contratos REST (OpenAPI 3.1)
          </h2>
          <a
            href="/api/docs/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="font-mono-tabular text-xs text-[#E5C158] hover:underline"
          >
            /api/docs/openapi.json
          </a>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/8 text-neutral-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Método</th>
                <th className="py-2 px-4 font-medium">Rota</th>
                <th className="py-2 px-4 font-medium">Descrição</th>
                <th className="py-2 pl-4 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {openApiRoutes.map((route) => (
                <tr key={`${route.method}-${route.path}`}>
                  <td className="py-2.5 pr-4 font-mono-tabular text-[#8B5CF6]">{route.method}</td>
                  <td className="py-2.5 px-4 font-mono-tabular text-neutral-200">{route.path}</td>
                  <td className="py-2.5 px-4 text-neutral-400">{route.summary}</td>
                  <td
                    className={`py-2.5 pl-4 text-right font-mono-tabular whitespace-nowrap ${
                      route.status === 'implemented' ? 'text-[#E5C158]' : 'text-neutral-500'
                    }`}
                  >
                    {route.status === 'implemented' ? 'Implementado' : 'Planejado'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
