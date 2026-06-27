import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Brain } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

type Mode = "login" | "signup" | "forgot-email" | "forgot-otp";

const Auth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
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
      // Don't auto-navigate while user is resetting password via OTP flow
      if (session && event === "SIGNED_IN" && mode !== "forgot-otp") {
        navigate(popPostLogin());
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && mode !== "forgot-otp") {
        navigate(popPostLogin());
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, mode]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = emailSchema.safeParse(email);
    if (!v.success) {
      toast({ title: "Invalid email", description: v.error.errors[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Sends a password recovery email containing a 6-digit OTP
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast({ title: "Code sent", description: "Check your email for a 6-digit verification code." });
      setMode("forgot-otp");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast({ title: "Invalid code", description: "Enter the 6-digit code.", variant: "destructive" });
      return;
    }
    const pv = passwordSchema.safeParse(password);
    if (!pv.success) {
      toast({ title: "Invalid password", description: pv.error.errors[0].message, variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please retype your new password.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });
      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      toast({ title: "Password updated", description: "You're signed in with your new password." });
      navigate("/dashboard");
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
    mode === "forgot-otp"
      ? "Enter Verification Code"
      : mode === "forgot-email"
      ? "Reset Password"
      : mode === "login"
      ? "Welcome Back"
      : "Create Account";

  const description =
    mode === "forgot-otp"
      ? `We sent a 6-digit code to ${email}. Enter it below with your new password.`
      : mode === "forgot-email"
      ? "Enter your email and we'll send you a verification code."
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
          {mode === "forgot-email" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
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
                {loading ? "Sending..." : "Send Verification Code"}
              </Button>
            </form>
          )}

          {mode === "forgot-otp" && (
            <form onSubmit={handleVerifyOtpAndReset} className="space-y-4">
              <div className="space-y-2">
                <Label>Verification Code</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              <Button
                type="submit"
                className="w-full glossy-button bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-medium"
                disabled={loading}
              >
                {loading ? "Verifying..." : "Verify & Update Password"}
              </Button>
              <button
                type="button"
                onClick={handleSendOtp as any}
                className="w-full text-sm text-primary hover:underline"
                disabled={loading}
              >
                Resend code
              </button>
            </form>
          )}

          {(mode === "login" || mode === "signup") && (
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
                    onClick={() => setMode("forgot-email")}
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
            {mode === "forgot-email" || mode === "forgot-otp" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setOtp("");
                  setPassword("");
                  setConfirmPassword("");
                }}
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
