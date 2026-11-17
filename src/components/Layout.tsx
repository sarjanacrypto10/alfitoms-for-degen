import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Bookmark,
  Flame,
  LayoutDashboard,
  Menu,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import type { CollectorStatusState, NavSection } from '../types/domain';
import { CollectorStatusLabelText } from './TokenStatusElements';

interface NavItem {
  id: NavSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { id: 'radar', label: 'Live Token Radar', shortLabel: 'Radar', icon: Radar },
  { id: 'pumpfun', label: 'Pump.fun Scanner', shortLabel: 'Pump.fun', icon: Flame },
  { id: 'trending', label: 'Trending Tokens', shortLabel: 'Trending', icon: TrendingUp },
  { id: 'analytics', label: 'Market Analytics', shortLabel: 'Analytics', icon: BarChart3 },
  { id: 'wallets', label: 'Wallet Intelligence', shortLabel: 'Wallets', icon: Wallet },
  { id: 'risk', label: 'Risk Scanner', shortLabel: 'Risk', icon: ShieldAlert },
  { id: 'watchlist', label: 'Watchlist', shortLabel: 'Watchlist', icon: Bookmark },
  { id: 'alerts', label: 'Alerts', shortLabel: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

interface LayoutProps {
  activeSection: NavSection;
  selectedTokenMint: string | null;
  onNavigate: (section: NavSection) => void;
  onInspectMint: (mint: string) => void;
  collectorStatus: CollectorStatusState | null;
  unreadAlertsCount: number;
  demoMode: boolean;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeSection,
  selectedTokenMint,
  onNavigate,
  onInspectMint,
  collectorStatus,
  unreadAlertsCount,
  demoMode,
  children,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNav = NAV_ITEMS.find((i) => i.id === activeSection);
  const ppStatus = collectorStatus?.pumpportal.status ?? 'CONNECTING';
  const effectiveStatus = demoMode && ppStatus !== 'LIVE' ? 'DEMO' : ppStatus;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = quickInput.trim();
    if (!cleaned) return;
    onInspectMint(cleaned);
    setQuickInput('');
  };

  return (
    <div className="min-h-screen bg-[#060709] text-[#E4E7EC] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0D0F13] border-r border-[#E4E7EC]/8 z-30">
        <div className="px-5 py-5 border-b border-[#E4E7EC]/8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#13161C] border border-[#D4AF37]/35 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-[#E4E7EC] truncate">
                ALFITOMS FOR DEGEN
              </div>
              <div className="text-[11px] text-[#9AA3B2] truncate">
                Solana Mainnet Terminal
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id && !selectedTokenMint;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#13161C] text-[#E5C76B] border border-[#D4AF37]/25'
                    : 'text-[#9AA3B2] hover:text-[#E4E7EC] hover:bg-[#13161C]/60 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#D4AF37]' : 'text-[#646D7D]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'alerts' && unreadAlertsCount > 0 && (
                  <span className="font-mono-num text-[11px] text-[#E5C76B]">
                    {unreadAlertsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[#E4E7EC]/8 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#646D7D]">PumpPortal</span>
            <CollectorStatusLabelText status={effectiveStatus} />
          </div>
          <div className="text-[11px] text-[#646D7D]">
            Founder: <span className="text-[#9AA3B2]">ALFITO MUZZAMIL</span>
          </div>
          <div className="text-[11px] text-[#646D7D]">
            Discover Early · Analyze Deeper · Trade Smarter
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[248px] flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-20 terminal-glass border-b border-[#E4E7EC]/8 px-4 sm:px-6 py-3">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden p-2 rounded border border-[#E4E7EC]/10 text-[#9AA3B2] hover:text-[#E4E7EC] cursor-pointer"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-[#646D7D]">
                  <span className="hidden sm:inline">Solana Mainnet</span>
                  <span className="hidden sm:inline" aria-hidden="true">
                    /
                  </span>
                  <span className="text-[#E4E7EC] font-medium truncate">
                    {selectedTokenMint
                      ? `Token Dossier · ${selectedTokenMint.slice(0, 6)}...`
                      : activeNav?.label ?? 'Overview'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Mint Inspect Bar */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:flex items-center flex-1 max-w-md bg-[#13161C] border border-[#E4E7EC]/10 focus-within:border-[#D4AF37]/50 rounded px-3 py-1.5"
            >
              <Search className="w-3.5 h-3.5 text-[#646D7D] shrink-0 mr-2" />
              <input
                type="text"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder="Inspect Solana mint address..."
                className="w-full bg-transparent text-xs text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none font-mono-num"
              />
              {quickInput && (
                <button
                  type="submit"
                  className="ml-2 text-xs font-medium text-[#D4AF37] hover:text-[#E5C76B] whitespace-nowrap cursor-pointer"
                >
                  Inspect
                </button>
              )}
            </form>

            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:block">
                <CollectorStatusLabelText status={effectiveStatus} label="Feed" />
              </div>
              <button
                type="button"
                onClick={() => onNavigate('alerts')}
                className="relative px-3 py-1.5 text-xs font-medium bg-[#13161C] border border-[#E4E7EC]/10 hover:border-[#D4AF37]/35 rounded text-[#E4E7EC] whitespace-nowrap cursor-pointer flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Alerts</span>
                {unreadAlertsCount > 0 && (
                  <span className="font-mono-num text-[#E5C76B]">({unreadAlertsCount})</span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (compact <= 15% viewport height) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 terminal-glass border-t border-[#E4E7EC]/10 px-2 py-1.5 grid grid-cols-5 gap-1">
        {[
          NAV_ITEMS[0], // Overview
          NAV_ITEMS[1], // Radar
          NAV_ITEMS[2], // Pump.fun
          NAV_ITEMS[6], // Risk
          NAV_ITEMS[7], // Watchlist
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id && !selectedTokenMint;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center py-1 rounded text-[11px] cursor-pointer ${
                isActive ? 'text-[#E5C76B]' : 'text-[#9AA3B2]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-full">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Full Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/75 flex">
          <div className="w-72 bg-[#0D0F13] border-r border-[#E4E7EC]/10 h-full flex flex-col p-4">
            <div className="flex items-center justify-between pb-4 border-b border-[#E4E7EC]/8">
              <div>
                <div className="text-sm font-bold text-[#E4E7EC]">ALFITOMS FOR DEGEN</div>
                <div className="text-[11px] text-[#9AA3B2]">ALFITO MUZZAMIL</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-[#9AA3B2] hover:text-[#E4E7EC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm ${
                      isActive
                        ? 'bg-[#13161C] text-[#E5C76B]'
                        : 'text-[#9AA3B2] hover:text-[#E4E7EC]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </div>
  );
};
