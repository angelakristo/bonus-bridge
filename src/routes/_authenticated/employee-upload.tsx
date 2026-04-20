import { createFileRoute } from "@tanstack/react-router";
import * as XLSX from "xlsx-js-style";
import { Download } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/employee-upload")({
  component: EmployeeUploadPage,
});

const HEADERS = [
  "employee_reference",
  "first_name",
  "last_name",
  "email",
  "org_department",
  "functional_department",
  "annual_salary",
  "employment_start_date",
  "role",
] as const;

const EXAMPLE_ROW: (string | number)[] = [
  "EMP001",
  "Jane",
  "Smith",
  "jane.smith@company.com",
  "HQ — Commercial",
  "Sales / Marketing",
  75000,
  "2024-01-15",
  "employee",
];

function downloadEmployeeTemplate() {
  const aoa: (string | number)[][] = [HEADERS as unknown as string[], EXAMPLE_ROW];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const headerStyle = {
    font: { bold: true, color: { rgb: "000000" } },
    alignment: { horizontal: "left" as const, vertical: "center" as const },
  };
  const exampleStyle = {
    font: { italic: true, color: { rgb: "808080" } },
  };

  for (let c = 0; c < HEADERS.length; c++) {
    const headerAddr = XLSX.utils.encode_cell({ r: 0, c });
    const exampleAddr = XLSX.utils.encode_cell({ r: 1, c });
    if (ws[headerAddr]) ws[headerAddr].s = headerStyle;
    if (ws[exampleAddr]) ws[exampleAddr].s = exampleStyle;
  }

  ws["!cols"] = [
    { wch: 20 }, // employee_reference
    { wch: 14 }, // first_name
    { wch: 14 }, // last_name
    { wch: 28 }, // email
    { wch: 22 }, // org_department
    { wch: 22 }, // functional_department
    { wch: 14 }, // annual_salary
    { wch: 20 }, // employment_start_date
    { wch: 12 }, // role
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");
  XLSX.writeFile(wb, "bonusbridge_employee_template.xlsx");
}

function EmployeeUploadPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("hr_rep") || roles.includes("ceo");

  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employee Upload</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-import your employee roster in two steps.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Download Template</CardTitle>
          <CardDescription>
            Download the template, fill it with your employee data, then upload it in Step 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadEmployeeTemplate}>
            <Download className="h-4 w-4" />
            Download Employee Template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2 — Upload File</CardTitle>
          <CardDescription>Coming soon.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
