import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

// ─── CSS animations (injected once) ──────────────────────────────────────────
const CSS_ANIMS = `
  @keyframes bb-float-a {
    0%,100% { transform: translateY(0px) rotate(0deg); }
    50%      { transform: translateY(-10px) rotate(0.5deg); }
  }
  @keyframes bb-float-b {
    0%,100% { transform: translateY(0px) rotate(0deg); }
    50%      { transform: translateY(-14px) rotate(-0.5deg); }
  }
  @keyframes bb-float-c {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-8px); }
  }
  @keyframes bb-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

// ─── Device data ──────────────────────────────────────────────────────────────
const DEVICES = [
  {
    id: "smartphone" as const,
    label: "Smartphone",
    message: "Track your progress anytime, anywhere.",
    anim: "bb-float-a 3.2s ease-in-out infinite",
  },
  {
    id: "laptop" as const,
    label: "Laptop",
    message: "Review your performance clearly.",
    anim: "bb-float-b 3.8s ease-in-out infinite 0.6s",
  },
  {
    id: "tablet" as const,
    label: "Tablet",
    message: "Your bonus journey is getting stronger.",
    anim: "bb-float-c 4.2s ease-in-out infinite 1.2s",
  },
] as const;

const BADGES = [
  "Daily goal reached 🎯",
  "Performance +12% 📈",
  "New KPI update ✨",
  "Reward progress increased 🏆",
  "Bonus unlocked soon 🎁",
];

const NAV = [
  { label: "About us", href: "/about" },
  { label: "FAQs",     href: "/faqs" },
  { label: "Support",  href: "/support" },
  { label: "Language", href: "/language" },
];

// ─── Device mock screens ──────────────────────────────────────────────────────
function PhoneMock({ active }: { active: boolean }) {
  return (
    <div className="w-[80px] h-[130px] flex flex-col gap-1 overflow-hidden">
      <div className={`h-1.5 rounded-full transition-colors duration-500 ${active ? "bg-sky-400" : "bg-slate-200"}`} />
      <div className="text-[7px] font-bold text-slate-600">Welcome!</div>
      <div className="space-y-1">
        {["w-full", "w-4/5", "w-3/5"].map((w, i) => (
          <div
            key={i}
            className={`h-1.5 rounded ${w} transition-colors duration-500 ${
              active ? ["bg-green-300", "bg-sky-200", "bg-amber-200"][i] : "bg-slate-100"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1">
        {(["KPI", "Goal"] as const).map((lbl, i) => (
          <div
            key={lbl}
            className={`rounded p-1 text-[6px] font-medium text-center transition-colors duration-500 ${
              active ? [" bg-sky-100 text-sky-700", "bg-green-100 text-green-700"][i] : "bg-slate-50 text-slate-300"
            }`}
          >
            {lbl}
          </div>
        ))}
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
        <div className={`h-full w-[65%] rounded-full transition-colors duration-500 ${active ? "bg-sky-400" : "bg-slate-200"}`} />
      </div>
    </div>
  );
}

