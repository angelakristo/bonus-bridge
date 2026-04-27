import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Sparkles, Globe, ChevronDown } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useEntity } from "@/contexts/EntityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import bonusbridgeFull from "@/assets/bonusbridge-full.png";
import bonusbridgeLogo from "@/assets/bonusbridge-login-logo.png";

// ── CSS animations + Google Fonts ─────────────────────────────────────────────
const CSS_ANIMS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&display=swap');

/* Packet slides from off-screen left into building entrance */
@keyframes bb-packet-move {
  0%   { opacity: 0; transform: translateX(0px); }
  8%   { opacity: 1; transform: translateX(0px); }
  45%  { opacity: 1; transform: translateX(115px); }
  55%  { opacity: 0; transform: translateX(135px); }
  100% { opacity: 0; transform: translateX(0px); }
}

/* Coin emerges from right side of building then slides and fades */
@keyframes bb-coin-move {
  0%,50% { opacity: 0; transform: translateX(0px) translateY(0px) scale(0.5); }
  57%    { opacity: 1; transform: translateX(0px) translateY(-10px) scale(1); }
  80%    { opacity: 1; transform: translateX(88px) translateY(-24px) scale(1); }
  93%    { opacity: 0; transform: translateX(112px) translateY(-30px) scale(0.85); }
  100%   { opacity: 0; transform: translateX(0px) translateY(0px) scale(0.5); }
}

/* Logo gently bobs with 3D tilt */
@keyframes bb-logo-bob {
  0%,100% { transform: perspective(700px) rotateX(0deg)  translateY(0px);  }
  50%     { transform: perspective(700px) rotateX(3deg)  translateY(-8px); }
}

/* Fade-up entrance */
@keyframes bb-fade-in-up {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0px);  }
}

/* Windows on building pulse with cyan glow */
@keyframes bb-window-pulse {
  0%,100% { box-shadow: 0 0 5px rgba(6,182,212,0.45), inset 0 0 3px rgba(6,182,212,0.15); }
  50%     { box-shadow: 0 0 13px rgba(6,182,212,0.9), inset 0 0 7px rgba(6,182,212,0.45); }
}

