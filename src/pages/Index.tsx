import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Mail, Calendar, Zap } from "lucide-react";

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

      <main className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Spaced Repetition Learning
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Never Forget What
            <br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              You Learn
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Remember concepts like stacks, queues, and string builders long after you've learned them. 
            Get AI-powered email reminders at scientifically optimal intervals.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button
              onClick={() => navigate("/auth")}
              size="lg"
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity text-lg px-8"
            >
              Start Learning Better
            </Button>
            <Button
              onClick={() => navigate("/auth")}
              size="lg"
              variant="outline"
              className="text-lg px-8"
            >
              See How It Works
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-16">
            <Card className="border-2 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Log Your Learning</h3>
                <p className="text-muted-foreground text-sm">
                  Simply add topics you've learned each day with optional notes
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Smart Scheduling</h3>
                <p className="text-muted-foreground text-sm">
                  We schedule reviews using proven spaced repetition intervals
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-soft)] transition-all">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-semibold text-lg mb-2">AI-Powered Reminders</h3>
                <p className="text-muted-foreground text-sm">
                  Get detailed concept summaries via email when it's time to review
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-16 p-8 bg-card rounded-2xl border-2 shadow-[var(--shadow-card)] text-left max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">How Spaced Repetition Works</h2>
            <p className="text-muted-foreground mb-4">
              The forgetting curve shows we lose 80% of new information within 30 days. 
              Spaced repetition fights this by reviewing content at optimal intervals:
            </p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Day 1:</strong> Learn a new concept</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Day 30:</strong> First reminder with AI-generated summary</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span><strong>Ongoing:</strong> Continued reminders to reinforce long-term memory</span>
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-4 py-8 text-center text-muted-foreground text-sm border-t">
        <p>© 2024 LearnLoop. Master your learning journey.</p>
      </footer>
    </div>
  );
};

export default Index;
