import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-[#181B22] px-3.5 py-2 text-xs font-medium text-[#E5C158] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Instalar Aplicativo
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-[#181B22] px-3.5 py-2 text-xs font-medium text-[#E5E7EB] transition-colors hover:border-white/25 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="h-3.5 w-3.5 text-[#D4AF37]" aria-hidden="true" />
          Instalar no iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl border border-white/12 bg-[#12141A] p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-base font-semibold text-[#F1F2F4]">
                  Instalar LOTUS AI no iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fechar instruções"
                  className="rounded-md p-1 text-neutral-400 hover:bg-white/5 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm text-neutral-300 leading-relaxed">
                <li>1. Toque no ícone Compartilhar na barra do Safari.</li>
                <li>2. Role para baixo e selecione Adicionar à Tela de Início.</li>
                <li>3. Confirme tocando em Adicionar no canto superior direito.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-lg bg-[#D4AF37] py-2.5 text-xs font-semibold text-[#0A0B0E] transition-colors hover:bg-[#E5C158] cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
