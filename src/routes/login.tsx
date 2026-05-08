import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronDown, Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useMasterAuth } from "@/contexts/MasterAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import bonusbridgeIcon   from "@/assets/bonusbridge-icon.png";
import bonusbridgeLoginLogo from "@/assets/bonusbridge-login-logo.png";
import bbNameLogo        from "@/assets/bbname.png";
import landingBg         from "@/assets/landing-bg.jpg";

const CSS_FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&display=swap');
`;

const LANGS = [
  { code: "en", flag: "🇬🇧", name: "English",    active: true  },
  { code: "de", flag: "🇩🇪", name: "Deutsch",    active: false },
  { code: "fr", flag: "🇫🇷", name: "Français",   active: false },
  { code: "nl", flag: "🇳🇱", name: "Nederlands", active: false },
  { code: "es", flag: "🇪🇸", name: "Español",    active: false },
  { code: "sv", flag: "🇸🇪", name: "Svenska",    active: false },
];

// ── Language dropdown ─────────────────────────────────────────────────────────
function LanguageDropdown() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          fontSize: "13px", fontWeight: 500, color: "#1a3a6e",
          background: "none", border: "none", cursor: "pointer",
          padding: "5px 10px", borderRadius: "8px",
          transition: "background 0.2s",
          fontFamily: "'DM Sans', sans-serif",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,58,110,0.07)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{ fontSize: "14px" }}>🇬🇧</span>
        <span>EN</span>
        <ChevronDown style={{
          width: "12px", height: "12px", flexShrink: 0,
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }} />
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            width: "172px", borderRadius: "12px", overflow: "hidden",
            zIndex: 50, background: "white",
            border: "1px solid rgba(26,58,110,0.12)",
            boxShadow: "0 12px 40px rgba(26,58,110,0.12)",
          }}>
            {LANGS.map((lang) => (
              <button
                key={lang.code}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                  color: lang.active ? "#0d9488" : "#94a3b8",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "12px", fontWeight: lang.active ? 600 : 400,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,58,110,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                onClick={() => {
                  if (!lang.active) toast.info(`${lang.name} — coming soon`);
                  setOpen(false);
                }}
              >
                <span style={{ fontSize: "15px", lineHeight: 1 }}>{lang.flag}</span>
                <span style={{ flex: 1 }}>{lang.name}</span>
                {lang.active  && <span style={{ color: "#0d9488",  fontSize: "10px" }}>✓</span>}
                {!lang.active && <span style={{ color: "#cbd5e1",  fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Soon</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Route ─────────────────────────────────────────────────────────────────────
type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});

// ── Main component ────────────────────────────────────────────────────────────
function LoginPage() {
  const { session, ready: authReady, loading: authLoading, roles, signIn, devPreviewSignIn } = useAuth();
  const { entity_id, loading: entityLoading } = useEntity();
  const { isMaster, masterSignIn } = useMasterAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (isMaster) { navigate({ to: "/master", replace: true }); }
  }, [isMaster, navigate]);

  useEffect(() => {
    if (isMaster || !authReady || authLoading || entityLoading || !session) return;
    if (search.redirect) { navigate({ to: search.redirect, replace: true }); return; }
    if (roles.includes("hr_rep") && !entity_id) { navigate({ to: "/register-entity", replace: true }); return; }
    navigate({ to: "/dashboard", replace: true });
  }, [isMaster, authReady, authLoading, entityLoading, session, roles, entity_id, navigate, search.redirect]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (masterSignIn(email, password)) {
      setSubmitting(false);
      navigate({ to: "/master", replace: true });
      return;
    }
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
    <div
      style={{
        fontFamily: "'DM Sans', sans-serif",
        minHeight: "100vh",
        backgroundImage: `url(${landingBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS_FONTS }} />

      {/* ── HEADER ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "64px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 36px",
        background: "rgba(255,255,255,0.84)",
        backdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(26,58,110,0.08)",
        boxShadow: "0 1px 20px rgba(26,58,110,0.07)",
      }}>
        {/* Left: icon + name */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src={bonusbridgeIcon}
            alt="BonusBridge icon"
            style={{ height: "34px", width: "auto" }}
          />
          <img
            src={bbNameLogo}
            alt="BonusBridge"
            style={{ height: "22px", width: "auto", marginTop: "1px" }}
          />
        </div>

        {/* Right: nav + language */}
        <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {[
            { label: "About",   href: "/about"   },
            { label: "FAQs",    href: "/faqs"    },
            { label: "Support", href: "/support" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              style={{
                fontSize: "13px", fontWeight: 500, color: "#1a3a6e",
                textDecoration: "none",
                padding: "5px 12px", borderRadius: "8px",
                transition: "background 0.2s, color 0.2s",
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(26,58,110,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "none";
              }}
            >
              {label}
            </a>
          ))}
          <LanguageDropdown />
        </nav>
      </header>

      {/* ── MAIN SPLIT ── */}
      <div style={{ display: "flex", height: "100vh", paddingTop: "64px" }}>

        {/* ── LEFT 58% — branding over the 3D chart ── */}
        <div
          className="hidden lg:flex"
          style={{
            width: "58%",
            flexDirection: "column" as const,
            alignItems: "flex-start",
            justifyContent: "flex-start",
            padding: "10vh 48px 0 7%",
          }}
        >
          {/* Bridge icon + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "18px" }}>
            <img
              src={bonusbridgeIcon}
              alt="BonusBridge"
              style={{
                height: "64px", width: "auto",
                filter: "drop-shadow(0 4px 14px rgba(26,58,110,0.16))",
              }}
            />
            <img
              src={bbNameLogo}
              alt="BonusBridge"
              style={{
                height: "50px", width: "auto",
                filter: "drop-shadow(0 2px 6px rgba(26,58,110,0.1))",
              }}
            />
          </div>

          {/* Tagline */}
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "16px", fontWeight: 400,
            color: "#2a4f7c",
            letterSpacing: "0.015em",
            margin: 0, lineHeight: 1.5,
          }}>
            Connecting performance to rewards
          </p>
        </div>

        {/* ── RIGHT 42% — login card ── */}
        <div
          className="w-full lg:w-[42%]"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 40px",
          }}
        >
          <div style={{
            width: "100%", maxWidth: "388px",
            background: "rgba(255,255,255,0.97)",
            border: "1px solid rgba(26,58,110,0.08)",
            borderRadius: "22px",
            padding: "38px 34px 34px",
            boxShadow:
              "0 24px 64px rgba(26,58,110,0.11)," +
              "0 6px 24px rgba(26,58,110,0.07)," +
              "0 1px 4px rgba(26,58,110,0.04)",
          }}>

            {/* Panel header: sub-logo + name */}
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", marginBottom: "30px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <img
                  src={bonusbridgeLoginLogo}
                  alt="BonusBridge"
                  style={{ height: "40px", width: "auto" }}
                />
                <img
                  src={bbNameLogo}
                  alt="BonusBridge"
                  style={{ height: "30px", width: "auto" }}
                />
              </div>
              <p style={{
                fontSize: "9.5px", fontWeight: 500,
                letterSpacing: "0.2em", textTransform: "uppercase" as const,
                color: "rgba(26,58,110,0.38)",
                fontFamily: "'DM Sans', sans-serif",
                margin: 0,
              }}>
                Connecting performance to rewards
              </p>
            </div>

            {/* Login form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column" as const, gap: "10px" }}>

              <Input
                type="email"
                autoComplete="email"
                placeholder="E-mail"
                aria-label="E-mail"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-2xl h-11 text-center"
                style={{
                  background: "#f4f8ff",
                  border: "1.5px solid rgba(26,58,110,0.15)",
                  color: "#1a3a6e",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "14px",
                }}
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
                  className="rounded-2xl h-11 text-center"
                  style={{
                    background: "#f4f8ff",
                    border: "1.5px solid rgba(26,58,110,0.15)",
                    color: "#1a3a6e",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "14px",
                  }}
                />
                <button
                  type="button"
                  style={{
                    marginTop: "5px", width: "100%",
                    textAlign: "right" as const,
                    fontSize: "11px",
                    color: "rgba(26,58,110,0.4)",
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#0d9488"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(26,58,110,0.4)"; }}
                  onClick={() => toast.info("Contact your administrator to reset your password.")}
                >
                  Forgot my password
                </button>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl h-11 font-semibold text-sm"
                style={{
                  background: bothFilled
                    ? "linear-gradient(135deg, #1a3a6e 0%, #0d9488 100%)"
                    : "rgba(26,58,110,0.06)",
                  border: bothFilled ? "none" : "1.5px solid rgba(26,58,110,0.15)",
                  color: bothFilled ? "white" : "rgba(26,58,110,0.32)",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.3s ease",
                  boxShadow: bothFilled
                    ? "0 8px 26px rgba(13,148,136,0.28), 0 2px 8px rgba(26,58,110,0.2)"
                    : "none",
                }}
              >
                {submitting ? "Signing in…" : bothFilled ? "Push to Bonus" : "Register"}
              </Button>
            </form>

            {/* Dev preview */}
            <div style={{ marginTop: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <div style={{ flex: 1, height: "1px", background: "rgba(26,58,110,0.1)" }} />
                <span style={{
                  fontSize: "9px", textTransform: "uppercase" as const,
                  letterSpacing: "0.14em",
                  color: "rgba(26,58,110,0.32)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Dev preview
                </span>
                <div style={{ flex: 1, height: "1px", background: "rgba(26,58,110,0.1)" }} />
              </div>

              <div style={{
                borderRadius: "12px",
                border: "1px dashed rgba(26,58,110,0.16)",
                background: "rgba(26,58,110,0.025)",
                padding: "10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <Sparkles style={{ height: "11px", width: "11px", color: "rgba(13,148,136,0.6)" }} />
                  <span style={{
                    fontSize: "10px",
                    color: "rgba(26,58,110,0.38)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Skip auth · sign in as a role
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {(["ceo", "hr_rep", "manager", "employee"] as const).map((role) => (
                    <Button
                      key={role}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg text-xs h-7 capitalize"
                      style={{
                        background: "rgba(26,58,110,0.04)",
                        border: "1px solid rgba(26,58,110,0.12)",
                        color: "rgba(26,58,110,0.6)",
                        fontFamily: "'DM Sans', sans-serif",
                      }}
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
