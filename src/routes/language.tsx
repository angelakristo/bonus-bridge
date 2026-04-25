import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

export const Route = createFileRoute("/language")({ component: LanguagePage });

const LANGUAGES = [
  { code: "en", label: "English",    flag: "🇬🇧", available: true  },
  { code: "de", label: "Deutsch",    flag: "🇩🇪", available: false },
  { code: "fr", label: "Français",   flag: "🇫🇷", available: false },
  { code: "nl", label: "Nederlands", flag: "🇳🇱", available: false },
  { code: "es", label: "Español",    flag: "🇪🇸", available: false },
  { code: "sv", label: "Svenska",    flag: "🇸🇪", available: false },
];

function LanguagePage() {
  const [selected, setSelected] = useState("en");

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
              <h1 className="text-2xl font-bold text-slate-800">Language</h1>
              <p className="text-slate-500 text-sm mt-1">
                Select your preferred display language. Additional languages are coming soon.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {LANGUAGES.map(({ code, label, flag, available }) => (
                <button
                  key={code}
                  disabled={!available}
                  onClick={() => available && setSelected(code)}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                    selected === code
                      ? "border-sky-400 bg-sky-50 shadow-sm"
                      : available
                      ? "border-slate-200 hover:border-sky-200 hover:bg-slate-50"
                      : "border-slate-100 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <span className="text-2xl">{flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800">{label}</div>
                    {!available && (
                      <div className="text-[10px] text-slate-400">Coming soon</div>
                    )}
                  </div>
                  {selected === code && <Check className="h-4 w-4 text-sky-600 shrink-0" />}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-400 text-center">
              English is currently the only available language. Additional languages will be
              added in future releases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