function LaptopMock({ active }: { active: boolean }) {
  return (
    <div className="w-[130px] h-[80px] flex flex-col gap-1 overflow-hidden">
      <div className={`h-1 rounded transition-colors duration-500 ${active ? "bg-sky-300" : "bg-slate-200"}`} />
      <div className="flex items-end gap-0.5 h-10">
        {[40, 65, 50, 80, 55, 70, 60].map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm transition-all duration-500 ${active ? "bg-sky-400" : "bg-slate-200"}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="space-y-0.5">
        <div className={`h-1 w-4/5 rounded transition-colors duration-500 ${active ? "bg-slate-300" : "bg-slate-100"}`} />
        <div className={`h-1 w-3/5 rounded transition-colors duration-500 ${active ? "bg-slate-200" : "bg-slate-100"}`} />
      </div>
    </div>
  );
}

function TabletMock({ active }: { active: boolean }) {
  const metrics = [
    { l: "Rev",  v: "+12%" },
    { l: "EBIT", v: "+8%"  },
    { l: "NRR",  v: "+15%" },
    { l: "eNPS", v: "+5%"  },
  ];
  return (
    <div className="w-[100px] h-[75px] flex flex-col gap-1 overflow-hidden">
      <div className={`h-1.5 rounded transition-colors duration-500 ${active ? "bg-sky-400" : "bg-slate-200"}`} />
      <div className="grid grid-cols-2 gap-1">
        {metrics.map(({ l, v }) => (
          <div
            key={l}
            className={`rounded p-0.5 text-center transition-colors duration-500 ${active ? "bg-sky-100" : "bg-slate-50"}`}
          >
            <div className="text-[5px] text-slate-500">{l}</div>
            <div className={`text-[8px] font-bold ${active ? "text-sky-700" : "text-slate-300"}`}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────
type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});

// ─── Main component ───────────────────────────────────────────────────────────
function LoginPage() {
  const { session, ready: authReady, loading: authLoading, roles, signIn, devPreviewSignIn } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const navigate = useNavigate();
  const search = Route.useSearch();

  // Form
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Device animation
  const [activeIdx,    setActiveIdx]    = useState(0);
  const [badgeIdx,     setBadgeIdx]     = useState(0);
  const [badgeVisible, setBadgeVisible] = useState(true);
  const [msgKey,       setMsgKey]       = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveIdx((i) => (i + 1) % DEVICES.length);
      setMsgKey((k) => k + 1);
      setBadgeVisible(false);
      setTimeout(() => {
        setBadgeIdx((i) => (i + 1) % BADGES.length);
        setBadgeVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  // Auth redirect
  useEffect(() => {
    if (!authReady || authLoading || entityLoading || !session) return;
    if (search.redirect) { navigate({ to: search.redirect, replace: true }); return; }
    if (roles.includes("hr_rep") && !entity_id) { navigate({ to: "/register-entity", replace: true }); return; }
    navigate({ to: "/dashboard", replace: true });
  }, [authReady, authLoading, entityLoading, session, roles, entity_id, navigate, search.redirect]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) { toast.error(error.message || "Failed to sign in"); return; }
    toast.success("Signed in");
  };

  const handlePreview = async (role: "ceo" | "hr_rep" | "manager" | "employee") => {
    setPreviewing(true);
    const { error } = await devPreviewSignIn(role);
    setPreviewing(false);
    if (error) { toast.error(`Preview failed: ${error.message}`); return; }
    toast.success(`Signed in as ${role.toUpperCase()}`);
  };

  const bothFilled = email.trim().length > 0 && password.trim().length > 0;

  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-sky-50 p-3">
      <style dangerouslySetInnerHTML={{ __html: CSS_ANIMS }} />

      {/* Main rounded panel */}
      <div
        className="relative w-full max-w-5xl rounded-3xl bg-sky-100/80 backdrop-blur-sm shadow-2xl overflow-hidden"
        style={{ maxHeight: "calc(100vh - 1.5rem)" }}
      >
        {/* Top-right navigation */}
        <nav className="absolute top-3 right-5 flex items-center gap-5 z-10">
          {NAV.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-xs font-medium text-slate-500 hover:text-sky-700 transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Two-column layout */}
        <div
          className="flex flex-col lg:flex-row overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 1.5rem)" }}
        >

          {/* ── Left: Device animation ── */}
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 pt-10">

            {/* Motivational message — fades in on device change */}
            <p
              key={msgKey}
              className="text-center text-sm font-medium text-slate-600 max-w-[220px]"
              style={{ animation: "bb-fade-in 0.5s ease" }}
            >
              {DEVICES[activeIdx].message}
            </p>

            {/* Device cards */}
            <div className="flex items-end justify-center gap-4">
              {DEVICES.map((device, i) => {
                const isActive = i === activeIdx;
                return (
                  <div
                    key={device.id}
                    // On mobile: only show the active device; on desktop: show all three
                    className={`flex flex-col items-center gap-1.5 transition-all duration-500 ${
                      !isActive ? "hidden lg:flex" : "flex"
                    }`}
                    style={{ animation: device.anim }}
                  >
                    <div
                      className={`rounded-2xl p-3 transition-all duration-500 ${
                        isActive
                          ? "bg-white shadow-xl shadow-sky-200/60 ring-2 ring-sky-400 scale-105"
                          : "bg-white/50 shadow-md scale-95 opacity-50"
                      }`}
                    >
                      {device.id === "smartphone" && <PhoneMock  active={isActive} />}
                      {device.id === "laptop"     && <LaptopMock active={isActive} />}
                      {device.id === "tablet"     && <TabletMock active={isActive} />}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">{device.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Cycling performance badge */}
            <div
              className="rounded-full bg-white border border-sky-200 px-4 py-1.5 text-xs font-semibold text-sky-700 shadow-md"
              style={{ opacity: badgeVisible ? 1 : 0, transition: "opacity 0.3s ease" }}
            >
              {BADGES[badgeIdx]}
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              Receive updates · Track progress · Set KPIs · Get rewarded
            </p>
          </div>

          {/* Vertical divider (desktop only) */}
          <div className="hidden lg:block w-px bg-sky-200/80 self-stretch my-6" />

          {/* ── Right: Branding + form ── */}
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 pt-8 lg:pt-6">

            {/* Logo + subtitle */}
            <div className="flex flex-col items-center gap-1">
              <img src={bonusbridgeLogo} alt="BonusBridge" className="h-16 w-auto drop-shadow" />
              <p className="text-[11px] uppercase tracking-widest text-slate-500 font-medium">
                Connecting performance to rewards
              </p>
            </div>

            {/* Login form */}
            <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
              <Input
                type="email"
                autoComplete="email"
                placeholder="E-mail"
                aria-label="E-mail"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-2xl border-slate-300 bg-white text-center shadow-sm h-11 placeholder:text-slate-400"
              />

              <div>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  aria-label="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-2xl border-slate-300 bg-white text-center shadow-sm h-11 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  className="mt-1 w-full text-right text-[11px] text-slate-400 hover:text-sky-600 transition-colors"
                  onClick={() => toast.info("Contact your administrator to reset your password.")}
                >
                  Forgot my password
                </button>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl h-11 font-semibold text-sm transition-all duration-300"
                style={
                  bothFilled
                    ? { background: "linear-gradient(135deg, #0284c7, #06b6d4)" }
                    : undefined
                }
              >
                {submitting ? "Signing in…" : bothFilled ? "Push to Bonus" : "Register"}
              </Button>
            </form>

            {/* Dev preview (preserved) */}
            <div className="w-full max-w-xs">
              <div className="flex items-center gap-3 my-1">
                <Separator className="flex-1" />
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Dev preview</span>
                <Separator className="flex-1" />
              </div>
              <div className="rounded-xl border border-dashed border-accent/30 bg-white/40 p-2.5">
                <div className="mb-2 flex items-center gap-1 text-[10px] text-slate-400">
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span>Skip auth · sign in as a role</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["ceo", "hr_rep", "manager", "employee"] as const).map((role) => (
                    <Button
                      key={role}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs h-7 capitalize"
                      disabled={previewing || submitting}
                      onClick={() => void handlePreview(role)}
                    >
                      {role === "hr_rep" ? "HR Rep" : role.charAt(0).toUpperCase() + role.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
