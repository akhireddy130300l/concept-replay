import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SaveToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Save for future research</Label>
        <p className="text-xs text-muted-foreground">
          {value
            ? "Holdings will be saved to your portfolio for re-use."
            : "Holdings will be used only for this analysis and not saved."}
        </p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
