import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ValidationError = { row: number; field: string; error: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errors: ValidationError[];
};

function downloadErrorReport(errors: ValidationError[]) {
  const aoa: (string | number)[][] = [
    ["Row", "Field", "Error Message"],
    ...errors.map((e) => [e.row, e.field, e.error]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 60 }];
  for (let c = 0; c < 3; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Upload Errors");
  XLSX.writeFile(wb, "upload_errors.xlsx");
}

export function UploadValidationModal({ open, onOpenChange, errors }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Errors Found</DialogTitle>
          <DialogDescription>
            Found {errors.length} {errors.length === 1 ? "error" : "errors"} in your file.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Row</TableHead>
                <TableHead className="w-48">Field</TableHead>
                <TableHead>Error Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((e, i) => (
                <TableRow key={`${e.row}-${e.field}-${i}`}>
                  <TableCell>{e.row}</TableCell>
                  <TableCell className="font-mono text-xs">{e.field}</TableCell>
                  <TableCell>{e.error}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => downloadErrorReport(errors)}
            disabled={errors.length === 0}
          >
            <Download className="h-4 w-4" />
            Download Error Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
