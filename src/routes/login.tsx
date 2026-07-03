import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronDown, Sparkles } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { useMasterAuth } from "@/contexts/MasterAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import bonusbridgeIcon from "@/assets/bonusbridge-icon.png";
import bbNameLogo from "@/assets/bbname.png";
import bonusbridgeLoginLogo from "@/assets/bonusbridge-login-logo.png";

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
                {lang.active  && <span style={{ color: "#0d9488", fontSize: "10px" }}>✓</span>}
                {!lang.active && <span style={{ color: "#cbd5e1", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Soon</span>}
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
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      minHeight: "100vh",
      background: [
        "radial-gradient(circle at 72% 45%, rgba(255,255,255,0.72) 0%, rgba(222,241,248,0.45) 36%, transparent 64%)",
        "linear-gradient(135deg, #eef9fc 0%, #dff1f7 45%, #eaf7fb 100%)",
      ].join(", "),
      overflow: "hidden",
    }}>
      <style dangerouslySetInnerHTML={{ __html: CSS_FONTS }} />

      {/* ── HEADER ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "64px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px",
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(16px) saturate(1.4)",
        borderBottom: "1px solid rgba(26,58,110,0.06)",
        boxShadow: "0 1px 16px rgba(26,58,110,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src={bbNameLogo} alt="BonusBridge" style={{ height: "22px", width: "auto" }} />
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {([
            { label: "About",   href: "/about"   },
            { label: "FAQs",    href: "/faqs"    },
            { label: "Support", href: "/support" },
          ] as { label: string; href: string }[]).map(({ label, href }) => (
            <a
              key={href} href={href}
              style={{
                fontSize: "13px", fontWeight: 500, color: "#1a3a6e",
                textDecoration: "none", padding: "5px 14px", borderRadius: "8px",
                transition: "background 0.2s",
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(26,58,110,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "none"; }}
            >
              {label}
            </a>
          ))}
          <LanguageDropdown />
        </nav>
      </header>

      {/* ── MAIN ── */}
      <div style={{
        position: "relative",
        display: "flex",
        height: "100vh",
        paddingTop: "64px",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "64px 16px 16px",
      }}>

{/* ── Background logo image — full-width, behind the card ── */}
<img
  src={bonusbridgeLoginLogo}
  alt=""
  aria-hidden="true"
  style={{
    position: "fixed",

    // залепена лево, десно и долу
    left: 0,
    top: 3,
    // end-to-end хоризонтално
    width: "125vw",
    height: "auto",

    maxWidth: "none",

    transform: "translateX(-10%)",


    // важно: не ја сечи сликата
    objectFit: "contain",
    objectPosition: "center bottom",

    // нема scale, затоа што scale ти ја крева/сече сликата
    // transform: "none",

    opacity: 0.16,
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 0,
  }}
/>

        {/* ── Centered login card ── */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            width: "100%",
            maxWidth: "480px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: "480px",
            minHeight: "620px",
            background: "#ffffff",
            border: "1px solid rgba(26,58,110,0.08)",
            borderRadius: "28px",
            padding: "60px 60px 52px",
            boxShadow: "0 28px 80px rgba(15,45,75,0.13), 0 8px 24px rgba(15,45,75,0.07)",
            display: "flex",
            flexDirection: "column",
          }}>

            {/* panel header */}
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", marginBottom: "38px",
            }}>
              <img
                src={bonusbridgeIcon}
                alt="BonusBridge"
                style={{ height: "64px", width: "auto", marginBottom: "16px" }}
              />
              <p style={{
                fontSize: "18px", fontWeight: 700,
                color: "#1a2a45",
                fontFamily: "'DM Sans', sans-serif",
                margin: 0, textAlign: "center", lineHeight: 1.35,
              }}>
                Connecting performance to rewards
              </p>
            </div>

            {/* login form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="E-mail"
                aria-label="E-mail"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-full h-14 text-center"
                style={{
                  background: "rgba(245,249,255,0.9)",
                  border: "1.5px solid rgba(26,58,110,0.14)",
                  color: "#1a3a6e",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "15px",
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
                  className="rounded-full h-14 text-center"
                  style={{
                    background: "rgba(245,249,255,0.9)",
                    border: "1.5px solid rgba(26,58,110,0.14)",
                    color: "#1a3a6e",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "15px",
                  }}
                />
                <button
                  type="button"
                  style={{
                    marginTop: "6px", width: "100%",
                    textAlign: "right",
                    fontSize: "12px",
                    color: "rgba(26,58,110,0.42)",
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#0d9488"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(26,58,110,0.42)"; }}
                  onClick={() => toast.info("Contact your administrator to reset your password.")}
                >
                  Forgot my password
                </button>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full h-14 font-semibold text-base"
                style={{
                  background: bothFilled
                    ? "linear-gradient(135deg, #1a3a6e 0%, #0d9488 100%)"
                    : "rgba(26,58,110,0.06)",
                  border: bothFilled ? "none" : "1.5px solid rgba(26,58,110,0.14)",
                  color: bothFilled ? "white" : "rgba(26,58,110,0.32)",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.3s ease",
                  boxShadow: bothFilled
                    ? "0 8px 26px rgba(13,148,136,0.28), 0 2px 8px rgba(26,58,110,0.18)"
                    : "none",
                }}
              >
                {submitting ? "Signing in…" : bothFilled ? "Push to Bonus" : "Register"}
              </Button>
            </form>

            {/* dev preview */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <div style={{ flex: 1, height: "1px", background: "rgba(26,58,110,0.09)" }} />
                <span style={{
                  fontSize: "9px", textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(26,58,110,0.32)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Dev preview
                </span>
                <div style={{ flex: 1, height: "1px", background: "rgba(26,58,110,0.09)" }} />
              </div>

              <div style={{
                borderRadius: "16px",
                border: "1px dashed rgba(26,58,110,0.14)",
                background: "rgba(26,58,110,0.02)",
                padding: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                  <Sparkles style={{ height: "11px", width: "11px", color: "rgba(13,148,136,0.6)" }} />
                  <span style={{
                    fontSize: "11px",
                    color: "rgba(26,58,110,0.38)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Skip auth · sign in as a role
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(["ceo", "hr_rep", "manager", "employee"] as const).map((role) => (
                    <Button
                      key={role}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-sm h-11 capitalize"
                      style={{
                        background: "rgba(255,255,255,0.9)",
                        border: "1.5px solid rgba(26,58,110,0.14)",
                        color: "rgba(26,58,110,0.75)",
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 500,
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
