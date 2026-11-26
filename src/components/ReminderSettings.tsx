import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Clock, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getBrowserTimezone,
  listTimezones,
  nextRevisionInstant,
  formatInTz,
} from "@/lib/reminderTime";

export interface UserPreferences {
  timezone: string;
  reminder_hour: number;
  reminder_minute: number;
}

interface Props {
  userId: string;
  onChange?: (prefs: UserPreferences) => void;
}

export function ReminderSettings({ userId, onChange }: Props) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timezones = useMemo(() => listTimezones(), []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("timezone, reminder_hour, reminder_minute")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        setPrefs(data as UserPreferences);
        onChange?.(data as UserPreferences);
      } else {
        const detected: UserPreferences = {
          timezone: getBrowserTimezone(),
          reminder_hour: 9,
          reminder_minute: 0,
        };
        await supabase.from("user_preferences").insert({ user_id: userId, ...detected });
        setPrefs(detected);
        onChange?.(detected);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const save = async (updates: Partial<UserPreferences>) => {
    if (!prefs) return;
    const next = { ...prefs, ...updates };
    setPrefs(next);
    setSaving(true);
    const { error } = await supabase
      .from("user_preferences")
      .update(updates)
      .eq("user_id", userId);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    onChange?.(next);
    toast({ title: "Saved", description: "Reminder preferences updated." });
  };

  if (!prefs) return null;

  const timeValue =
    `${String(prefs.reminder_hour).padStart(2, "0")}:${String(prefs.reminder_minute).padStart(2, "0")}`;

  const nextEmail = nextRevisionInstant(
    new Date(),
    0,
    prefs.reminder_hour,
    prefs.reminder_minute,
    prefs.timezone,
  );

  return (
    <Card className="surface-panel border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Reminder Time</h3>
            <p className="text-xs text-muted-foreground truncate">
              Next email: {formatInTz(nextEmail, prefs.timezone)}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <CardContent className="pt-0 pb-5 px-5 space-y-4 border-t border-border/40">
          <div className="grid sm:grid-cols-2 gap-4 pt-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <MapPin className="w-3 h-3" /> Timezone
              </Label>
              <Select value={prefs.timezone} onValueChange={(v) => save({ timezone: v })}>
                <SelectTrigger className="glass-input border-border/50 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => save({ timezone: getBrowserTimezone() })}
              >
                Use my device timezone ({getBrowserTimezone()})
              </Button>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock className="w-3 h-3" /> Send at (local time)
              </Label>
              <Input
                type="time"
                value={timeValue}
                className="glass-input border-border/50 rounded-xl"
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) {
                    save({ reminder_hour: h, reminder_minute: m });
                  }
                }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-background/60 p-3 text-xs">
            <p className="text-muted-foreground uppercase tracking-wider mb-0.5">Next email arrives</p>
            <p className="font-semibold text-sm text-foreground">{formatInTz(nextEmail, prefs.timezone)}</p>
            <p className="text-muted-foreground mt-0.5">Local time: {nextEmail.toLocaleString()}</p>
          </div>
          {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
        </CardContent>
      )}
    </Card>
  );
}
