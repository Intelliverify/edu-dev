"use client";
import { useState } from "react";

// Authenticated "change my password" modal for a logged-in parent.
// Calls POST /api/auth/change-password (gated by the current password).
export default function ChangePasswordModal({
  open, phone, onClose, onSuccess,
}: {
  open: boolean;
  phone?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [done, setDone]       = useState(false);

  if (!open) return null;

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); setError(""); setDone(false); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    setError("");
    if (!current || !next || !confirm) { setError("Please fill in all fields."); return; }
    if (next.length < 8)   { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm)  { setError("New password and confirmation do not match."); return; }
    if (next === current)  { setError("New password must be different from your current password."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Could not change password."); setLoading(false); return; }
      setDone(true);
      setLoading(false);
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const inp = { width:"100%", borderRadius:"12px", border:"1px solid #EDE8DF", padding:"11px 14px", fontSize:"13px", background:"#FAF0E8", color:"#1A2F4A", outline:"none", fontFamily:"'Quicksand',sans-serif", boxSizing:"border-box" as const };
  const lbl = { fontSize:"11px", fontWeight:700, color:"#6B7A99", textTransform:"uppercase" as const, letterSpacing:"0.06em", display:"block", marginBottom:"6px" };

  return (
    <div onClick={close} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", zIndex:1000, fontFamily:"'Quicksand',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:"380px", background:"white", borderRadius:"24px", border:"1px solid #EDE8DF", padding:"24px", boxShadow:"0 10px 40px rgba(0,0,0,0.2)" }}>
        {done ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:"40px", marginBottom:"10px" }}>✅</div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.2rem", fontWeight:700, color:"#178F78", marginBottom:"6px" }}>Password Changed</div>
            <div style={{ fontSize:"13px", color:"#6B7A99", marginBottom:"18px" }}>Your new password is now active. Use it the next time you log in.</div>
            <button onClick={close} style={{ width:"100%", padding:"12px", borderRadius:"16px", background:"#178F78", color:"white", border:"none", fontWeight:700, fontSize:"14px", cursor:"pointer" }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"1.2rem", fontWeight:700, color:"#178F78" }}>Change Password</div>
              <button onClick={close} style={{ background:"none", border:"none", fontSize:"20px", color:"#6B7A99", cursor:"pointer", lineHeight:1 }}>×</button>
            </div>

            <div style={{ marginBottom:"12px" }}>
              <label style={lbl}>Current Password</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} style={inp} placeholder="Your current password" />
            </div>
            <div style={{ marginBottom:"12px" }}>
              <label style={lbl}>New Password</label>
              <input type="password" value={next} onChange={e => setNext(e.target.value)} style={inp} placeholder="At least 8 characters" />
            </div>
            <div style={{ marginBottom:"16px" }}>
              <label style={lbl}>Confirm New Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key==="Enter" && submit()} style={inp} placeholder="Repeat new password" />
            </div>

            {error && <div style={{ background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:"10px", padding:"9px 12px", color:"#DC2626", fontSize:"12px", marginBottom:"14px" }}>{error}</div>}

            <button onClick={submit} disabled={loading} style={{ width:"100%", padding:"12px", borderRadius:"16px", background:loading?"#ccc":"#178F78", color:"white", border:"none", fontWeight:700, fontSize:"14px", cursor:loading?"not-allowed":"pointer" }}>
              {loading ? "Saving…" : "Update Password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
