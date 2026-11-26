import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Brain, CheckCircle2, Mail, Sparkles, TrendingUp } from "lucide-react";

const STATS = [
  { value: "80%+", label: "Information retained with spaced repetition" },
  { value: "10×", label: "More effective than passive cramming" },
  { value: "5 min", label: "Focused daily review time needed" },
];

const FEATURES = [
  {
    icon: Brain,
    title: "Effortless Capture",
    description: "Log any concept in seconds with optional context notes so every future review feels clear and personal.",
    iconWrap: "bg-primary/10 border-primary/20 text-primary",
  },
  {
    icon: TrendingUp,
    title: "Adaptive Intervals",
    description: "Science-backed 1 · 3 · 7 · 14 · 30 · 60-day spacing brings each topic back right before memory fades.",
    iconWrap: "bg-secondary/15 border-secondary/25 text-secondary",
  },
  {
    icon: Mail,
    title: "AI-Crafted Recall",
    description: "Receive crisp, contextualized email summaries that expand brief notes into memorable daily refreshers.",
    iconWrap: "bg-accent/10 border-accent/20 text-accent",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Capture & Anchor",
    description: "Record what you learned today. LearnLoop builds your optimal review timeline automatically.",
  },
  {
    num: "02",
    title: "Reinforce at the Peak",
    description: "Receive tailored AI refreshers at the exact moment your brain is ready to strengthen the memory.",
  },
  {
    num: "03",
    title: "Lock In Mastery",
    description: "Every completed review deepens retention, turning fleeting insights into permanent knowledge.",
  },
];

const INTERVALS = [
  { day: "Day 1", height: "h-10", active: true },
  { day: "Day 3", height: "h-14", active: true },
  { day: "Day 7", height: "h-16", active: true },
  { day: "Day 14", height: "h-20", active: true },
  { day: "Day 30", height: "h-24", active: false },
  { day: "Day 60", height: "h-28", active: false },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[image:var(--gradient-hero)] text-foreground">
      {/* Ambient radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.16) 0%, hsl(var(--accent) / 0.08) 45%, transparent 100%)",
        }}
      />

      <header className="glass-card sticky top-0 z-20 border-b border-border/40">
        <div className="container mx-auto flex items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-[var(--shadow-button)]">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">LearnLoop</span>
          </div>
          <Button onClick={() => navigate("/auth")} variant="outline" className="glass-card rounded-full border-border/60 px-5 hover:bg-muted/60">
            Sign In
          </Button>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 pb-24 pt-16 sm:px-6 md:pt-24">
        <div className="mx-auto max-w-5xl">
          {/* Hero */}
          <section className="mx-auto mb-20 max-w-3xl text-center animate-fade-in">
            <div className="glass-card mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Science-Backed Learning
            </div>

            <h1 className="mb-6 text-4xl font-semibold leading-[1.06] tracking-tight sm:text-6xl md:text-7xl">
              Master What You Learn.
              <br />
              <span className="text-gradient">Remember Forever.</span>
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Turn fleeting study sessions into permanent mastery with AI-guided spaced repetition.{" "}
              <span className="font-medium text-foreground">Review at the exact moment it matters.</span>
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                onClick={() => navigate("/auth")}
                size="lg"
                className="glossy-button h-auto w-full rounded-full bg-gradient-to-r from-primary to-secondary px-9 py-4 text-base font-semibold text-primary-foreground transition-all hover:opacity-95 sm:w-auto"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-full px-6 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                See how it works
              </a>
            </div>
          </section>

          {/* Glass Product Showcase */}
          <section className="glass-card mb-20 rounded-3xl p-6 sm:p-8 md:p-10 animate-fade-in">
            <div className="grid items-center gap-8 md:grid-cols-12">
              <div className="md:col-span-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Retention Curve</p>
                <h2 className="mb-3 text-2xl font-semibold tracking-tight">Built around how memory actually works</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Each scheduled touchpoint interrupts the forgetting curve, lifting recall from 20% to over 90% with just minutes a day.
                </p>
              </div>
              <div className="md:col-span-7">
                <div className="rounded-2xl border border-border/50 bg-background/60 p-5">
                  <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Spaced Review Cadence</span>
                    <span className="font-medium text-primary">90%+ target recall</span>
                  </div>
                  <div className="grid grid-cols-6 items-end gap-2.5 pt-2">
                    {INTERVALS.map((item) => (
                      <div key={item.day} className="flex flex-col items-center gap-2">
                        <div
                          className={`w-full rounded-xl transition-all ${item.height} ${
                            item.active
                              ? "bg-gradient-to-t from-primary to-secondary shadow-[var(--shadow-soft)]"
                              : "border border-border/60 bg-muted/70"
                          }`}
                        />
                        <span className="text-[11px] font-medium text-muted-foreground">{item.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Metrics Band */}
          <section className="glass-card mb-20 grid divide-y divide-border/50 rounded-3xl sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {STATS.map((stat) => (
              <div key={stat.value} className="px-6 py-7 text-center">
                <div className="text-gradient mb-1.5 text-4xl font-semibold tracking-tight">{stat.value}</div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </section>

          {/* Features */}
          <section className="mb-24">
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-semibold tracking-tight md:text-4xl">Designed for effortless recall</h2>
              <p className="text-muted-foreground">Everything you need to capture, reinforce, and keep what matters.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="glass-card float-hover rounded-3xl p-7">
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border ${feature.iconWrap}`}>
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2.5 text-lg font-semibold tracking-tight">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How It Works */}
          <section id="how-it-works" className="mx-auto mb-24 max-w-3xl scroll-mt-24">
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-semibold tracking-tight md:text-4xl">The Science of Remembering</h2>
              <p className="text-muted-foreground">Backed by decades of cognitive research on human memory.</p>
            </div>

            <div className="glass-card rounded-3xl p-7 sm:p-10">
              <div className="space-y-7">
                {STEPS.map((step) => (
                  <div key={step.num} className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-xs font-semibold text-primary">
                      {step.num}
                    </div>
                    <div>
                      <h3 className="mb-1 text-base font-semibold tracking-tight">{step.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-start gap-3 border-t border-border/50 pt-6 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p>
                  <span className="font-medium text-foreground">Research shows:</span> Without reinforcement, we forget 80% of new
                  information within 30 days. Spaced repetition raises retention above 90%.
                </p>
              </div>
            </div>
          </section>

          {/* Closing CTA */}
          <section className="glass-card rounded-3xl px-6 py-12 text-center sm:px-10">
            <h2 className="mb-3 text-2xl font-semibold tracking-tight sm:text-3xl">Start building lasting memory today</h2>
            <p className="mx-auto mb-7 max-w-xl text-sm text-muted-foreground sm:text-base">
              Sign in to log your first concept and let LearnLoop handle every review from here.
            </p>
            <Button
              onClick={() => navigate("/auth")}
              size="lg"
              className="glossy-button h-auto rounded-full bg-gradient-to-r from-primary to-secondary px-9 py-4 text-base font-semibold text-primary-foreground hover:opacity-95"
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/40 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2026 LearnLoop. Built for learners who want to remember what matters.
        </div>
      </footer>
    </div>
  );
};

export default Index;
