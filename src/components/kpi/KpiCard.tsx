import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

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

export type KpiCardSource = "library" | "corporate" | "department";

type Props = {
  kpi: KpiCardData;
  /** Which panel this card lives in — used for drag data. */
  source: KpiCardSource;
  /** Unique sortable id — must be unique across the entire DndContext. */
  sortableId: string;
};

export function DraggableKpiCard({ kpi, source, sortableId }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { kpi, source },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <KpiCardInner kpi={kpi} dragListeners={listeners} />
    </div>
  );
}

/** Static (non-draggable) variant — used for the drag overlay. */
export function KpiCardOverlay({ kpi }: { kpi: KpiCardData }) {
  return <KpiCardInner kpi={kpi} />;
}

function KpiCardInner({
  kpi,
  dragListeners,
}: {
  kpi: KpiCardData;
  dragListeners?: Record<string, unknown>;
}) {
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
    <Card className="shadow-sm cursor-grab active:cursor-grabbing">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground touch-none"
            {...(dragListeners as React.HTMLAttributes<HTMLButtonElement> | undefined)}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold leading-tight">{kpi.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-6">
          <Badge variant="outline" className={cn("text-xs font-medium border-0", ds.bg, ds.text)}>
            {ds.label}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {TYPE_LABEL[kpi.kpi_type]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground pl-6">
          Year-End Target: <span className="font-medium text-foreground">{targetDisplay}</span>
        </p>
      </CardContent>
    </Card>
  );
}
