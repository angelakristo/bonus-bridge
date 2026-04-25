import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Mail, MessageSquare, BookOpen } from "lucide-react";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

export const Route = createFileRoute("/support")({ component: SupportPage });

const CHANNELS = [
  {
    icon: Mail,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    title: "Email Support",
    desc: "For account issues, technical problems, or general enquiries.",
    action: (
      <a
        href="mailto:support@bonusbridge.io"
        className="text-sm text-sky-600 hover:underline mt-1 inline-block"
      >
        support@bonusbridge.io
      </a>
    ),
  },
  {
    icon: MessageSquare,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    title: "Live Chat",
    desc: "Available Monday–Friday, 09:00–17:00 CET.",
    action: (
      <button className="text-sm text-sky-600 hover:underline mt-1">
        Start a chat session
      </button>
    ),
  },
  {
    icon: BookOpen,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    title: "Documentation",
    desc: "User guides, setup walkthroughs, and best practices.",
    action: (
      <button className="text-sm text-sky-600 hover:underline mt-1">
        Browse the knowledge base
      </button>
    ),
  },
];

function SupportPage() {
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
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Support</h1>
              <p className="text-slate-500 text-sm mt-1">
                We're here to help. Reach out through any of the channels below.
              </p>
            </div>

            <div className="space-y-3">
              {CHANNELS.map(({ icon: Icon, iconBg, iconColor, title, desc, action }) => (
                <div
                  key={title}
                  className="rounded-xl border border-slate-100 p-5 flex gap-4 items-start hover:border-sky-200 transition-colors"
                >
                  <div
                    className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}
                  >
                    <Icon className={`h-5 w-5 ${iconColor}`} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-800">{title}</h2>
                    <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                    {action}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              <strong className="text-slate-700">Account access issues?</strong>{" "}
              If you cannot log in, contact your company's HR administrator. BonusBridge uses
              invite-only access — account creation is managed by your organisation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
