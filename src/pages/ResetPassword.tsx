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

const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase parses the recovery link's hash and emits a PASSWORD_RECOVERY event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    // Also check if a session was already established from the URL.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You're signed in with your new password." });
      navigate("/dashboard");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[image:var(--gradient-hero)] p-4">
      <Card className="w-full max-w-md glass-card animate-scale-in">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[var(--shadow-button)] animate-glow-pulse">
              <Brain className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">Set a new password</CardTitle>
          <CardDescription>
            {ready
              ? "Choose a new password for your account."
              : "Validating your reset link..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ready ? (
            <form onSubmit={handleUpdate} className="space-y-4">
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
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          ) : (
            <div className="text-center text-sm text-muted-foreground">
              If this page doesn't update, your reset link may have expired.{" "}
              <button onClick={() => navigate("/auth")} className="text-primary hover:underline">
                Request a new one
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
