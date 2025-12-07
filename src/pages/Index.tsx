import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Mail, Calendar, Sparkles, CheckCircle2, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)]">
      <header className="glass-card sticky top-0 z-10 border-b border-border/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[var(--shadow-button)] animate-glow-pulse">
                <Brain className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight">LearnLoop</span>
            </div>
            <Button onClick={() => navigate("/auth")} variant="outline" className="glass-card border-border/50 hover:bg-muted/50">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-5xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-24 animate-fade-in">
            <div className="inline-flex items-center gap-2 glass-card text-primary px-5 py-2.5 rounded-full text-sm font-semibold mb-8 border border-primary/20">
              <Sparkles className="w-4 h-4" />
              Science-Backed Learning System
            </div>
            
            <h1 className="text-5xl md:text-7xl font-semibold mb-8 leading-[1.1] tracking-tight">
              Master What You Learn.
              <br />
              <span className="text-gradient">
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
                className="glossy-button bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all text-lg px-10 py-6 h-auto font-semibold text-primary-foreground"
              >
                Get Started
              </Button>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid md:grid-cols-3 gap-6 mb-24 max-w-4xl mx-auto">
            {[
              { value: "80%", label: "Information retained with spaced repetition", color: "primary" },
              { value: "10x", label: "More effective than cramming", color: "secondary" },
              { value: "5 min", label: "Daily review time needed", color: "accent" },
            ].map((stat, index) => (
              <div 
                key={stat.value} 
                className="glass-card float-hover text-center p-6 rounded-2xl animate-fade-in"
                style={{ animationDelay: `${0.2 + index * 0.1}s` }}
              >
                <div className={`text-4xl font-bold text-${stat.color} mb-2`}>{stat.value}</div>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Features Section */}
          <div className="grid md:grid-cols-3 gap-6 mb-24">
            {[
              {
                icon: Brain,
                title: "Effortless Logging",
                description: "Capture any topic in seconds. Add context with optional notes to enhance your future reviews.",
                color: "primary",
              },
              {
                icon: TrendingUp,
                title: "Smart Algorithms",
                description: "Psychology-based intervals optimize retention. Review exactly when your brain needs reinforcement.",
                color: "secondary",
              },
              {
                icon: Mail,
                title: "AI-Enhanced Recall",
                description: "Receive rich, contextualized summaries. AI expands your notes into comprehensive review material.",
                color: "accent",
              },
            ].map((feature, index) => (
              <Card 
                key={feature.title} 
                className="glass-card float-hover border-border/30 animate-fade-in"
                style={{ animationDelay: `${0.3 + index * 0.1}s` }}
              >
                <CardContent className="pt-8 pb-6 px-6">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-${feature.color}/20 to-${feature.color}/5 flex items-center justify-center mx-auto mb-5 border border-${feature.color}/20`}>
                    <feature.icon className={`w-7 h-7 text-${feature.color}`} />
                  </div>
                  <h3 className="font-semibold text-xl mb-3 text-center">{feature.title}</h3>
                  <p className="text-muted-foreground text-center leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* How It Works Section */}
          <div className="max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: '0.5s' }}>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-semibold mb-4 tracking-tight">The Science of Remembering</h2>
              <p className="text-lg text-muted-foreground">
                Backed by decades of cognitive research on human memory
              </p>
            </div>
            
            <div className="glass-card rounded-3xl border border-border/30 p-8 md:p-10">
              <div className="space-y-6">
                {[
                  {
                    title: "Day 1: Capture & Learn",
                    description: "Log what you've learned today. Our system immediately schedules your optimal review timeline.",
                    color: "primary",
                  },
                  {
                    title: "Day 1 → 30: Strategic Intervals",
                    description: "Receive AI-powered reminders at psychologically optimal moments—right before you'd forget.",
                    color: "secondary",
                  },
                  {
                    title: "Long-Term Mastery",
                    description: "Each review strengthens neural pathways, transforming short-term memory into permanent knowledge.",
                    color: "accent",
                  },
                ].map((step, index) => (
                  <div key={step.title} className="flex gap-4 animate-fade-in" style={{ animationDelay: `${0.6 + index * 0.1}s` }}>
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-${step.color}/10 border-2 border-${step.color} flex items-center justify-center`}>
                      <CheckCircle2 className={`w-5 h-5 text-${step.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-border/30">
                <p className="text-sm text-muted-foreground italic text-center">
                  <span className="font-semibold text-foreground">Research shows:</span> Without reinforcement, we forget 80% of new information within 30 days. 
                  Spaced repetition can increase retention rates to over 90%.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="glass-card border-t border-border/30">
        <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            © 2024 LearnLoop. Built for learners who want to remember what matters.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
