import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useYear } from "@/contexts/YearContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export type KpiLevel = "corporate" | "department" | "individual";
export type KpiType = "progressive" | "binary" | "benchmark";
export type KpiDriver = "growth" | "efficiency" | "culture";

export type NumericTargetPeriod = "q1" | "q2" | "q3" | "q4" | "midyear" | "yearend";
export type BinaryTargetPeriod = "midyear" | "yearend";

export type AddKpiFormValues = {
  title: string;
  description: string;
  kpi_type: KpiType;
  driver: KpiDriver;
  unit: string;
  numeric_targets: Record<NumericTargetPeriod, string>;
  binary_targets: Record<BinaryTargetPeriod, boolean>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: KpiLevel;
  onSuccess: (values: AddKpiFormValues) => void;
};

const LEVEL_LABEL: Record<KpiLevel, string> = {
  corporate: "Corporate",
  department: "Department",
  individual: "Individual",
};

const NUMERIC_TARGET_FIELDS: { key: NumericTargetPeriod; label: string }[] = [
  { key: "q1", label: "Q1 Target" },
  { key: "q2", label: "Q2 Target" },
  { key: "q3", label: "Q3 Target" },
  { key: "q4", label: "Q4 Target" },
  { key: "midyear", label: "Mid-Year Target" },
  { key: "yearend", label: "Year-End Target" },
];

const EMPTY: AddKpiFormValues = {
  title: "",
  description: "",
  kpi_type: "progressive",
  driver: "growth",
  unit: "",
  numeric_targets: { q1: "", q2: "", q3: "", q4: "", midyear: "", yearend: "" },
  binary_targets: { midyear: false, yearend: false },
};

export function AddKpiModal({ open, onOpenChange, level, onSuccess }: Props) {
  const [values, setValues] = useState<AddKpiFormValues>(EMPTY);
  const [titleError, setTitleError] = useState<string | null>(null);

  const update = <K extends keyof AddKpiFormValues>(
    key: K,
    value: AddKpiFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const handleSave = () => {
    if (!values.title.trim()) {
      setTitleError("KPI Title is required.");
      return;
    }
    setTitleError(null);
    onSuccess(values);
    setValues(EMPTY);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setValues(EMPTY);
      setTitleError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add {LEVEL_LABEL[level]} KPI</DialogTitle>
          <DialogDescription>
            Define the KPI details. Targets will be set in the next step.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* 1. Title */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-title">
              KPI Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="kpi-title"
              value={values.title}
              onChange={(e) => {
                update("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
              placeholder="e.g. Net Revenue Growth"
            />
            {titleError && (
              <p className="text-xs text-destructive">{titleError}</p>
            )}
          </div>

          {/* 2. Description */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-description">Description</Label>
            <Textarea
              id="kpi-description"
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Optional context about this KPI"
              rows={3}
            />
          </div>

          {/* 3. KPI Type */}
          <div className="space-y-2">
            <Label>KPI Type</Label>
            <RadioGroup
              value={values.kpi_type}
              onValueChange={(v) => update("kpi_type", v as KpiType)}
              className="gap-2"
            >
              <Label
                htmlFor="type-progressive"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id="type-progressive" value="progressive" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Progressive</span>
                  <span className="block text-xs text-muted-foreground">
                    Tracked cumulatively by value
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="type-binary"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id="type-binary" value="binary" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Binary</span>
                  <span className="block text-xs text-muted-foreground">
                    Achieved or not achieved
                  </span>
                </span>
              </Label>
              <Label
                htmlFor="type-benchmark"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <RadioGroupItem id="type-benchmark" value="benchmark" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Benchmark</span>
                  <span className="block text-xs text-muted-foreground">
                    Point-in-time score
                  </span>
                </span>
              </Label>
            </RadioGroup>
          </div>


          {/* 4. Driver */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-driver">Driver</Label>
            <Select
              value={values.driver}
              onValueChange={(v) => update("driver", v as KpiDriver)}
            >
              <SelectTrigger id="kpi-driver">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="efficiency">Efficiency</SelectItem>
                <SelectItem value="culture">Culture</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 5. Unit */}
          <div className="space-y-1.5">
            <Label htmlFor="kpi-unit">
              Unit
              {values.kpi_type === "binary" && (
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Input
              id="kpi-unit"
              value={values.unit}
              onChange={(e) => update("unit", e.target.value)}
              placeholder="e.g. EUR, %, Score out of 5, Count"
            />
          </div>

          {/* 6. Targets — dynamic based on KPI Type */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Targets</Label>
              <p className="text-xs text-muted-foreground">
                Optional at draft stage — required before this KPI can be approved.
              </p>
            </div>

            {(values.kpi_type === "progressive" || values.kpi_type === "benchmark") && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {NUMERIC_TARGET_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`target-${f.key}`} className="text-xs">
                      {f.label}
                    </Label>
                    <Input
                      id={`target-${f.key}`}
                      type="number"
                      inputMode="decimal"
                      value={values.numeric_targets[f.key]}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          numeric_targets: {
                            ...v.numeric_targets,
                            [f.key]: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {values.kpi_type === "binary" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border bg-background p-3">
                  <Label htmlFor="binary-midyear" className="text-sm font-normal">
                    Achieved by Mid-Year?
                  </Label>
                  <Switch
                    id="binary-midyear"
                    checked={values.binary_targets.midyear}
                    onCheckedChange={(checked) =>
                      setValues((v) => ({
                        ...v,
                        binary_targets: { ...v.binary_targets, midyear: checked },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background p-3">
                  <Label htmlFor="binary-yearend" className="text-sm font-normal">
                    Achieved by Year-End?
                  </Label>
                  <Switch
                    id="binary-yearend"
                    checked={values.binary_targets.yearend}
                    onCheckedChange={(checked) =>
                      setValues((v) => ({
                        ...v,
                        binary_targets: { ...v.binary_targets, yearend: checked },
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save KPI</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
