import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Brain } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

type Mode = "login" | "signup" | "forgot";

const Auth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const popPostLogin = (): string => {
      const stored = sessionStorage.getItem("post_login_redirect");
      if (stored) sessionStorage.removeItem("post_login_redirect");
      if (stored && stored.startsWith("/") && !stored.startsWith("//")) return stored;
      return "/dashboard";
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // If this is a password recovery session, send the user to the reset page.
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password");
        return;
      }
      if (session && event === "SIGNED_IN") {
        navigate(popPostLogin());
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate(popPostLogin());
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = emailSchema.safeParse(email);
    if (!v.success) {
      toast({ title: "Invalid email", description: v.error.errors[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "Check your email",
        description: "We've sent you a link to reset your password.",
      });
      setMode("login");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    const pv = passwordSchema.safeParse(password);
    if (!ev.success) {
      toast({ title: "Invalid email", description: ev.error.errors[0].message, variant: "destructive" });
      return;
    }
    if (!pv.success) {
      toast({ title: "Invalid password", description: pv.error.errors[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast({
            title: "Login failed",
            description: error.message.includes("Invalid login credentials")
              ? "Invalid email or password."
              : error.message,
            variant: "destructive",
          });
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) {
          toast({
            title: error.message.includes("already registered") ? "Account exists" : "Error",
            description: error.message.includes("already registered")
              ? "This email is already registered. Please log in instead."
              : error.message,
            variant: "destructive",
          });
        } else {
          toast({ title: "Success!", description: "Account created. You can now log in." });
          setMode("login");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "forgot" ? "Reset Password" : mode === "login" ? "Welcome Back" : "Create Account";

  const description =
    mode === "forgot"
      ? "Enter your email and we'll send you a reset link."
      : mode === "login"
      ? "Sign in to continue your learning journey"
      : "Start remembering everything you learn";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[image:var(--gradient-hero)] p-4">
      <Card className="w-full max-w-md glass-card animate-scale-in">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[var(--shadow-button)] animate-glow-pulse">
              <Brain className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "forgot" ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              <Button
                type="submit"
                className="w-full glossy-button bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-medium"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              {mode === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <Button
                type="submit"
                className="w-full glossy-button bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-medium"
                disabled={loading}
              >
                {loading ? "Loading..." : mode === "login" ? "Sign In" : "Sign Up"}
              </Button>
            </form>
          )}

          <div className="mt-4 text-center text-sm">
            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-primary hover:underline"
              >
                Back to sign in
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-primary hover:underline"
              >
                {mode === "login"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
