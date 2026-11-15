import React from 'react';
import { LogIn, LogOut, RefreshCw, Shield } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export const AccountView: React.FC = () => {
  const { firebaseUser, profile, activity, loading, authError, signInWithGoogle, logout, refreshProfile } =
    useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#F1F2F4]">Minha Conta</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Autenticação segura via Firebase Authentication com sincronização relacional no Cloud
          SQL PostgreSQL (`users`).
        </p>
      </div>

      {authError && (
        <div className="rounded-xl border border-red-500/30 bg-[#12141A] p-4 text-sm text-red-300">
          {authError}
        </div>
      )}

      {loading ? (
        <div className="h-44 animate-pulse rounded-xl border border-white/8 bg-[#12141A]" />
      ) : !firebaseUser ? (
        <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 sm:p-8">
          <div className="max-w-xl space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#F1F2F4]">
              Acesso Autenticado LOTUS AI
            </h2>
            <p className="text-sm leading-relaxed text-neutral-300">
              Entre com sua conta Google para criar e sincronizar seu registro na tabela `users`,
              receber seu perfil de acesso (`user`, `analyst`, `admin`) e preparar sua área de
              histórico e simulações.
            </p>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] cursor-pointer"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Entrar com Google
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F1F2F4]">
                  {profile?.name ?? firebaseUser.displayName ?? 'Usuário Autenticado'}
                </h2>
                <p className="text-xs text-neutral-400">
                  {profile?.email ?? firebaseUser.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshProfile}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-xs font-medium text-neutral-200 hover:border-white/25 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Atualizar
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Sair
                </button>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
              <div className="border-b border-white/6 pb-2.5">
                <dt className="text-neutral-400">ID Relacional (PostgreSQL)</dt>
                <dd className="mt-1 font-mono-tabular text-sm text-[#E5C158]">
                  {profile?.id ?? '—'}
                </dd>
              </div>
              <div className="border-b border-white/6 pb-2.5">
                <dt className="text-neutral-400">Nível de Acesso (RBAC)</dt>
                <dd className="mt-1 flex items-center gap-1.5 font-mono-tabular text-sm text-[#F1F2F4]">
                  <Shield className="h-3.5 w-3.5 text-[#8B5CF6]" aria-hidden="true" />
                  {profile?.role ?? 'user'}
                </dd>
              </div>
              <div className="border-b border-white/6 pb-2.5">
                <dt className="text-neutral-400">Status da Conta</dt>
                <dd className="mt-1 font-mono-tabular text-sm text-neutral-200">
                  {profile?.status ?? 'active'}
                </dd>
              </div>
              <div className="border-b border-white/6 pb-2.5">
                <dt className="text-neutral-400">Firebase UID</dt>
                <dd className="mt-1 truncate font-mono-tabular text-xs text-neutral-300">
                  {profile?.uid ?? firebaseUser.uid}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-white/8 bg-[#12141A] p-6 lg:col-span-5 space-y-4">
            <h2 className="font-display text-sm font-semibold text-[#F1F2F4]">
              Contadores de Atividade (PostgreSQL)
            </h2>
            <div className="divide-y divide-white/8 text-sm">
              <div className="flex items-center justify-between py-3">
                <span className="text-neutral-400">Análises registradas</span>
                <span className="font-mono-tabular text-[#F1F2F4]">
                  {activity?.analysesCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-neutral-400">Simulações executadas</span>
                <span className="font-mono-tabular text-[#F1F2F4]">
                  {activity?.simulationsCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-neutral-400">Apostas registradas</span>
                <span className="font-mono-tabular text-[#F1F2F4]">
                  {activity?.betsCount ?? 0}
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
