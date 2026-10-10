"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Step = "phone" | "otp" | "done";

export default function ForgotPasswordContent() {
  const params = useSearchParams();
  const role   = (params.get("role") || "parent") as "parent" | "teacher";

  const [step, setStep]             = useState<Step>("phone");
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(d => { if (d.school?.name) setSchoolName(d.school.name); }).catch(() => {});
  }, []);
  const [phone, setPhone]         = useState("");
  const [otp, setOtp]             = useState("");
  const [newPass, setNewPass]     = useState("");
  const [confirmPass, setConfirm] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [waLink, setWaLink]       = useState("");
  const [otpSent, setOtpSent]     = useState(false);
  const [doneMessage, setDoneMessage] = useState("");

  const isTeacher = role === "teacher";
  const inp = { width:"100%", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.15)", padding:"11px 14px", fontSize:"13px", background:"rgba(255,255,255,0.08)", color:"white", outline:"none", fontFamily:"'Quicksand',sans-serif", boxSizing:"border-box" as const };

  // Everyone verifies via a WhatsApp OTP. Parents then get reset to the default
  // password; teachers choose a new one.
  const checkPhone = async () => {
    if (!phone) return;
    setLoading(true); setError("");
    const res  = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim(), role, checkOnly: true }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error || "Phone not found"); setLoading(false); return; }
    await sendOTP();
  };

  const sendOTP = async () => {
    setLoading(true); setError("");
    const res  = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim(), role }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error); setLoading(false); return; }
    setOtpSent(data.sent === true);
    setWaLink(data.waLink || "");
    setStep("otp");
    setLoading(false);
  };

  const verifyAndReset = async () => {
    let payload: Record<string, unknown>;
    if (isTeacher) {
      if (newPass !== confirmPass) { setError("Passwords don't match"); return; }
      if (newPass.length < 8)      { setError("Password must be at least 8 characters"); return; }
      payload = { phone: phone.trim(), otp, newPassword: newPass, role };
    } else {
      // Parent: reset back to the default password (no new password chosen).
      payload = { phone: phone.trim(), otp, role, resetToDefault: true };
    }
    setLoading(true); setError("");
    const res  = await fetch("/api/auth/verify-otp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error); setLoading(false); return; }
    setDoneMessage(data.message || "Your new password has been set.");
    setStep("done");
    setLoading(false);
  };

  const canSubmitOtp = isTeacher ? (!!otp && !!newPass && !!confirmPass) : !!otp;

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1A2F4A,#0f6b5a)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Quicksand',sans-serif", padding:"20px" }}>
      <div style={{ width:"100%", maxWidth:"380px" }}>
        <div style={{ textAlign:"center", marginBottom:"24px" }}>
          <div style={{ fontSize:"36px", marginBottom:"10px" }}>🔑</div>
          <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.6rem", fontWeight:700, color:"white" }}>Reset Password</div>
          <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.5)", marginTop:"4px" }}>
            {isTeacher ? "Teacher Portal" : "Parent Portal"}{schoolName ? ` — ${schoolName}` : ""}
          </div>
        </div>

        <div style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"24px", padding:"24px" }}>

          {/* Step 1: Phone */}
          {step === "phone" && (
            <>
              <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.7)", marginBottom:"16px" }}>
                Enter your {isTeacher ? "username" : "registered phone number"} and we'll send a one-time code on WhatsApp.
              </div>
              <div style={{ marginBottom:"16px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, color:"rgba(255,255,255,0.55)", textTransform:"uppercase", letterSpacing:"0.07em", display:"block", marginBottom:"6px" }}>
                  {isTeacher ? "Username" : "Phone Number"}
                </label>
                <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key==="Enter" && checkPhone()}
                  style={inp} placeholder={isTeacher ? "e.g. priya" : "10-digit phone number"} />
              </div>
              {error && <div style={{ background:"rgba(220,38,38,0.15)", border:"1px solid rgba(220,38,38,0.3)", borderRadius:"10px", padding:"9px 12px", color:"#FCA5A5", fontSize:"12px", marginBottom:"14px" }}>{error}</div>}
              <button onClick={checkPhone} disabled={loading || !phone}
                style={{ width:"100%", padding:"13px", borderRadius:"16px", background:loading||!phone?"rgba(255,255,255,0.1)":"#178F78", color:"white", border:"none", fontWeight:700, fontSize:"14px", cursor:loading||!phone?"not-allowed":"pointer" }}>
                {loading ? "Sending…" : "Continue →"}
              </button>
            </>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <>
              {otpSent ? (
                <div style={{ background:"rgba(37,211,102,0.12)", border:"1px solid rgba(37,211,102,0.3)", borderRadius:"12px", padding:"11px 14px", color:"#4ade80", fontSize:"13px", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px" }}>
                  ✅ OTP sent to your WhatsApp
                </div>
              ) : waLink ? (
                <a href={waLink} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", background:"#25D366", color:"white", borderRadius:"16px", padding:"12px 20px", fontWeight:700, fontSize:"13px", textDecoration:"none", marginBottom:"16px" }}>
                  💬 Get OTP on WhatsApp
                </a>
              ) : (
                <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.7)", marginBottom:"16px" }}>
                  Enter the OTP sent to your WhatsApp.
                </div>
              )}
              <div style={{ marginBottom:"12px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, color:"rgba(255,255,255,0.55)", textTransform:"uppercase", letterSpacing:"0.07em", display:"block", marginBottom:"6px" }}>Enter OTP</label>
                <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6}
                  onKeyDown={e => e.key==="Enter" && !isTeacher && verifyAndReset()}
                  style={{ ...inp, textAlign:"center", fontSize:"20px", letterSpacing:"8px", fontWeight:700 }} placeholder="000000" />
              </div>

              {isTeacher && (
                <>
                  <div style={{ marginBottom:"12px" }}>
                    <label style={{ fontSize:"11px", fontWeight:700, color:"rgba(255,255,255,0.55)", textTransform:"uppercase", letterSpacing:"0.07em", display:"block", marginBottom:"6px" }}>New Password</label>
                    <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} style={inp} placeholder="Min. 8 characters" />
                  </div>
                  <div style={{ marginBottom:"16px" }}>
                    <label style={{ fontSize:"11px", fontWeight:700, color:"rgba(255,255,255,0.55)", textTransform:"uppercase", letterSpacing:"0.07em", display:"block", marginBottom:"6px" }}>Confirm Password</label>
                    <input type="password" value={confirmPass} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key==="Enter" && verifyAndReset()} style={inp} placeholder="Repeat new password" />
                  </div>
                </>
              )}

              {!isTeacher && (
                <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.6)", lineHeight:1.5, marginBottom:"16px" }}>
                  Your password will be reset to the <strong>default password</strong>
                  {" "}(first letter of your child's name + year of birth + last 4 digits of your phone).
                </div>
              )}

              {error && <div style={{ background:"rgba(220,38,38,0.15)", border:"1px solid rgba(220,38,38,0.3)", borderRadius:"10px", padding:"9px 12px", color:"#FCA5A5", fontSize:"12px", marginBottom:"14px" }}>{error}</div>}
              <button onClick={verifyAndReset} disabled={loading || !canSubmitOtp}
                style={{ width:"100%", padding:"13px", borderRadius:"16px", background:loading||!canSubmitOtp?"rgba(255,255,255,0.1)":"#178F78", color:"white", border:"none", fontWeight:700, fontSize:"14px", cursor:loading||!canSubmitOtp?"not-allowed":"pointer" }}>
                {loading ? "Resetting…" : (isTeacher ? "Reset Password →" : "Reset to Default →")}
              </button>
            </>
          )}

          {/* Done */}
          {step === "done" && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"40px", marginBottom:"12px" }}>✅</div>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.3rem", fontWeight:700, color:"white", marginBottom:"8px" }}>Password Reset!</div>
              <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.75)", lineHeight:1.6, marginBottom:"20px", textAlign:"left", background:"rgba(255,255,255,0.08)", borderRadius:"12px", padding:"14px" }}>
                {doneMessage}
              </div>
              <Link href="/parent-login"
                style={{ display:"block", background:"#178F78", color:"white", borderRadius:"16px", padding:"13px", fontWeight:700, fontSize:"14px", textDecoration:"none" }}>
                Go to Login →
              </Link>
            </div>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:"16px" }}>
          <Link href={isTeacher ? "/teacher-login" : "/parent-login"} style={{ fontSize:"12px", color:"rgba(255,255,255,0.4)" }}>
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
