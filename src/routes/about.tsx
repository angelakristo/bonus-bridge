import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
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

          <div className="rounded-2xl bg-white p-8 shadow-md space-y-5">
            <h1 className="text-2xl font-bold text-slate-800">About BonusBridge</h1>

            <p className="text-slate-600">
              BonusBridge is a multi-tenant KPI management platform that helps organisations
              connect employee performance to meaningful rewards. We bridge the gap between
              corporate strategy and individual recognition.
            </p>

            <div>
              <h2 className="text-lg font-semibold text-slate-700 mb-3">What we do</h2>
              <ul className="space-y-2.5 text-slate-600">
                {[
                  "Cascade corporate strategy into individual KPIs across three performance drivers: Growth, Efficiency, and Culture.",
                  "Weight KPIs per employee, enabling fair and personalised performance measurement.",
                  "Map KPI achievement to bonus tiers with transparent, tiered payout structures.",
                  "Track actuals quarterly and generate bonus projections in real time.",
                  "Give every employee visibility into how their daily efforts connect to company success.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="text-sky-500 mt-0.5 shrink-0">✦</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-700 mb-2">Our mission</h2>
              <p className="text-slate-600">
                We believe every employee deserves clarity on how their daily efforts connect to
                company success and their own financial rewards. BonusBridge makes that connection
                visible, fair, and motivating — for individuals, managers, and leadership alike.
              </p>
            </div>

            <div className="rounded-xl bg-sky-50 border border-sky-100 p-5">
              <p className="text-sm text-sky-800 font-medium">
                "Connecting performance to rewards."
              </p>
              <p className="text-xs text-sky-600 mt-1">
                BonusBridge is invite-only. Access is managed by your organisation's HR administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
