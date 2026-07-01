import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LineChart, Briefcase, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  backTo?: string;
  showSignOut?: boolean;
}

export function StockResearchLayout({
  children,
  title = "Stock Research Portal",
  subtitle,
  backTo,
  showSignOut = false,
}: Props) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)]">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {backTo !== undefined && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back"
                onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <LineChart className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground truncate">
                {title}
              </div>
              {subtitle && (
                <div className="text-base font-semibold truncate">{subtitle}</div>
              )}
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/portfolio" className="gap-1">
                <Briefcase className="w-4 h-4" />
                <span className="hidden sm:inline">Portfolio</span>
              </Link>
            </Button>
            {showSignOut && (
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main className="container mx-auto max-w-3xl px-4 py-6">{children}</main>
      <footer className="container mx-auto max-w-3xl px-4 pb-8 pt-2 text-[11px] text-muted-foreground italic text-center">
        This is informational only and not investment advice.
      </footer>
    </div>
  );
}
