import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Mail, Calendar, Sparkles, CheckCircle2, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--gradient-hero)]">
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">LearnLoop</span>
          </div>
          <Button onClick={() => navigate("/auth")} variant="outline">
            Sign In
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-5xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-24">
            <div className="inline-flex items-center gap-2 bg-primary/10 backdrop-blur-sm text-primary px-5 py-2.5 rounded-full text-sm font-semibold mb-8 border border-primary/20">
              <Sparkles className="w-4 h-4" />
              Science-Backed Learning System
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-[1.1] tracking-tight">
              Master What You Learn.
              <br />
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                Remember Forever.
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
              Transform fleeting knowledge into lasting mastery with AI-powered spaced repetition. 
              <span className="text-foreground font-medium"> Never lose what you've learned again.</span>
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <Button
                onClick={() => navigate("/auth")}
                size="lg"
                className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all text-lg px-10 py-6 h-auto font-semibold shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)]"
              >
                Get Started Free
              </Button>
              <Button
                onClick={() => navigate("/auth")}
                size="lg"
                variant="outline"
                className="text-lg px-10 py-6 h-auto font-semibold border-2 hover:bg-muted/50"
              >
                Watch Demo
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground">
              No credit card required • Free forever plan
            </p>
          </div>

          {/* Stats Section */}
          <div className="grid md:grid-cols-3 gap-8 mb-24 max-w-4xl mx-auto">
            <div className="text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="text-4xl font-bold text-primary mb-2">80%</div>
              <p className="text-muted-foreground text-sm">Information retained with spaced repetition</p>
            </div>
            <div className="text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="text-4xl font-bold text-secondary mb-2">10x</div>
              <p className="text-muted-foreground text-sm">More effective than cramming</p>
            </div>
            <div className="text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50">
              <div className="text-4xl font-bold text-accent mb-2">5 min</div>
              <p className="text-muted-foreground text-sm">Daily review time needed</p>
            </div>
          </div>

          {/* Features Section */}
          <div className="grid md:grid-cols-3 gap-8 mb-24">
            <Card className="border-2 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-5 border border-primary/20">
                  <Brain className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-center">Effortless Logging</h3>
                <p className="text-muted-foreground text-center leading-relaxed">
                  Capture any topic in seconds. Add context with optional notes to enhance your future reviews.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary/20 to-secondary/5 flex items-center justify-center mx-auto mb-5 border border-secondary/20">
                  <TrendingUp className="w-7 h-7 text-secondary" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-center">Smart Algorithms</h3>
                <p className="text-muted-foreground text-center leading-relaxed">
                  Psychology-based intervals optimize retention. Review exactly when your brain needs reinforcement.
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 bg-card/80 backdrop-blur-sm">
              <CardContent className="pt-8 pb-6 px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center mx-auto mb-5 border border-accent/20">
                  <Mail className="w-7 h-7 text-accent" />
                </div>
                <h3 className="font-bold text-xl mb-3 text-center">AI-Enhanced Recall</h3>
                <p className="text-muted-foreground text-center leading-relaxed">
                  Receive rich, contextualized summaries. AI expands your notes into comprehensive review material.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* How It Works Section */}
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">The Science of Remembering</h2>
              <p className="text-lg text-muted-foreground">
                Backed by decades of cognitive research on human memory
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-card to-muted/30 rounded-3xl border-2 border-border shadow-[var(--shadow-card)] p-8 md:p-10">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Day 1: Capture & Learn</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Log what you've learned today. Our system immediately schedules your optimal review timeline.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-secondary/10 border-2 border-secondary flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Day 1 → 30: Strategic Intervals</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Receive AI-powered reminders at psychologically optimal moments—right before you'd forget.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-2">Long-Term Mastery</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      Each review strengthens neural pathways, transforming short-term memory into permanent knowledge.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-border/50">
                <p className="text-sm text-muted-foreground italic text-center">
                  <span className="font-semibold text-foreground">Research shows:</span> Without reinforcement, we forget 80% of new information within 30 days. 
                  Spaced repetition can increase retention rates to over 90%.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-4 py-12 text-center border-t">
        <p className="text-muted-foreground text-sm">
          © 2024 LearnLoop. Built for learners who want to remember what matters.
        </p>
      </footer>
    </div>
  );
};

export default Index;