/* Ground line breathes */
@keyframes bb-glow-pulse {
  0%,100% { opacity: 0.25; }
  50%     { opacity: 0.75; }
}
`;

// ── Languages ─────────────────────────────────────────────────────────────────
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
          display: "flex", alignItems: "center", gap: "6px",
          fontSize: "13px", fontWeight: 500,
          color: "rgba(148,163,184,0.85)",
          background: "none", border: "none", cursor: "pointer",
          padding: "5px 8px", borderRadius: "8px",
          transition: "background 0.2s, color 0.2s",
          fontFamily: "'DM Sans', sans-serif",
        }}
        onMouseEnter={(e) => {
          const t = e.currentTarget;
          t.style.background = "rgba(255,255,255,0.06)";
          t.style.color = "white";
        }}
        onMouseLeave={(e) => {
          const t = e.currentTarget;
          t.style.background = "none";
          t.style.color = "rgba(148,163,184,0.85)";
        }}
      >
        <Globe style={{ width: "14px", height: "14px", flexShrink: 0 }} />
        <span>🇬🇧 EN</span>
        <ChevronDown style={{
          width: "12px", height: "12px", flexShrink: 0,
          transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.2s",
        }} />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            width: "172px", borderRadius: "12px", overflow: "hidden",
            zIndex: 50,
            background: "rgba(6,10,24,0.97)",
            border: "1px solid rgba(6,182,212,0.18)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)",
          }}>
            {LANGS.map((lang) => (
              <button
                key={lang.code}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                  color: lang.active ? "#06b6d4" : "rgba(148,163,184,0.55)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "12px", fontWeight: lang.active ? 600 : 400,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget).style.background = "rgba(6,182,212,0.07)"; }}
                onMouseLeave={(e) => { (e.currentTarget).style.background = "none"; }}
                onClick={() => {
                  if (!lang.active) toast.info(`${lang.name} — coming soon`);
                  setOpen(false);
                }}
              >
                <span style={{ fontSize: "15px", lineHeight: 1, flexShrink: 0 }}>{lang.flag}</span>
                <span style={{ flex: 1 }}>{lang.name}</span>
                {lang.active  && <span style={{ color: "#06b6d4",               fontSize: "10px" }}>✓</span>}
                {!lang.active && <span style={{ color: "rgba(100,116,139,0.5)", fontSize: "8px",  textTransform: "uppercase", letterSpacing: "0.06em" }}>Soon</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── CSS 3D building + animated scene ─────────────────────────────────────────
function IsometricScene() {
  // Three animation pairs with staggered negative delays so there's always action
  const delays = ["0s", "-1s", "-2s"];

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "20px 16px", position: "relative", overflow: "hidden",
    }}>

      {/* Ambient radial glow */}
      <div style={{
        position: "absolute", width: "600px", height: "600px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 65%)",
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        pointerEvents: "none",
      }} />

      {/* BonusBridge logo — 3D bob */}
      <img
        src={bonusbridgeFull}
        alt="BonusBridge"
        style={{
          height: "66px", width: "auto",
          animation: "bb-logo-bob 5s ease-in-out infinite",
          filter: "drop-shadow(0 0 22px rgba(6,182,212,0.42)) drop-shadow(0 5px 14px rgba(0,0,0,0.55))",
          marginBottom: "10px",
        }}
      />

      {/* Tagline */}
      <p style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: "11.5px", fontWeight: 600,
        color: "rgba(6,182,212,0.78)",
        letterSpacing: "0.18em", textTransform: "uppercase",
        marginBottom: "38px",
        animation: "bb-fade-in-up 1.2s ease both",
        animationDelay: "0.5s",
        opacity: 0,
      }}>
        Connecting performance to rewards
      </p>

      {/* ── Scene canvas ── */}
      <div style={{ position: "relative", width: "520px", height: "295px", flexShrink: 0 }}>

        {/* ══ CSS 3D BUILDING ══
            Box: 200 × 150 × 130 px
            Viewing angle: rotateX(-15deg) rotateY(-25deg)
            Reveals: front face, right side face, top face                    */}
        <div style={{
          position: "absolute", left: "158px", top: "28px",
          perspective: "900px", perspectiveOrigin: "50% 50%",
        }}>
          <div style={{
            width: "200px", height: "150px",
            position: "relative",
            transformStyle: "preserve-3d",
            transform: "rotateX(-15deg) rotateY(-25deg)",
          }}>

            {/* FRONT FACE  200 × 150  translateZ(65) */}
            <div style={{
              position: "absolute", left: 0, top: 0,
              width: "200px", height: "150px",
              transform: "translateZ(65px)",
              background: "linear-gradient(175deg, #0e3760 0%, #092540 100%)",
              borderRadius: "4px 4px 0 0",
              overflow: "hidden",
              backfaceVisibility: "hidden",
              display: "flex", flexDirection: "column", padding: "10px 14px 0",
            }}>
              {/* BonusBridge label */}
              <span style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "8.5px", fontWeight: 700,
                color: "#22d3ee", letterSpacing: "0.07em",
                textTransform: "uppercase", marginBottom: "9px",
              }}>
                BonusBridge
              </span>

              {/* Windows */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: "26px", height: "22px",
                    background: "rgba(6,182,212,0.1)",
                    border: "1px solid rgba(6,182,212,0.32)",
                    borderRadius: "3px",
                    animation: "bb-window-pulse 2.8s ease-in-out infinite",
                    animationDelay: `${i * 0.55}s`,
                  }} />
                ))}
              </div>

              {/* Door */}
              <div style={{
                position: "absolute", bottom: 0,
                left: "50%", transform: "translateX(-50%)",
                width: "36px", height: "52px",
                background: "rgba(0,0,0,0.42)",
                border: "1px solid rgba(6,182,212,0.14)",
                borderRadius: "4px 4px 0 0",
              }}>
                <div style={{
                  position: "absolute", right: "7px", top: "50%",
                  transform: "translateY(-50%)",
                  width: "4px", height: "4px", borderRadius: "50%",
                  background: "#06b6d4",
                  boxShadow: "0 0 5px rgba(6,182,212,0.9)",
                }} />
              </div>
            </div>

            {/* RIGHT SIDE FACE  130 × 150  rotateY(90deg) translateZ(100) */}
            <div style={{
              position: "absolute",
              left: "35px",   /* (200-130)/2 = 35  — centres element horizontally */
              top: 0,
              width: "130px", height: "150px",
              transform: "rotateY(90deg) translateZ(100px)",
              background: "linear-gradient(175deg, #04192d 0%, #021220 100%)",
              borderRadius: "0 4px 0 0",
              backfaceVisibility: "hidden",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage: "repeating-linear-gradient(180deg, transparent, transparent 22px, rgba(6,182,212,0.04) 22px, rgba(6,182,212,0.04) 23px)",
              }} />
            </div>

            {/* TOP FACE  200 × 130  rotateX(90deg) translateZ(75) */}
            <div style={{
              position: "absolute",
              left: 0,
              top: "10px",   /* (150-130)/2 = 10  — centres element vertically */
              width: "200px", height: "130px",
              transform: "rotateX(90deg) translateZ(75px)",
              background: "linear-gradient(135deg, #175775 0%, #0b3a55 100%)",
              borderRadius: "4px",
              backfaceVisibility: "hidden",
            }}>
              {/* Roof grid */}
              <div style={{
                position: "absolute", inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(6,182,212,0.07) 18px, rgba(6,182,212,0.07) 19px), " +
                  "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(6,182,212,0.07) 18px, rgba(6,182,212,0.07) 19px)",
              }} />
            </div>

          </div>
        </div>

        {/* ══ KPI PACKET BOXES (3 staggered) ══ */}
        {delays.map((delay, i) => (
          <div
            key={`pkt-${i}`}
            style={{
              position: "absolute", left: "28px", top: "152px",
              animation: "bb-packet-move 3s ease-in-out infinite",
              animationDelay: delay,
              opacity: 0,
            }}
          >
            {/* Mini CSS 3D cube */}
            <div style={{ position: "relative", width: "48px", height: "44px", perspective: "110px" }}>
              <div style={{
                width: "36px", height: "30px",
                position: "relative", transformStyle: "preserve-3d",
                transform: "rotateX(-12deg) rotateY(-18deg)",
              }}>
                {/* Cube front */}
                <div style={{
                  position: "absolute", width: "36px", height: "30px",
                  transform: "translateZ(8px)",
                  background: "linear-gradient(135deg, #0891b2, #0e7490)",
                  borderRadius: "2px",
                  border: "1px solid rgba(6,182,212,0.38)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backfaceVisibility: "hidden",
                }}>
                  <span style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: "4.5px", fontWeight: 700, color: "white",
                    letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.4,
                  }}>KPI<br />PACKET</span>
                </div>
                {/* Cube right */}
                <div style={{
                  position: "absolute",
                  left: "10px",  /* (36-16)/2 */
                  top: 0,
                  width: "16px", height: "30px",
                  transform: "rotateY(90deg) translateZ(18px)",
                  background: "#055f78",
                  borderRadius: "0 2px 2px 0",
                  backfaceVisibility: "hidden",
                }} />
                {/* Cube top */}
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: "7px",  /* (30-16)/2 */
                  width: "36px", height: "16px",
                  transform: "rotateX(90deg) translateZ(15px)",
                  background: "#0ea5e9",
                  borderRadius: "2px 2px 0 0",
                  backfaceVisibility: "hidden",
                }} />
              </div>
            </div>
          </div>
        ))}

        {/* ══ EURO COINS (3 staggered, locked to same delays as packets) ══ */}
        {delays.map((delay, i) => (
          <div
            key={`coin-${i}`}
            style={{
              position: "absolute", left: "368px", top: "115px",
              animation: "bb-coin-move 3s ease-in-out infinite",
              animationDelay: delay,
              opacity: 0,
            }}
          >
            <div style={{
              width: "34px", height: "34px", borderRadius: "50%",
              background: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
              border: "2px solid rgba(255,255,255,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow:
                "0 4px 16px rgba(6,182,212,0.5), " +
                "0 0 0 1px rgba(6,182,212,0.18), " +
                "inset 0 1px 0 rgba(255,255,255,0.18)",
            }}>
              <span style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "15px", fontWeight: 700, color: "white", lineHeight: 1,
                textShadow: "0 1px 3px rgba(0,0,0,0.35)",
              }}>€</span>
            </div>
          </div>
        ))}

        {/* ══ OFFICE DESK ══ */}
        <div style={{ position: "absolute", left: "16px", bottom: "22px", width: "132px", height: "98px" }}>
          {/* Monitor */}
          <div style={{
            position: "absolute", bottom: "48px", left: "40px",
            width: "46px", height: "33px",
            background: "#080f1e",
            border: "2px solid #0ea5e9",
            borderRadius: "3px",
            boxShadow: "0 0 14px rgba(14,165,233,0.32)",
            overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", inset: "2px",
              background: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #10b981 100%)",
              opacity: 0.55, borderRadius: "1px",
            }} />
          </div>
          {/* Monitor neck */}
          <div style={{
            position: "absolute", bottom: "43px", left: "60px",
            width: "6px", height: "5px", background: "#374151",
          }} />
          {/* Desk surface */}
          <div style={{
            position: "absolute", bottom: "37px", left: 0,
            width: "132px", height: "9px",
            background: "linear-gradient(180deg, #1e2a3a, #141e2f)",
            borderRadius: "3px 3px 0 0",
            boxShadow: "0 5px 14px rgba(0,0,0,0.45)",
          }} />
          {/* Legs */}
          <div style={{ position: "absolute", bottom: 0, left: "10px",  width: "7px", height: "37px", background: "#2d3d52", borderRadius: "2px" }} />
          <div style={{ position: "absolute", bottom: 0, left: "115px", width: "7px", height: "37px", background: "#2d3d52", borderRadius: "2px" }} />
        </div>

        {/* ══ OFFICE CHAIR ══ */}
        <div style={{ position: "absolute", left: "130px", bottom: "0px", width: "68px", height: "98px" }}>
          {/* Backrest */}
          <div style={{
            position: "absolute", bottom: "41px", left: "14px",
            width: "34px", height: "40px",
            background: "linear-gradient(175deg, #104e4a, #0c3d3a)",
            borderRadius: "4px 4px 0 0",
            border: "1px solid rgba(20,184,166,0.28)",
          }} />
          {/* Seat */}
          <div style={{
            position: "absolute", bottom: "34px", left: "6px",
            width: "52px", height: "12px",
            background: "#134e4a",
            borderRadius: "4px",
            boxShadow: "0 4px 8px rgba(0,0,0,0.35)",
          }} />
          {/* Legs */}
          <div style={{ position: "absolute", bottom: 0, left: "7px",  width: "5px", height: "34px", background: "#3d4f61", borderRadius: "2px" }} />
          <div style={{ position: "absolute", bottom: 0, left: "56px", width: "5px", height: "34px", background: "#3d4f61", borderRadius: "2px" }} />
          {/* Cross base */}
          <div style={{ position: "absolute", bottom: "8px", left: "1px", width: "66px", height: "4px", background: "#2d3d52", borderRadius: "2px" }} />
        </div>

        {/* Ground glow line */}
        <div style={{
          position: "absolute", bottom: "20px", left: "8px", right: "8px",
          height: "2px",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.2) 20%, rgba(6,182,212,0.55) 50%, rgba(6,182,212,0.2) 80%, transparent 100%)",
          animation: "bb-glow-pulse 3s ease-in-out infinite",
        }} />

      </div>
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
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

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
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: "linear-gradient(140deg, #05080f 0%, #090f1e 50%, #050c17 100%)",
      minHeight: "100vh",
    }}>
      <style dangerouslySetInnerHTML={{ __html: CSS_ANIMS }} />

      {/* ── HEADER ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        height: "60px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
        background: "rgba(3,6,16,0.88)",
        backdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid rgba(6,182,212,0.09)",
      }}>
        <img src={bonusbridgeFull} alt="BonusBridge" style={{ height: "30px", width: "auto" }} />

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
                fontSize: "13px", fontWeight: 500,
                color: "rgba(148,163,184,0.8)",
                textDecoration: "none",
                padding: "5px 11px", borderRadius: "8px",
                transition: "background 0.2s, color 0.2s",
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#06b6d4";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(6,182,212,0.07)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.8)";
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
      <div style={{ display: "flex", height: "100vh", paddingTop: "60px" }}>

        {/* LEFT 60% — 3D scene (desktop only) */}
        <div
          className="hidden lg:flex"
          style={{
            width: "60%",
            flexDirection: "column" as const,
            background: "linear-gradient(155deg, #070c1b 0%, #0b192e 55%, #060d1b 100%)",
            borderRight: "1px solid rgba(6,182,212,0.07)",
            position: "relative" as const,
            overflow: "hidden",
          }}
        >
          {/* Mesh gradient depth layer */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "radial-gradient(ellipse 55% 45% at 42% 58%, rgba(6,182,212,0.055) 0%, transparent 100%), " +
              "radial-gradient(ellipse 38% 40% at 68% 28%, rgba(14,165,233,0.04) 0%, transparent 100%)",
          }} />
          <IsometricScene />
        </div>

        {/* RIGHT 40% — glass-card login panel */}
        <div
          className="w-full lg:w-[40%]"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div style={{
            width: "100%", maxWidth: "380px",
            background: "rgba(255,255,255,0.032)",
            backdropFilter: "blur(28px) saturate(1.2)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "24px",
            padding: "36px 32px",
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.55), " +
              "0 0 0 1px rgba(6,182,212,0.04), " +
              "inset 0 1px 0 rgba(255,255,255,0.05)",
            animation: "bb-fade-in-up 0.9s ease both",
            animationDelay: "0.1s",
            opacity: 0,
          }}>

            {/* Logo + subtitle */}
            <div style={{ textAlign: "center" as const, marginBottom: "28px" }}>
              <img
                src={bonusbridgeLogo}
                alt="BonusBridge"
                style={{ height: "52px", width: "auto", marginBottom: "10px" }}
              />
              <p style={{
                fontSize: "9.5px", fontWeight: 500,
                letterSpacing: "0.2em", textTransform: "uppercase" as const,
                color: "rgba(148,163,184,0.45)",
                fontFamily: "'DM Sans', sans-serif",
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
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  color: "white",
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
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    color: "white",
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
                    color: "rgba(148,163,184,0.45)",
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget).style.color = "#06b6d4"; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.color = "rgba(148,163,184,0.45)"; }}
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
                    ? "linear-gradient(135deg, #0284c7, #06b6d4)"
                    : "rgba(255,255,255,0.07)",
                  border: bothFilled ? "none" : "1px solid rgba(255,255,255,0.09)",
                  color: "white",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.3s ease",
                  boxShadow: bothFilled ? "0 8px 26px rgba(6,182,212,0.28)" : "none",
                }}
              >
                {submitting ? "Signing in…" : bothFilled ? "Push to Bonus" : "Register"}
              </Button>
            </form>

            {/* Dev preview — preserved exactly */}
            <div style={{ marginTop: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.07)" }} />
                <span style={{
                  fontSize: "9px", textTransform: "uppercase" as const,
                  letterSpacing: "0.14em",
                  color: "rgba(148,163,184,0.32)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Dev preview
                </span>
                <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.07)" }} />
              </div>

              <div style={{
                borderRadius: "12px",
                border: "1px dashed rgba(6,182,212,0.17)",
                background: "rgba(6,182,212,0.022)",
                padding: "10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <Sparkles style={{ height: "11px", width: "11px", color: "rgba(6,182,212,0.55)" }} />
                  <span style={{
                    fontSize: "10px",
                    color: "rgba(148,163,184,0.33)",
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
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(148,163,184,0.65)",
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
