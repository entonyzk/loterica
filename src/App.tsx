import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Cpu,
  Grid,
  History,
  Home,
  Layers,
  Menu,
  Shield,
  Sigma,
  Sliders,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AuthProvider, useAuth } from './modules/auth/AuthContext';
import { AdminView } from './modules/admin/AdminView';
import { CombinationsLabView } from './modules/combinations/CombinationsLabView';
import { HistoryView } from './modules/contests/HistoryView';
import { LotteriesView } from './modules/lotteries/LotteriesView';
import { MathLabView } from './modules/probabilities/MathLabView';
import { LotusLogo } from './modules/ui/LotusLogo';
import { OfflineIndicator } from './modules/ui/OfflineIndicator';
import { OverviewDashboard, type NavSectionId } from './modules/ui/OverviewDashboard';
import { PLANNED_MODULES, PlannedModuleView } from './modules/ui/PlannedModuleView';
import { PWAInstallButton } from './modules/ui/PWAInstallButton';
import { AccountView } from './modules/users/AccountView';

interface MenuItem {
  id: NavSectionId;
  label: string;
  icon: React.FC<{ className?: string }>;
  planned?: boolean;
}

const MAIN_MENU: MenuItem[] = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'loterias', label: 'Loterias', icon: Layers },
  { id: 'estatisticas', label: 'Estatísticas', icon: BarChart3, planned: true },
  { id: 'laboratorio', label: 'Laboratório matemático', icon: Cpu },
  { id: 'combinacoes', label: 'Laboratório de Combinações', icon: Sigma },
  { id: 'simulador', label: 'Simulador', icon: Activity, planned: true },
  { id: 'gerador', label: 'Gerador de jogos', icon: Sparkles, planned: true },
  { id: 'fechamentos', label: 'Fechamentos', icon: Grid, planned: true },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'conta', label: 'Minha conta', icon: User },
];

const MOBILE_PRIMARY_TABS: Array<{ id: NavSectionId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'loterias', label: 'Loterias', icon: Layers },
  { id: 'laboratorio', label: 'Lab', icon: Cpu },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'conta', label: 'Conta', icon: User },
];

