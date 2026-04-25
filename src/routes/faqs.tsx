import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

export const Route = createFileRoute("/faqs")({ component: FaqsPage });

const FAQS = [
  {
    q: "What is BonusBridge?",
    a: "BonusBridge is a KPI and bonus management platform that connects employee performance to structured rewards. It helps organisations cascade strategy, track actuals, and calculate bonus payouts fairly.",
  },
  {
    q: "Who can access BonusBridge?",
    a: "Access is invite-only. Your HR representative or administrator sets up your account. You will receive login credentials once your organisation is onboarded.",
  },
  {
    q: "How is my bonus calculated?",
    a: "Your bonus is based on your weighted KPI achievement score across three drivers: Growth, Efficiency, and Culture. Your score maps to a bonus scheme tier, which determines your bonus percentage of salary.",
  },
  {
    q: "Can I see my KPI targets?",
    a: "Yes. Once logged in, navigate to My Dashboard or My KPI Proposals to view your individual KPIs, targets, actuals, and achievement percentages for each period.",
  },
  {
    q: "What periods are tracked?",
    a: "KPI actuals are tracked across six periods: Q1, Q2, Q3, Q4, Mid-Year (H1), and Year-End (Full Year). Your manager or HR rep uploads actuals on a quarterly or half-yearly basis.",
  },
  {
    q: "I forgot my password. What do I do?",
    a: "Password reset is managed by your organisation's administrator. Please contact your HR representative or company admin to request a reset.",
  },
  {
    q: "Can I propose my own KPIs?",
    a: "Yes. Employees can propose individual KPIs through the My KPI Proposals screen. Proposals are reviewed and approved or rejected by your manager.",
  },
  {
    q: "What is a bonus scheme tier?",
    a: "A bonus scheme defines threshold bands (e.g. On-Target, Stretch, Exceptional). Each band has a minimum achievement percentage and a corresponding bonus percentage of your salary.",
  },
];

function FaqsPage() {
  return (
    <div className="h-screen overflow-hidden bg-sky-50">
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <a
              href="/login"
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </a>
            <img src={bonusbridgeLogo} alt="BonusBridge" className="h-8 w-auto ml-auto" />
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-md">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Frequently Asked Questions</h1>
            <div className="space-y-5">
              {FAQS.map(({ q, a }) => (
                <div key={q} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                  <h2 className="font-semibold text-slate-800 mb-1.5">{q}</h2>
                  <p className="text-sm text-slate-600">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
