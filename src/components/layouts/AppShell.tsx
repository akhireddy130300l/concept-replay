import { ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Brain,
  LayoutDashboard,
  Compass,
  Mic,
  Headphones,
  LineChart,
  Cpu,
  Briefcase,
  LogOut,
  MoreHorizontal,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const FEATURE_PORTFOLIO_AGENT =
  String(import.meta.env["VITE_FEATURE_PORTFOLIO_AGENT"] ?? "").toLowerCase() === "true";

interface NavItem {
  label: string;
  shortLabel: string;
  path: string;
  icon: typeof LayoutDashboard;
  primaryTab?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", shortLabel: "Home", path: "/dashboard", icon: LayoutDashboard, primaryTab: true },
  { label: "Start Today", shortLabel: "Start", path: "/start-today", icon: Compass, primaryTab: true },
  { label: "Speaking Gym", shortLabel: "Speak", path: "/speaking-gym", icon: Mic, primaryTab: true },
  { label: "American Shadow", shortLabel: "Shadow", path: "/american-shadow", icon: Headphones, primaryTab: true },
  { label: "Stock Insight", shortLabel: "Stocks", path: "/stock-insight", icon: LineChart },
  { label: "ML Training", shortLabel: "ML Lab", path: "/ml-training", icon: Cpu },
  ...(FEATURE_PORTFOLIO_AGENT
    ? [{ label: "Portfolio", shortLabel: "Portfolio", path: "/portfolio", icon: Briefcase }]
    : []),
];

interface AppShellProps {
  children: ReactNode;
  /** Optional extra class on the outer wrapper (e.g. shadow-theme on AmericanShadow) */
  themeClass?: string;
  /** Hide bottom/side shell padding if page manages its own max-width */
  fullWidth?: boolean;
}

export function AppShell({ children, themeClass, fullWidth = false }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryTabs = NAV_ITEMS.filter((item) => item.primaryTab);
  const secondaryTabs = NAV_ITEMS.filter((item) => !item.primaryTab);
  const isSecondaryActive = secondaryTabs.some((item) => location.pathname === item.path);

  const handleSignOut = async () => {
    setMoreOpen(false);
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className={cn("min-h-screen bg-[image:var(--gradient-hero)] text-foreground", themeClass)}>
      {/* Desktop Slim Frosted Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col border-r border-border/50 frosted-nav">
        <div className="flex h-16 items-center gap-3 px-5 border-b border-border/40">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-3 text-left focus:outline-none group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[var(--shadow-button)] transition-transform group-hover:scale-105">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight leading-none">LearnLoop</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Daily Mastery</div>
            </div>
          </button>
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  active
                    ? "bg-primary/12 text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.4)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/40">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Brand Bar */}
      <header className="lg:hidden sticky top-0 z-20 h-14 px-4 flex items-center justify-between border-b border-border/40 frosted-nav">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2.5 focus:outline-none"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[var(--shadow-button)]">
            <Brain className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-base font-semibold tracking-tight">LearnLoop</span>
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign Out"
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </header>

      {/* Main Content Area */}
      <div className="lg:pl-64 pb-24 lg:pb-12">
        <div className={cn(fullWidth ? "w-full" : "mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8")}>
          {children}
        </div>
      </div>

      {/* Mobile iOS-Style Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border/50 frosted-nav pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16 max-w-md mx-auto px-1">
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(item.path);
                }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-9 h-7 rounded-full transition-colors",
                    active && "bg-primary/15"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="truncate max-w-full px-0.5">{item.shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
              moreOpen || isSecondaryActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center w-9 h-7 rounded-full transition-colors",
                (moreOpen || isSecondaryActive) && "bg-primary/15"
              )}
            >
              <MoreHorizontal className="w-4 h-4" />
            </span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Sheet */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end">
          <div
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="relative z-10 w-full rounded-t-3xl border-t border-border/60 bg-card p-5 pb-8 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold">More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {secondaryTabs.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      navigate(item.path);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors",
                      active ? "bg-primary/12 text-primary" : "text-foreground hover:bg-muted/70"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <div className="h-px bg-border/60 my-2" />
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}