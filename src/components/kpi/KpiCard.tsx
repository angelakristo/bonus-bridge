import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiCardData = {
  id: string;
  title: string;
  driver: "growth" | "efficiency" | "culture";
  kpi_type: "progressive" | "binary" | "benchmark";
  unit: string | null;
  yearend_target_value: number | null;
  yearend_target_binary: boolean | null;
};

const DRIVER_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  growth: { bg: "bg-green-100", text: "text-green-800", label: "Growth" },
  efficiency: { bg: "bg-blue-100", text: "text-blue-800", label: "Efficiency" },
  culture: { bg: "bg-amber-100", text: "text-amber-800", label: "Culture" },
};

const TYPE_LABEL: Record<string, string> = {
  progressive: "Progressive",
  binary: "Binary",
  benchmark: "Benchmark",
};

export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const ds = DRIVER_STYLE[kpi.driver] ?? DRIVER_STYLE.growth;
  const isBinary = kpi.kpi_type === "binary";

  let targetDisplay: string;
  if (isBinary) {
    targetDisplay =
      kpi.yearend_target_binary === true
        ? "✓ Achieved"
        : kpi.yearend_target_binary === false
          ? "✗ Not achieved"
          : "—";
  } else {
    targetDisplay =
      kpi.yearend_target_value != null
        ? `${kpi.yearend_target_value}${kpi.unit ? ` ${kpi.unit}` : ""}`
        : "—";
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-2">
        <p className="text-sm font-semibold leading-tight">{kpi.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("text-xs font-medium border-0", ds.bg, ds.text)}>
            {ds.label}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {TYPE_LABEL[kpi.kpi_type]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Year-End Target: <span className="font-medium text-foreground">{targetDisplay}</span>
        </p>
      </CardContent>
    </Card>
  );
}
