import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { useEntity } from "@/contexts/EntityContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/upload-history")({
  component: UploadHistoryPage,
});

type UploadRow = {
  id: string;
  upload_type: "employees" | "actuals";
  file_name: string;
  uploaded_at: string;
  status: "processing" | "success" | "failed";
  row_count: number | null;
  uploaded_by: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UploadHistoryPage() {
  const { entity_id } = useEntity();

  const [rows, setRows] = useState<UploadRow[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entity_id) return;
    (async () => {
      const { data } = await supabase
        .from("excel_uploads")
        .select("id,upload_type,file_name,uploaded_at,status,row_count,uploaded_by")
        .eq("entity_id", entity_id)
        .order("uploaded_at", { ascending: false });

      const uploads = (data ?? []) as UploadRow[];
      setRows(uploads);

      const uploaderIds = Array.from(
        new Set(uploads.map((r) => r.uploaded_by).filter(Boolean))
      ) as string[];

      if (uploaderIds.length > 0) {
        const { data: people } = await supabase
          .from("v_people_public")
          .select("id,first_name,last_name")
          .in("id", uploaderIds);
        const map: Record<string, string> = {};
        for (const p of people ?? []) {
          if (p.id) map[p.id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        }
        setNameMap(map);
      }

      setLoading(false);
    })();
  }, [entity_id]);

  const statusVariant = (
    s: string
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "success") return "default";
    if (s === "failed") return "destructive";
    return "secondary";
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Upload History</h1>
        <p className="text-sm text-muted-foreground">All Excel uploads for this entity</p>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm">Uploads</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No uploads found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(r.uploaded_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {r.upload_type === "actuals" ? "Actuals" : "Employees"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium max-w-xs truncate">
                      {r.file_name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.uploaded_by ? (nameMap[r.uploaded_by] ?? "Unknown") : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.row_count ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)} className="text-xs capitalize">
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
