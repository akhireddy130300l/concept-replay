import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Briefcase } from "lucide-react";
import { AppShell } from "@/components/layouts/AppShell";
import { PageHeader } from "@/components/layouts/PageHeader";

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
}: Props) {
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <PageHeader
          eyebrow={title}
          title={subtitle || title}
          actions={
            <div className="flex items-center gap-2">
              {backTo !== undefined && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Back"
                  onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to="/portfolio" className="gap-1.5">
                  <Briefcase className="w-4 h-4" />
                  <span>Portfolio</span>
                </Link>
              </Button>
            </div>
          }
        />
        <main>{children}</main>
        <footer className="pt-6 pb-2 text-[11px] text-muted-foreground italic text-center">
          This is informational only and not investment advice.
        </footer>
      </div>
    </AppShell>
  );
}
