"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

type Step = "choose" | "first-login" | "login" | "success";

export default function ParentLoginPage() {
  const router = useRouter();
  const [step, setStep]         = useState<Step>("choose");
  const [phone, setPhone]       = useState("");
  const [dob, setDob]           = useState("");
  const [last4, setLast4]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState<any>(null);

  const inp    = "w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all";
  const inpS   = { borderColor:"#EDE8DF", background:"#FAF0E8", fontFamily:"'Quicksand',sans-serif" };
  const inpCls = `${inp} focus:ring-teal-400`;

  const call = async (action: string, extra: any = {}) => {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/auth/parent-login", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ phone, dob, last4, password, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong");
        if (data.alreadySetup) setStep("login");
        if (data.needsSetup)   setStep("first-login");
      } else {
        setResult(data);
        localStorage.removeItem("ep_teacher_session");
        localStorage.setItem("ep_parent_session", JSON.stringify({
          phone, childName: data.childName || "", loginTime: Date.now(), firstLogin: data.firstLogin || false,
          // On the default password after first-login, or whatever the login API reports.
          isDefaultPassword: data.isDefaultPassword ?? data.firstLogin ?? false,
        }));
        setStep("success");
        if (data.waUrl) setTimeout(() => window.open(data.waUrl, "_blank"), 500);
        setTimeout(() => router.push("/parent-dashboard"), 1500);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#FEFCF8", fontFamily:"'Quicksand',sans-serif", display:"flex", flexDirection:"column" }}>

      {/* ── PARENT PORTAL HEADER — contains Welcome Back section ── */}
      <div style={{ background:"linear-gradient(135deg,#178F78,#0f6b5a)", padding:"32px 20px 28px" }}>
        <div style={{ maxWidth:"480px", margin:"0 auto" }}>

          {/* Welcome Back — always shown in header */}
          <div style={{ marginBottom:"4px" }}>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.2rem", fontWeight:700, color:"white", marginBottom:"4px" }}>Welcome Back!</div>
            <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.75)", marginBottom:"16px" }}>How would you like to log in?</div>

            {/* Two options side by side */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
              <button onClick={() => { setStep("first-login"); setError(""); }}
                style={{ padding:"14px 10px", borderRadius:"16px", border: step === "first-login" ? "2px solid white" : "2px solid rgba(255,255,255,0.4)", background:"white", cursor:"pointer", textAlign:"center", transition:"all 0.2s", boxShadow: step === "first-login" ? "0 0 0 3px rgba(255,255,255,0.4)" : "none" }}>
                <div style={{ fontSize:"22px", marginBottom:"6px" }}>🆕</div>
                <div style={{ fontWeight:700, color:"#178F78", fontSize:"13px", marginBottom:"2px" }}>First Time</div>
                <div style={{ fontSize:"10px", color:"#6B7A99" }}>Set up your account</div>
              </button>

              <button onClick={() => { setStep("login"); setError(""); }}
                style={{ padding:"14px 10px", borderRadius:"16px", border: step === "login" ? "2px solid white" : "2px solid rgba(255,255,255,0.4)", background:"white", cursor:"pointer", textAlign:"center", transition:"all 0.2s", boxShadow: step === "login" ? "0 0 0 3px rgba(255,255,255,0.4)" : "none" }}>
                <div style={{ fontSize:"22px", marginBottom:"6px" }}>🔐</div>
                <div style={{ fontWeight:700, color:"#178F78", fontSize:"13px", marginBottom:"2px" }}>Login</div>
                <div style={{ fontSize:"10px", color:"#6B7A99" }}>Use your password</div>
              </button>
            </div>

            <div style={{ textAlign:"center", marginTop:"14px", fontSize:"15px", color:"rgba(255,255,255,0.85)" }}>
              New here?{" "}
              <Link href="/enquiry" style={{ color:"white", fontWeight:700 }}>Submit an enquiry first →</Link>
            </div>
          </div>

        </div>
      </div>

      {/* ── FORMS + FEATURES ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px 32px" }}>
        <div style={{ width:"100%", maxWidth:"400px" }}>

          {/* ── FIRST TIME LOGIN ── */}
          {step === "first-login" && (
            <div style={{ background:"white", borderRadius:"24px", border:"1px solid #EDE8DF", padding:"28px", boxShadow:"0 4px 20px rgba(0,0,0,0.06)", marginBottom:"24px" }}>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.3rem", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>First Time Setup</div>
              <p style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"20px" }}>Verify your identity to create your password</p>

              <div style={{ marginBottom:"14px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6B7A99", display:"block", marginBottom:"6px" }}>Phone Number (WhatsApp) *</label>
                <div style={{ display:"flex", gap:"8px" }}>
                  <div style={{ background:"#FAF0E8", border:"1px solid #EDE8DF", borderRadius:"12px", padding:"0 12px", display:"flex", alignItems:"center", flexShrink:0 }}>
                    <span style={{ fontSize:"12px", color:"#6B7A99" }}>🇮🇳 +91</span>
                  </div>
                  <input className={inpCls} style={{ ...inpS, flex:1 }} type="tel" placeholder="10-digit number"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} />
                </div>
              </div>

              <div style={{ marginBottom:"14px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6B7A99", display:"block", marginBottom:"6px" }}>Child&apos;s Date of Birth *</label>
                <input className={inpCls} style={inpS} type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={dob} onChange={e => setDob(e.target.value)} />
              </div>

              <div style={{ marginBottom:"20px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6B7A99", display:"block", marginBottom:"6px" }}>Last 4 Digits of Phone *</label>
                <input className={inpCls} style={inpS} type="tel" placeholder="e.g. 4504" maxLength={4}
                  value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g,"").slice(0,4))} />
                <p style={{ fontSize:"10px", color:"#6B7A99", marginTop:"4px" }}>Last 4 digits of the phone number you registered with</p>
              </div>

              {error && (
                <div style={{ background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:"12px", padding:"10px 14px", color:"#DC2626", fontSize:"12px", marginBottom:"14px" }}>{error}</div>
              )}

              <button disabled={loading || !phone || !dob || !last4} onClick={() => call("first-login")}
                style={{ width:"100%", padding:"13px", borderRadius:"20px", background:loading||!phone||!dob||!last4?"#ccc":"#178F78", color:"white", border:"none", fontWeight:700, fontSize:"14px", cursor:loading||!phone||!dob||!last4?"not-allowed":"pointer", boxShadow:"0 5px 16px rgba(23,143,120,0.3)" }}>
                {loading ? "Verifying..." : "Verify & Create Password →"}
              </button>

              <div style={{ textAlign:"center", marginTop:"14px" }}>
                <button onClick={() => { setStep("login"); setError(""); }}
                  style={{ fontSize:"12px", color:"#178F78", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                  Already have a password? Login →
                </button>
              </div>
            </div>
          )}

          {/* ── REGULAR LOGIN ── */}
          {step === "login" && (
            <div style={{ background:"white", borderRadius:"24px", border:"1px solid #EDE8DF", padding:"28px", boxShadow:"0 4px 20px rgba(0,0,0,0.06)", marginBottom:"24px" }}>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.3rem", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>Parent Login</div>
              <p style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"20px" }}>Enter your phone and password</p>

              <div style={{ marginBottom:"14px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6B7A99", display:"block", marginBottom:"6px" }}>Phone Number *</label>
                <div style={{ display:"flex", gap:"8px" }}>
                  <div style={{ background:"#FAF0E8", border:"1px solid #EDE8DF", borderRadius:"12px", padding:"0 12px", display:"flex", alignItems:"center", flexShrink:0 }}>
                    <span style={{ fontSize:"12px", color:"#6B7A99" }}>🇮🇳 +91</span>
                  </div>
                  <input className={inpCls} style={{ ...inpS, flex:1 }} type="tel" placeholder="10-digit number"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} />
                </div>
              </div>

              <div style={{ marginBottom:"8px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" }}>
                  <label style={{ fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#6B7A99" }}>Password *</label>
                  <Link href="/forgot-password?role=parent"
                    style={{ fontSize:"11px", color:"#E8694A", fontWeight:600, textDecoration:"none" }}>
                    Forgot Password?
                  </Link>
                </div>
                <div style={{ position:"relative" }}>
                  <input className={inpCls} style={{ ...inpS, paddingRight:"44px" }}
                    type={showPass ? "text" : "password"} placeholder="Your password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !loading && phone && password && call("login")} />
                  <button onClick={() => setShowPass(!showPass)} type="button"
                    style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#6B7A99" }}>
                    {showPass ? <EyeOff style={{ width:"16px", height:"16px" }} /> : <Eye style={{ width:"16px", height:"16px" }} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:"12px", padding:"10px 14px", color:"#DC2626", fontSize:"12px", marginBottom:"14px", marginTop:"8px" }}>{error}</div>
              )}

              <button disabled={loading || !phone || !password} onClick={() => call("login")}
                style={{ width:"100%", padding:"13px", borderRadius:"20px", background:loading||!phone||!password?"#ccc":"#E8694A", color:"white", border:"none", fontWeight:700, fontSize:"14px", cursor:loading||!phone||!password?"not-allowed":"pointer", boxShadow:"0 5px 16px rgba(232,105,74,0.3)", marginTop:"16px" }}>
                {loading ? "Logging in..." : "Login →"}
              </button>

              <div style={{ textAlign:"center", marginTop:"14px" }}>
                <button onClick={() => { setStep("first-login"); setError(""); }}
                  style={{ fontSize:"12px", color:"#178F78", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                  First time? Set up your account →
                </button>
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === "success" && result && (
            <div style={{ background:"white", borderRadius:"24px", border:"1px solid #EDE8DF", padding:"28px", boxShadow:"0 4px 20px rgba(0,0,0,0.06)", textAlign:"center", marginBottom:"24px" }}>
              <div style={{ width:"60px", height:"60px", borderRadius:"50%", background:"rgba(23,143,120,0.1)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", fontSize:"28px" }}>✅</div>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.5rem", fontWeight:700, color:"#178F78", marginBottom:"6px" }}>
                {result.firstLogin ? "Account Created!" : "Welcome back!"}
              </div>
              <p style={{ fontSize:"13px", color:"#6B7A99", marginBottom:"20px" }}>
                {result.firstLogin
                  ? "Your login credentials have been sent to your WhatsApp!"
                  : `Logged in as ${result.childName ? result.childName + "'s parent" : "Parent"}`}
              </p>

              {result.waUrl && (
                <a href={result.waUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", background:"#25D366", color:"white", borderRadius:"20px", padding:"11px 20px", fontWeight:700, fontSize:"13px", textDecoration:"none", marginBottom:"12px" }}>
                  💬 Open WhatsApp to see your credentials
                </a>
              )}

              <Link href="/parent-dashboard"
                style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", background:"#178F78", color:"white", borderRadius:"20px", padding:"11px 20px", fontWeight:700, fontSize:"13px", textDecoration:"none" }}>
                Go to Dashboard →
              </Link>

              <div style={{ marginTop:"16px", display:"flex", flexDirection:"column", gap:"8px", alignItems:"center" }}>
                <Link href="/forgot-password?role=parent" style={{ fontSize:"12px", color:"#178F78", fontWeight:600 }}>Forgot Password?</Link>
                <Link href="/" style={{ fontSize:"12px", color:"#6B7A99" }}>Back to Home</Link>
              </div>
            </div>
          )}

        </div>

        {/* ── What's in your portal ── */}
        <div style={{ width:"100%", maxWidth:"900px" }}>
          <div style={{ textAlign:"center", fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"#6B7A99", marginBottom:"14px" }}>
            What you get access to
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"14px" }}>
            {[
              { icon:"📸", title:"Class Photos & Videos",   desc:"Daily updates from teachers",     strip:"#BFDBFE" },
              { icon:"📚", title:"Homework & Assignments",  desc:"View, track & submit work",        strip:"#99F6E4" },
              { icon:"🎥", title:"Parent-Teacher Meetings", desc:"Join Google Meet sessions",        strip:"#C4B5FD" },
              { icon:"📋", title:"Fee Receipts & Reports",  desc:"Download invoices & term reports", strip:"#FDE68A" },
            ].map(p => (
              <div key={p.title} style={{ background:"white", borderRadius:"18px", border:"1px solid #EDE8DF", overflow:"hidden" }}>
                <div style={{ height:"5px", background:p.strip }} />
                <div style={{ padding:"22px 18px" }}>
                  <span style={{ fontSize:"34px", display:"block", marginBottom:"14px" }}>{p.icon}</span>
                  <div style={{ fontWeight:700, fontSize:"15px", color:"#1A2F4A", marginBottom:"6px", fontFamily:"'Fredoka',sans-serif" }}>{p.title}</div>
                  <div style={{ fontSize:"12px", color:"#6B7A99", lineHeight:1.5 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