const LotusShell: React.FC = () => {
  const [activeSection, setActiveSection] = useState<NavSectionId>('inicio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { firebaseUser, profile, signInWithGoogle } = useAuth();

  const currentTitle =
    activeSection === 'admin'
      ? 'Painel Administrativo'
      : MAIN_MENU.find((m) => m.id === activeSection)?.label ?? 'Início';

  const navigateTo = (id: NavSectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#F1F2F4] flex">
      {/* Sidebar Desktop (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/8 lg:bg-[#0D0F14]">
        <div className="flex h-16 items-center gap-3 border-b border-white/8 px-6">
          <LotusLogo size={26} />
          <span className="font-display text-base font-bold tracking-tight text-[#F1F2F4] whitespace-nowrap">
            LOTUS AI
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Menu principal">
          <ul className="space-y-1">
            {MAIN_MENU.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-[#181B22] font-medium text-[#E5C158]'
                        : 'text-neutral-300 hover:bg-white/[0.03] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? 'text-[#E5C158]' : 'text-neutral-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.planned && (
                      <span className="text-[11px] text-neutral-500 shrink-0">Planejado</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 border-t border-white/8 pt-4">
            <button
              type="button"
              onClick={() => navigateTo('admin')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors cursor-pointer whitespace-nowrap ${
                activeSection === 'admin'
                  ? 'bg-[#181B22] font-medium text-[#E5C158]'
                  : 'text-neutral-400 hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              <Shield
                className={`h-4 w-4 shrink-0 ${
                  activeSection === 'admin' ? 'text-[#E5C158]' : 'text-neutral-500'
                }`}
              />
              <span>Administração</span>
            </button>
          </div>
        </nav>

        <div className="border-t border-white/8 px-6 py-4 text-xs text-neutral-500">
          <p>Arquitetura Multiplataforma</p>
          <p className="mt-0.5 text-neutral-400">Web · PWA · Android Capacitor</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        {/* Top Bar Contract: Title/Breadcrumb — Actions */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-white/8 bg-[#0A0B0E]/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
              className="rounded-lg p-2 text-neutral-300 hover:bg-white/5 lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <LotusLogo size={22} />
            </div>
            <span className="font-display text-sm font-semibold text-[#F1F2F4] truncate whitespace-nowrap">
              {currentTitle}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            {firebaseUser ? (
              <button
                type="button"
                onClick={() => navigateTo('conta')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-[#12141A] px-3.5 py-2 text-xs font-medium text-neutral-200 hover:border-[#D4AF37]/50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sliders className="h-3.5 w-3.5 text-[#D4AF37]" aria-hidden="true" />
                <span className="max-w-[140px] truncate">
                  {profile?.name ?? firebaseUser.email}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Entrar
              </button>
            )}
          </div>
        </header>

        {/* Mobile Drawer Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 z-50 bg-black/75 lg:hidden"
            >
              <motion.div
                initial={{ x: -260 }}
                animate={{ x: 0 }}
                exit={{ x: -260 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full w-72 flex-col border-r border-white/10 bg-[#0D0F14]"
              >
                <div className="flex h-16 items-center justify-between border-b border-white/8 px-5">
                  <div className="flex items-center gap-2.5">
                    <LotusLogo size={24} />
                    <span className="font-display text-base font-bold text-[#F1F2F4]">
                      LOTUS AI
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Fechar menu"
                    className="rounded-lg p-2 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <nav className="flex-1 overflow-y-auto p-3">
                  <ul className="space-y-1">
                    {MAIN_MENU.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => navigateTo(item.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm cursor-pointer ${
                              isActive
                                ? 'bg-[#181B22] font-medium text-[#E5C158]'
                                : 'text-neutral-300'
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <Icon className="h-4 w-4 shrink-0" />
                              <span>{item.label}</span>
                            </span>
                            {item.planned && (
                              <span className="text-[11px] text-neutral-500">Planejado</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                    <li className="pt-3 mt-3 border-t border-white/8">
                      <button
                        type="button"
                        onClick={() => navigateTo('admin')}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm cursor-pointer ${
                          activeSection === 'admin'
                            ? 'bg-[#181B22] font-medium text-[#E5C158]'
                            : 'text-neutral-400'
                        }`}
                      >
                        <Shield className="h-4 w-4 shrink-0" />
                        <span>Administração</span>
                      </button>
                    </li>
                  </ul>
                </nav>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Viewport Principal */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeSection === 'inicio' && <OverviewDashboard onNavigate={navigateTo} />}
            {activeSection === 'loterias' && <LotteriesView />}
            {activeSection === 'laboratorio' && <MathLabView />}
            {activeSection === 'combinacoes' && <CombinationsLabView />}
            {activeSection === 'historico' && <HistoryView />}
            {activeSection === 'conta' && <AccountView />}
            {activeSection === 'admin' && <AdminView />}
            {activeSection === 'estatisticas' && (
              <PlannedModuleView spec={PLANNED_MODULES.estatisticas} />
            )}
            {activeSection === 'simulador' && (
              <PlannedModuleView spec={PLANNED_MODULES.simulador} />
            )}
            {activeSection === 'gerador' && (
              <PlannedModuleView spec={PLANNED_MODULES.gerador} />
            )}
            {activeSection === 'fechamentos' && (
              <PlannedModuleView spec={PLANNED_MODULES.fechamentos} />
            )}
          </motion.div>
        </main>
      </div>

      {/* Navegação Inferior Mobile (Capacitor / Android WebView <= 15% viewport) */}
      <nav
        aria-label="Navegação rápida móvel"
        className="fixed inset-x-0 bottom-0 z-30 flex min-h-14 items-center justify-around border-t border-white/8 bg-[#0D0F14]/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
      >
        {MOBILE_PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigateTo(tab.id)}
              className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 py-1 text-[11px] cursor-pointer ${
                isActive ? 'text-[#E5C158] font-medium' : 'text-neutral-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <LotusShell />
    </AuthProvider>
  );
}
