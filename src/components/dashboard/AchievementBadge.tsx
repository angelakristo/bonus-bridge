import { cn } from "@/lib/utils";

type Props = {
  pct: number | null;
  isBinary?: boolean;
  binaryValue?: boolean | null;
  size?: "sm" | "md";
};

export function AchievementBadge({ pct, isBinary, binaryValue, size = "sm" }: Props) {
  const base = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  if (isBinary) {
    if (binaryValue === null || binaryValue === undefined) {
      return (
        <span className={cn("inline-flex items-center rounded-full font-medium bg-muted text-muted-foreground", base)}>
          No data
        </span>
      );
    }
    return (
      <span className={cn("inline-flex items-center rounded-full font-medium", base,
        binaryValue ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      )}>
        {binaryValue ? "✓ Achieved" : "✗ Not yet"}
      </span>
    );
  }

  if (pct === null || pct === undefined) {
    return (
      <span className={cn("inline-flex items-center rounded-full font-medium bg-muted text-muted-foreground", base)}>
        No data
      </span>
    );
  }

  const color =
    pct >= 100 ? "bg-green-100 text-green-800" :
    pct >= 80  ? "bg-amber-100 text-amber-800" :
                 "bg-red-100 text-red-800";

  return (
    <span className={cn("inline-flex items-center rounded-full font-medium", base, color)}>
      {Math.round(pct)}%
    </span>
  );
}
