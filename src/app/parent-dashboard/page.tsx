"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import ParentDocumentsTab from "@/components/ParentDocumentsTab";
import KitChecklist from "@/components/KitChecklist";
import TransportParentView from "@/components/TransportParentView";
import ChildMedicalTab from "@/components/ChildMedicalTab";
import PickupAuthTab from "@/components/PickupAuthTab";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import ReferralTab from "@/components/ReferralTab";
import LeadFollowUpTab from "@/components/LeadFollowUpTab";
import IncidentLog from "@/components/IncidentLog";
import ParentKBChat from "@/components/ParentKBChat";
import AudioPlayer from "@/components/AudioPlayer";
import CommunityTab from "@/components/CommunityTab";
import ReelComposer from "@/components/ReelComposer";
import ParentHomeworkWeb from "@/components/ParentHomeworkWeb";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Razorpay global type ─────────────────────────────────
declare global { interface Window { Razorpay: any; } }

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ── Fee dues component with Razorpay payments ────────────
function FeeDues({ enquiryId, childName, phone }: { enquiryId?: string; childName?: string; phone?: string }) {
  const [fees, setFees]         = useState<any[]>([]);
  const [paying, setPaying]     = useState<string | null>(null);
  const [paidIds, setPaidIds]   = useState<string[]>([]);
  const [payError, setPayError] = useState("");

  // Remaining balance = amount − discount − already paid
  const feeRemaining = (f: any) =>
    Math.max(0, (f.amount || 0) - (f.discount_amount || 0) - (f.paid_amount || 0));

  const loadFees = () => {
    if (!enquiryId) return;
    // Fetch ALL statuses — filter client-side so partial payments / discounts are handled correctly
    fetch(`/api/fees/assignments?enquiryId=${enquiryId}`)
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        setFees(all.filter(f => feeRemaining(f) > 0));
      });
  };

  useEffect(() => { loadFees(); }, [enquiryId]);

  const handlePay = async (fee: any) => {
    setPayError("");
    setPaying(fee.id);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setPayError("Failed to load payment gateway. Please check your connection.");
      setPaying(null);
      return;
    }

    const res = await fetch("/api/fees/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feeId:     fee.id,
        amount:    feeRemaining(fee),   // charge remaining balance, not full amount
        childName: childName || fee.child_name,
        phone:     phone || "",
      }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      setPayError(data.error || "Could not create payment order. Please try again.");
      setPaying(null);
      return;
    }

    const { order, keyId } = data;

    const rzp = new window.Razorpay({
      key:         keyId,
      amount:      order.amount,
      currency:    order.currency,
      name:        "Evergreen Preschool & Daycare",
      description: `${fee.period_label || fee.fee_type} — ${childName || fee.child_name}`,
      order_id:    order.id,
      prefill:     { contact: phone || "", name: childName || fee.child_name },
      theme:       { color: "#178F78" },
      modal:       { ondismiss: () => setPaying(null) },
      handler: async (response: any) => {
        const verifyRes = await fetch("/api/fees/pay", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feeId:     fee.id,
            paymentId: response.razorpay_payment_id,
            orderId:   response.razorpay_order_id,
            signature: response.razorpay_signature,
          }),
        });
        const verifyData = await verifyRes.json();
        if (verifyData.success) {
          setPaidIds(p => [...p, fee.id]);
          setFees(prev => prev.filter(f => f.id !== fee.id));
        } else {
          setPayError("Payment received but verification failed. Contact school with payment ID: " + response.razorpay_payment_id);
        }
        setPaying(null);
      },
    });

    rzp.on("payment.failed", (response: any) => {
      setPayError("Payment failed: " + response.error.description);
      setPaying(null);
    });

    rzp.open();
  };

  const overdue = fees.filter(f => new Date(f.due_date) < new Date());

  if (paidIds.length > 0 && fees.length === 0) {
    return (
      <div style={{ background:"rgba(23,143,120,0.08)", border:"1px solid rgba(23,143,120,0.25)", borderRadius:"16px", padding:"14px 16px", marginBottom:"12px", display:"flex", alignItems:"center", gap:"12px" }}>
        <span style={{ fontSize:"28px" }}>✅</span>
        <div>
          <div style={{ fontWeight:700, fontSize:"14px", color:"#178F78" }}>Payment Successful!</div>
          <div style={{ fontSize:"11px", color:"#6B7A99", marginTop:"2px" }}>Fee has been marked as paid. Thank you!</div>
        </div>
      </div>
    );
  }

  if (fees.length === 0) return null;

  return (
    <div style={{ background: overdue.length > 0 ? "rgba(220,38,38,0.05)" : "rgba(245,184,41,0.07)", border:`1px solid ${overdue.length > 0 ? "rgba(220,38,38,0.2)" : "rgba(245,184,41,0.3)"}`, borderRadius:"16px", padding:"16px", marginBottom:"12px" }}>

      <div style={{ fontWeight:700, fontSize:"14px", color: overdue.length > 0 ? "#DC2626" : "#B08000", marginBottom:"12px", display:"flex", alignItems:"center", gap:"8px" }}>
        {overdue.length > 0 ? "🔴 Fee Overdue" : "📢 Fee Due Soon"}
        <span style={{ fontSize:"10px", background: overdue.length > 0 ? "rgba(220,38,38,0.1)" : "rgba(245,184,41,0.15)", color: overdue.length > 0 ? "#DC2626" : "#B08000", borderRadius:"20px", padding:"2px 8px", fontWeight:600 }}>
          {fees.length} pending
        </span>
      </div>

      {payError && (
        <div style={{ background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:"10px", padding:"9px 12px", fontSize:"11px", color:"#DC2626", marginBottom:"10px" }}>
          ⚠️ {payError}
        </div>
      )}

      {fees.map((f: any) => {
        const isOverdue = new Date(f.due_date) < new Date();
        const isPaying  = paying === f.id;
        return (
          <div key={f.id} style={{ borderTop:"1px solid rgba(0,0,0,0.06)", paddingTop:"12px", marginTop:"10px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"10px", flexWrap:"wrap" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"13px", fontWeight:700, color:"#1A2F4A" }}>
                  {(f.fee_structures as any)?.name || f.period_label || f.fee_type}
                </div>
                <div style={{ fontSize:"11px", color:"#6B7A99", marginTop:"2px" }}>
                  Due:{" "}
                  <span style={{ fontWeight:600, color: isOverdue ? "#DC2626" : "#B08000" }}>
                    {new Date(f.due_date).toLocaleDateString("en-IN")}
                  </span>
                  {isOverdue && (
                    <span style={{ marginLeft:"6px", background:"rgba(220,38,38,0.1)", color:"#DC2626", borderRadius:"20px", padding:"1px 7px", fontSize:"9px", fontWeight:700 }}>OVERDUE</span>
                  )}
                </div>
                {/* Show breakdown if discount or partial payment applied */}
                {((f.discount_amount || 0) > 0 || (f.paid_amount || 0) > 0) && (
                  <div style={{ marginTop:"6px", background:"rgba(0,0,0,0.03)", borderRadius:"8px", padding:"6px 8px", fontSize:"10px", color:"#6B7A99" }}>
                    <div>Total: ₹{(f.amount || 0).toLocaleString("en-IN")}</div>
                    {(f.discount_amount || 0) > 0 && (
                      <div style={{ color:"#178F78" }}>Discount: −₹{(f.discount_amount).toLocaleString("en-IN")}</div>
                    )}
                    {(f.paid_amount || 0) > 0 && (
                      <div style={{ color:"#6366F1" }}>Paid: −₹{(f.paid_amount).toLocaleString("en-IN")}</div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"8px" }}>
                <div style={{ fontSize:"20px", fontWeight:700, color: isOverdue ? "#DC2626" : "#1A2F4A" }}>
                  ₹{feeRemaining(f).toLocaleString("en-IN")}
                </div>
                <div style={{ fontSize:"10px", color:"#6B7A99" }}>balance due</div>
                <button
                  onClick={() => handlePay(f)}
                  disabled={!!paying}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"center", gap:"6px",
                    background: isPaying ? "#b2dfdb" : "#178F78",
                    color:"white", border:"none", borderRadius:"14px",
                    padding:"9px 20px", fontSize:"13px", fontWeight:700,
                    cursor: paying ? "not-allowed" : "pointer",
                    boxShadow: isPaying ? "none" : "0 4px 14px rgba(23,143,120,0.4)",
                    transition:"all 0.2s", whiteSpace:"nowrap" as const, minWidth:"130px",
                  }}>
                  {isPaying ? (
                    <>
                      <span style={{ width:"13px", height:"13px", border:"2px solid rgba(255,255,255,0.35)", borderTopColor:"white", borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite" }} />
                      Processing…
                    </>
                  ) : <>💳 Pay Now</>}
                </button>
              </div>
            </div>
            <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginTop:"8px" }}>
              {["UPI / GPay / PhonePe", "Credit Card", "Debit Card", "Net Banking"].map(m => (
                <span key={m} style={{ fontSize:"9px", fontWeight:600, background:"rgba(23,143,120,0.07)", color:"#178F78", borderRadius:"20px", padding:"2px 8px", border:"1px solid rgba(23,143,120,0.15)" }}>{m}</span>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop:"14px", paddingTop:"10px", borderTop:"1px solid rgba(0,0,0,0.05)", fontSize:"10px", color:"#9CA3AF", display:"flex", alignItems:"center", gap:"5px" }}>
        🔒 Secured by Razorpay &nbsp;·&nbsp; All payments are encrypted
      </div>
    </div>
  );
}

// ── Supabase lazy client ─────────────────────────────────
let _sb: SupabaseClient | null = null;
async function getSb() {
  if (_sb) return _sb;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    const cfg = await fetch("/api/config").then(r => r.json());
    url = cfg.supabaseUrl; key = cfg.supabaseKey;
  }
  _sb = createClient(url, key);
  return _sb;
}

const PROGRAMS: Record<string, { label:string; icon:string; color:string; schedule:string; highlights:string[] }> = {
  "infant":     { label:"Infant Care",     icon:"🍼", color:"#EC4899", schedule:"9:00 AM – 3:30 PM", highlights:[] },
  "playgroup":  { label:"Playgroup",        icon:"🎈", color:"#E8694A", schedule:"9:00 AM – 3:30 PM", highlights:[] },
  "nursery":    { label:"Nursery",          icon:"🌸", color:"#F5B829", schedule:"9:00 AM – 3:30 PM", highlights:[] },
  "jrkg":       { label:"Junior KG",        icon:"📚", color:"#6366F1", schedule:"9:00 AM – 3:30 PM", highlights:[] },
  "srkg":       { label:"Senior KG",        icon:"🎓", color:"#178F78", schedule:"9:00 AM – 3:30 PM", highlights:[] },
  "daycare":    { label:"Full-Day Daycare", icon:"🏡", color:"#0F766E", schedule:"7:00 AM – 7:00 PM", highlights:[] },
  "afterschool":{ label:"After-School",     icon:"🚌", color:"#7C3AED", schedule:"3:00 PM – 7:00 PM", highlights:[] },
};

const EVENT_TYPE_COLORS: Record<string,string> = { holiday:"#E8694A", festival:"#F5B829", activity:"#178F78", exam:"#6366F1", ptm:"#EC4899", sports:"#0F766E" };

export default function ParentDashboardPage() {
  const router = useRouter();
  const [session, setSession]        = useState<any>(null);
  const [children, setChildren]      = useState<any[]>([]);
  const [selectedChild, setSelected] = useState<any>(null);
  const [calendarEvents, setCalEvts] = useState<any[]>([]);
  const [announcements, setAnnounce] = useState<any[]>([]);
  const [homework, setHomework]      = useState<any[]>([]);
  const [photos, setPhotos]          = useState<any[]>([]);
  const [matchedPhotos, setMatched]  = useState<any[]>([]);
  const [matchStatus, setMatchStatus]= useState("");
  const [matchLoading, setMatchLoad] = useState(false);
  const [loading, setLoading]        = useState(true);
  const [tab, setTab]                = useState<"home"|"homework"|"calendar"|"profile"|"photos"|"documents"|"kit"|"payments"|"transport"|"medical"|"pickup"|"referrals"|"incidents"|"askschool"|"audio"|"community"|"reels">("home");
  const [paidFees, setPaidFees]         = useState<any[]>([]);
  const [paidLoading, setPaidLoading]   = useState(false);
  const [pendingFees, setPendingFees]   = useState<any[]>([]);
  const [pendingLoading, setPendingLoad]= useState(false);
  const [tabPayError, setTabPayError]   = useState("");
  const [tabPaying, setTabPaying]       = useState<string | null>(null);
  const [tabPaidIds, setTabPaidIds]     = useState<string[]>([]);
  const [doneHW, setDoneHW]         = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("ep_hw_done") || "[]")); } catch { return new Set(); }
  });
  const [sbClient, setSbClient]       = useState<any>(null);
  // Load supabase client for DocumentManager
  useEffect(() => { getSb().then(setSbClient); }, []);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileError, setProfileError]         = useState("");
  const [pwModalOpen, setPwModalOpen]           = useState(false);
  const [showPwReminder, setShowPwReminder]     = useState(false);

  // Show a dismissible "set your own password" reminder while on the default
  // password; if dismissed, don't nag again for ~30 days.
  useEffect(() => {
    if (!session) return;
    if (!session.isDefaultPassword) { setShowPwReminder(false); return; }
    let until = 0;
    try { until = Number(localStorage.getItem("ep_pw_snooze_until") || 0); } catch {}
    setShowPwReminder(Date.now() > until);
  }, [session]);

  const snoozePwReminder = () => {
    try { localStorage.setItem("ep_pw_snooze_until", String(Date.now() + 30*24*60*60*1000)); } catch {}
    setShowPwReminder(false);
  };

  const onPwChanged = () => {
    setShowPwReminder(false);
    try {
      const stored = localStorage.getItem("ep_parent_session");
      if (stored) { const s = JSON.parse(stored); s.isDefaultPassword = false; localStorage.setItem("ep_parent_session", JSON.stringify(s)); }
    } catch {}
    setSession((p: any) => (p ? { ...p, isDefaultPassword: false } : p));
  };

  const now       = new Date();
  const monthKey  = String(now.getMonth()+1).padStart(2,"0");
  const monthName = now.toLocaleString("default", { month:"long" });
  const year      = now.getFullYear();
  const month     = `${year}-${monthKey}`;

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date(); return { year:n.getFullYear(), month:n.getMonth() };
  });
  const viewMonthStr  = `${viewMonth.year}-${String(viewMonth.month+1).padStart(2,"0")}`;
  const viewMonthName = new Date(viewMonth.year, viewMonth.month, 1).toLocaleString("default", { month:"long" });
  const [calEventsView, setCalEventsView] = useState<any[]>([]);

  useEffect(() => {
    if (!session?.phone) return;
    fetch(`/api/admin/calendar?month=${viewMonthStr}`)
      .then(r => r.json()).then(d => setCalEventsView(d.events || []));
  }, [session, viewMonthStr]);

  const prevMonth = () => setViewMonth(p => { const d = new Date(p.year,p.month-1,1); return { year:d.getFullYear(), month:d.getMonth() }; });
  const nextMonth = () => setViewMonth(p => { const d = new Date(p.year,p.month+1,1); return { year:d.getFullYear(), month:d.getMonth() }; });
  const goToday   = () => { const n = new Date(); setViewMonth({ year:n.getFullYear(), month:n.getMonth() }); };

  useEffect(() => {
    const stored = localStorage.getItem("ep_parent_session");
    if (!stored) { router.replace("/parent-login"); return; }
    const s = JSON.parse(stored);
    if (Date.now() - s.loginTime > 7*24*60*60*1000) {
      localStorage.removeItem("ep_parent_session"); router.replace("/parent-login"); return;
    }
    setSession(s);
  }, [router]);

  const reloadDashboard = useCallback(() => {
    if (!session?.phone) return;
    fetch(`/api/parent/dashboard?phone=${encodeURIComponent(session.phone)}&month=${month}`)
      .then(r => r.json())
      .then(data => {
        const childs = data.enquiries || [];
        setChildren(childs);
        setCalEvts(data.calendarEvents || []);
        setAnnounce(data.announcements || []);
        setHomework(data.homework || []);
        setPhotos(data.photos || []);
        if (childs.length === 1) setSelected(childs[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, month]);

  useEffect(() => { reloadDashboard(); }, [reloadDashboard]);

  // Real-time sync: auto-reload when admin/teacher changes data
  useEffect(() => {
    if (!session?.phone) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => { if (timer) clearTimeout(timer); timer = setTimeout(reloadDashboard, 800); };

    let sb: SupabaseClient | null = null;
    getSb().then(client => {
      sb = client;
      const ch = client
        .channel("parent-dash-realtime")
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "announcements" }, debounced)
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "homework" }, debounced)
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "section_photos" }, debounced)
        .on("postgres_changes" as any, { event: "*", schema: "public", table: "attendance" }, debounced)
        .subscribe();
      sb = { ...client, _ch: ch } as any;
    });

    return () => {
      if (timer) clearTimeout(timer);
      getSb().then(client => client.channel("parent-dash-realtime").unsubscribe());
    };
  }, [session, reloadDashboard]);

  useEffect(() => {
    if (!selectedChild?.section_id || !selectedChild?.child_name) return;
    setMatchLoad(true);
    fetch("/api/photos/face-match", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ sectionId:selectedChild.section_id, childName:selectedChild.child_name }),
    })
      .then(r => r.json())
      .then(data => {
        setMatched(data.matchedPhotos || []);
        if (data.allPhotos) setPhotos(data.allPhotos);
        setMatchStatus((data.matchedPhotos||[]).length > 0
          ? `✨ ${selectedChild.child_name} tagged in ${data.matchedPhotos.length} photo${data.matchedPhotos.length>1?"s":""}`
          : "");
        setMatchLoad(false);
      })
      .catch(() => { setMatchStatus(""); setMatchLoad(false); });
  }, [selectedChild?.id]);

  useEffect(() => {
    if (tab !== "payments" || !selectedChild?.id) return;
    setTabPayError(""); setTabPaidIds([]);
    setPaidLoading(true);
    setPendingLoad(true);
    fetch(`/api/fees/history?enquiryId=${selectedChild.id}`)
      .then(r => r.json())
      .then(d => setPaidFees(Array.isArray(d) ? d : []))
      .catch(() => setPaidFees([]))
      .finally(() => setPaidLoading(false));
    // Fetch ALL statuses, then filter client-side to remaining > 0
    // This captures partial payments and discounts correctly
    fetch(`/api/fees/assignments?enquiryId=${selectedChild.id}`)
      .then(r => r.json())
      .then(d => {
        const all = Array.isArray(d) ? d : [];
        setPendingFees(all.filter(f =>
          Math.max(0, (f.amount || 0) - (f.discount_amount || 0) - (f.paid_amount || 0)) > 0
        ));
      })
      .catch(() => setPendingFees([]))
      .finally(() => setPendingLoad(false));
  }, [tab, selectedChild?.id]);

  const markHomeworkDone = (hwId: string) => {
    setDoneHW(prev => {
      const next = new Set(prev);
      next.has(hwId) ? next.delete(hwId) : next.add(hwId);
      localStorage.setItem("ep_hw_done", JSON.stringify([...next]));
      return next;
    });
  };

  const logout = async () => {
    localStorage.removeItem("ep_parent_session");
    await fetch("/api/auth/parent-logout", { method: "POST" }).catch(() => {});
    router.replace("/parent-login");
  };

  const handleTabPay = async (fee: any) => {
    setTabPayError(""); setTabPaying(fee.id);
    const loaded = await loadRazorpayScript();
    if (!loaded) { setTabPayError("Failed to load payment gateway. Check your connection."); setTabPaying(null); return; }
    const tabFeeRemaining = Math.max(0, (fee.amount || 0) - (fee.discount_amount || 0) - (fee.paid_amount || 0));
    const res = await fetch("/api/fees/pay", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feeId: fee.id, amount: tabFeeRemaining, childName: selectedChild?.child_name || fee.child_name, phone: session?.phone || "" }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setTabPayError(data.error || "Could not create payment order."); setTabPaying(null); return; }
    const { order, keyId } = data;
    const rzp = new window.Razorpay({
      key: keyId, amount: order.amount, currency: order.currency,
      name: "Evergreen Preschool & Daycare",
      description: `${fee.period_label || fee.fee_type} — ${selectedChild?.child_name || fee.child_name}`,
      order_id: order.id,
      prefill: { contact: session?.phone || "", name: selectedChild?.child_name || fee.child_name },
      theme: { color: "#178F78" },
      modal: { ondismiss: () => setTabPaying(null) },
      handler: async (response: any) => {
        const vr = await fetch("/api/fees/pay", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feeId: fee.id, paymentId: response.razorpay_payment_id, orderId: response.razorpay_order_id, signature: response.razorpay_signature }),
        });
        const vd = await vr.json();
        if (vd.success) {
          setTabPaidIds(p => [...p, fee.id]);
          setPendingFees(prev => prev.filter(f => f.id !== fee.id));
          // refresh history
          fetch(`/api/fees/history?enquiryId=${selectedChild?.id}`)
            .then(r => r.json()).then(d => setPaidFees(Array.isArray(d) ? d : []));
        } else {
          setTabPayError("Payment received but verification failed. Contact school with payment ID: " + response.razorpay_payment_id);
        }
        setTabPaying(null);
      },
    });
    rzp.on("payment.failed", (response: any) => { setTabPayError("Payment failed: " + response.error.description); setTabPaying(null); });
    rzp.open();
  };

  const printReceipt = (f: any) => {
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt ${f.receipt_number || f.receipt_no || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:500px;margin:40px auto;padding:20px;color:#1A2F4A}
h2{color:#178F78;margin:0 0 4px}p{margin:4px 0;font-size:13px}.divider{border-top:1px dashed #ccc;margin:12px 0}
.label{color:#6B7A99;font-size:11px;text-transform:uppercase}.amount{font-size:28px;font-weight:700;color:#178F78}
.footer{font-size:10px;color:#9CA3AF;margin-top:16px;text-align:center}</style></head><body>
<h2>🌿 Evergreen Preschool & Daycare</h2>
<p style="font-size:11px;color:#6B7A99">Electronic City, Bengaluru</p>
<div class="divider"></div>
<p class="label">Receipt No.</p><p style="font-family:monospace;font-weight:700">${f.receipt_number || f.receipt_no || "—"}</p>
<p class="label">Child</p><p style="font-weight:700">${f.child_name || selectedChild?.child_name || ""}</p>
<p class="label">Description</p><p>${f.period_label || f.fee_type || "Fee"}</p>
<p class="label">Payment Date</p><p>${f.payment_date ? new Date(f.payment_date).toLocaleDateString("en-IN", { day:"2-digit", month:"long", year:"numeric" }) : (f.paid_at ? new Date(f.paid_at).toLocaleDateString("en-IN", { day:"2-digit", month:"long", year:"numeric" }) : "—")}</p>
<p class="label">Mode</p><p>${(f.payment_mode || "").toUpperCase() || "—"}</p>
${f.reference_number ? `<p class="label">Reference</p><p style="font-family:monospace">${f.reference_number}</p>` : ""}
<div class="divider"></div>
<p class="label">Amount Paid</p><p class="amount">₹${Number(f.paid_amount || f.amount || 0).toLocaleString("en-IN")}</p>
<div class="divider"></div>
<div class="footer"><p>Thank you for your payment!</p><p>This is a computer-generated receipt.</p></div>
<script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };

  const prog       = selectedChild ? PROGRAMS[selectedChild.program_id] || PROGRAMS["nursery"] : null;
  const hasSection = !!selectedChild?.section_id;

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#FEFCF8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Quicksand',sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:"40px", height:"40px", border:"3px solid #EDE8DF", borderTopColor:"#178F78", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
        <div style={{ color:"#6B7A99", fontSize:"13px" }}>Loading your dashboard…</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#FEFCF8", fontFamily:"'Quicksand',sans-serif" }}>
      <PWAInstallPrompt />

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#178F78,#0f6b5a)", padding:"16px 20px" }}>
        <div style={{ maxWidth:"900px", margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"18px", fontWeight:700, color:"white" }}>
              👋 Welcome{session?.childName ? `, ${session.childName}'s Parent` : ""}!
            </div>
            <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.7)", marginTop:"2px" }}>{session?.phone}</div>
          </div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            <button onClick={() => router.push("/ai-tools/parent")}
              style={{ display:"flex", alignItems:"center", gap:"6px", background:"linear-gradient(135deg,#8957E5,#6366F1)", border:"2px solid rgba(255,255,255,0.35)", borderRadius:"20px", padding:"7px 12px", color:"white", fontSize:"12px", fontWeight:700, cursor:"pointer", fontFamily:"'Quicksand',sans-serif" }}>
              <span style={{ fontSize:"15px" }}>🤖</span>
              <span className="hidden sm:inline">AI Tools</span>
            </button>
            <button onClick={logout} style={{ display:"flex", alignItems:"center", gap:"6px", background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:"20px", padding:"7px 12px", color:"white", fontSize:"12px", fontWeight:600, cursor:"pointer" }}>
              <LogOut style={{ width:"14px", height:"14px" }} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:"900px", margin:"0 auto", padding:"16px" }}>

        {/* Default-password reminder (monthly, dismissible) */}
        {showPwReminder && (
          <div style={{ background:"rgba(245,184,41,0.12)", border:"1px solid rgba(245,184,41,0.4)", borderRadius:"16px", padding:"14px 16px", marginBottom:"16px", display:"flex", gap:"12px", alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:"22px" }}>🔐</div>
            <div style={{ flex:1, minWidth:"180px" }}>
              <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>You&apos;re still using your default password</div>
              <div style={{ fontSize:"12px", color:"#6B7A99", marginTop:"2px" }}>Set your own password to keep your account secure.</div>
            </div>
            <div style={{ display:"flex", gap:"8px" }}>
              <button onClick={() => setPwModalOpen(true)} style={{ padding:"8px 14px", borderRadius:"14px", background:"#178F78", color:"white", border:"none", fontWeight:700, fontSize:"12px", cursor:"pointer" }}>Set password</button>
              <button onClick={snoozePwReminder} style={{ padding:"8px 14px", borderRadius:"14px", background:"transparent", color:"#6B7A99", border:"1px solid #EDE8DF", fontWeight:600, fontSize:"12px", cursor:"pointer" }}>Remind me later</button>
            </div>
          </div>
        )}

        {/* Child selector */}
        {children.length > 0 && (
          <div style={{ marginBottom:"16px" }}>
            {children.length > 1 && <div style={{ fontSize:"11px", fontWeight:700, color:"#6B7A99", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"8px" }}>Select Child</div>}
            <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
              {children.map(child => (
                <button key={child.id} onClick={() => { setSelected(child); setTab("home"); }}
                  style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 16px", borderRadius:"16px", border:`2px solid ${selectedChild?.id===child.id?"#178F78":"#EDE8DF"}`, background:selectedChild?.id===child.id?"rgba(23,143,120,0.08)":"white", cursor:"pointer", transition:"all 0.2s" }}>
                  {child.photo_url
                    ? <img src={child.photo_url} alt={child.child_name} style={{ width:"40px", height:"40px", borderRadius:"50%", objectFit:"cover", border:"2px solid #EDE8DF", flexShrink:0 }} />
                    : <div style={{ width:"40px", height:"40px", borderRadius:"50%", background:"linear-gradient(135deg,rgba(232,105,74,0.2),rgba(23,143,120,0.2))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px" }}>{PROGRAMS[child.program_id]?.icon||"🧒"}</div>
                  }
                  <div style={{ textAlign:"left" }}>
                    <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>{child.child_name}</div>
                    <div style={{ fontSize:"10px", color:"#6B7A99" }}>
                      {child.program_label}
                      {child.section_name && <span style={{ color:"#178F78", fontWeight:700 }}> · {child.section_name}</span>}
                    </div>
                  </div>
                  {selectedChild?.id===child.id && <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#178F78", marginLeft:"4px" }} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {children.length === 0 && (
          <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"32px", textAlign:"center", marginBottom:"16px" }}>
            <div style={{ fontSize:"36px", marginBottom:"10px" }}>📋</div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"18px", color:"#178F78", marginBottom:"6px" }}>No children enrolled yet</div>
            <Link href="/enquiry" style={{ background:"#E8694A", color:"white", borderRadius:"20px", padding:"9px 22px", fontWeight:700, fontSize:"13px", textDecoration:"none" }}>Submit Enquiry →</Link>
          </div>
        )}

        {/* Tabs + content */}
        {selectedChild && (
          <>
            <div className="no-scrollbar" style={{ display:"flex", gap:"4px", marginBottom:"16px", background:"white", borderRadius:"16px", padding:"4px", border:"1px solid #EDE8DF", overflowX:"auto", WebkitOverflowScrolling:"touch" } as any}>
              {[{key:"home",icon:"🏠",label:"Home"},{key:"homework",icon:"📚",label:"Homework"},{key:"calendar",icon:"📅",label:"Calendar"},{key:"photos",icon:"📸",label:"Photos"},{key:"payments",icon:"💳",label:"Payments"},{key:"medical",icon:"🩺",label:"Medical"},{key:"pickup",icon:"🚗",label:"Pickup"},{key:"referrals",icon:"🎁",label:"Refer"},{key:"incidents",icon:"🚨",label:"Incidents"},{key:"documents",icon:"📁",label:"Docs"},{key:"kit",icon:"🎒",label:"Kit"},{key:"transport",icon:"🚌",label:"Bus"},{key:"askschool",icon:"💬",label:"Ask AI"},{key:"audio",icon:"🎧",label:"Audio"},{key:"community",icon:"👪",label:"Community"},{key:"reels",icon:"🎬",label:"Reels"},{key:"profile",icon:"👶",label:"Profile"}].map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)}
                  style={{ flexShrink:0, minWidth:"62px", padding:"8px 4px", borderRadius:"12px", border:"none", cursor:"pointer", fontSize:"11px", fontWeight:700, display:"flex", flexDirection:"column", alignItems:"center", gap:"2px", transition:"all 0.2s", background:tab===t.key?"#178F78":"transparent", color:tab===t.key?"white":"#6B7A99", touchAction:"manipulation" }}>
                  <span style={{ fontSize:"16px" }}>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>

            {/* ══ HOME TAB ══ */}
            {tab === "home" && (
              <div>
                {/* ✅ Razorpay fee payment */}
                <FeeDues
                  enquiryId={selectedChild?.id}
                  childName={selectedChild?.child_name}
                  phone={session?.phone}
                />

                {prog && (
                  <div style={{ background:"white", borderRadius:"20px", border:`2px solid ${prog.color}33`, padding:"16px", marginBottom:"12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"10px" }}>
                      <div style={{ width:"48px", height:"48px", borderRadius:"50%", background:`${prog.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px" }}>{prog.icon}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:prog.color }}>{prog.label}</div>
                        <div style={{ fontSize:"11px", color:"#6B7A99" }}>⏰ {prog.schedule}</div>
                        {selectedChild.section_name && <div style={{ fontSize:"11px", color:"#178F78", fontWeight:700 }}>📚 {selectedChild.section_name}</div>}
                      </div>
                      <div style={{ background:`${prog.color}12`, borderRadius:"12px", padding:"6px 12px", textAlign:"center" }}>
                        <div style={{ fontSize:"10px", color:"#6B7A99" }}>Status</div>
                        <div style={{ fontSize:"11px", fontWeight:700, color:prog.color, textTransform:"capitalize" }}>{selectedChild.status||"Enquired"}</div>
                      </div>
                    </div>
                    {!hasSection && (
                      <div style={{ background:"rgba(245,184,41,0.08)", border:"1px solid rgba(245,184,41,0.25)", borderRadius:"12px", padding:"9px 12px", fontSize:"11px", color:"#B08000" }}>
                        ⏳ Section not yet assigned. Homework and class photos will appear once admin assigns your child to a section.
                      </div>
                    )}
                  </div>
                )}

                {/* Month events */}
                <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"16px", marginBottom:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
                    <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"15px", fontWeight:700, color:"#178F78" }}>🗓️ {monthName} {year}</div>
                    <span style={{ fontSize:"10px", color:"#6B7A99", background:"#FAF0E8", borderRadius:"20px", padding:"3px 10px" }}>{calendarEvents.length} events</span>
                  </div>
                  {calendarEvents.length === 0 ? (
                    <div style={{ fontSize:"12px", color:"#6B7A99", textAlign:"center", padding:"12px 0" }}>No events this month.</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                      {calendarEvents.map(ev => (
                        <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 12px", borderRadius:"12px", background:ev.is_holiday?`${ev.color}0d`:"#FAF0E8", border:`1px solid ${ev.color}25` }}>
                          <span style={{ fontSize:"18px", flexShrink:0 }}>{ev.icon}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:"12px", fontWeight:700, color:"#1A2F4A" }}>{ev.title}</div>
                            <div style={{ fontSize:"10px", color:"#6B7A99" }}>
                              {new Date(ev.event_date).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}
                              {ev.description && ` · ${ev.description}`}
                            </div>
                          </div>
                          {ev.is_holiday
                            ? <span style={{ fontSize:"9px", fontWeight:700, color:"#E8694A", background:"rgba(232,105,74,0.12)", borderRadius:"20px", padding:"2px 8px", whiteSpace:"nowrap" }}>HOLIDAY</span>
                            : <span style={{ fontSize:"9px", fontWeight:700, color:ev.color, background:`${ev.color}15`, borderRadius:"20px", padding:"2px 8px", whiteSpace:"nowrap", textTransform:"uppercase" }}>{ev.event_type}</span>
                          }
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Announcements */}
                <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"16px" }}>
                  <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"15px", fontWeight:700, color:"#178F78", marginBottom:"10px" }}>📢 Announcements</div>
                  {announcements.length === 0
                    ? <div style={{ textAlign:"center", color:"#6B7A99", fontSize:"12px", padding:"12px" }}>No announcements yet.</div>
                    : announcements.map((a:any) => (
                      <div key={a.id} style={{ padding:"10px 0", borderBottom:"1px solid #EDE8DF" }}>
                        <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A", marginBottom:"3px" }}>{a.title}</div>
                        <div style={{ fontSize:"11px", color:"#6B7A99" }}>{a.body}</div>
                      </div>
                    ))
                  }
                </div>

                {/* AI matched photos */}
                {selectedChild?.photo_url && selectedChild?.section_id && (
                  <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"16px", marginTop:"12px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
                      <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"15px", fontWeight:700, color:"#178F78" }}>✨ {selectedChild.child_name} in Photos</div>
                      {matchLoading && (
                        <div style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"11px", color:"#6B7A99" }}>
                          <div style={{ width:"12px", height:"12px", border:"2px solid #EDE8DF", borderTopColor:"#178F78", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                          Scanning…
                        </div>
                      )}
                      {!matchLoading && matchStatus && <div style={{ fontSize:"11px", fontWeight:600, color:"#178F78" }}>{matchStatus}</div>}
                    </div>
                    {!matchLoading && matchedPhotos.length === 0 && (
                      <div style={{ textAlign:"center", padding:"16px", color:"#6B7A99", fontSize:"12px" }}>No recent photos with your child yet.</div>
                    )}
                    {matchedPhotos.length > 0 && (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:"8px" }}>
                        {matchedPhotos.map((p:any) => (
                          <div key={p.id} style={{ borderRadius:"12px", overflow:"hidden", border:"1px solid #EDE8DF", position:"relative" }}>
                            <img src={p.photo_url} alt={p.title||"Class photo"} style={{ width:"100%", height:"110px", objectFit:"cover", display:"block" }} />
                            <div style={{ position:"absolute", top:"5px", right:"5px", background:"rgba(23,143,120,0.85)", borderRadius:"20px", padding:"2px 7px", fontSize:"9px", fontWeight:700, color:"white" }}>✨ Match</div>
                            {(p.title||p.ai_caption) && <div style={{ padding:"5px 7px", fontSize:"10px", color:"#6B7A99", fontWeight:600 }}>{p.title||p.ai_caption}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ HOMEWORK TAB ══ */}
            {tab === "homework" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"14px" }}>📚 Homework — {monthName}</div>
                {!hasSection ? (
                  <div style={{ background:"rgba(245,184,41,0.08)", border:"1px solid rgba(245,184,41,0.25)", borderRadius:"16px", padding:"20px", textAlign:"center" }}>
                    <div style={{ fontSize:"28px", marginBottom:"8px" }}>⏳</div>
                    <div style={{ fontWeight:700, fontSize:"14px", color:"#B08000", marginBottom:"4px" }}>Section not assigned yet</div>
                    <div style={{ fontSize:"12px", color:"#6B7A99" }}>Homework will appear here once admin assigns your child to a class section.</div>
                  </div>
                ) : (
                  <ParentHomeworkWeb homework={homework} enquiryId={selectedChild?.id || ""} childName={selectedChild?.child_name || ""} />
                )}
              </div>
            )}

            {/* ══ CALENDAR TAB ══ */}
            {tab === "calendar" && (
              <div>
                <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"16px", marginBottom:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
                    <button onClick={prevMonth} style={{ width:"34px", height:"34px", borderRadius:"50%", border:"1px solid #EDE8DF", background:"#FAF0E8", fontSize:"16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#178F78", fontWeight:700 }}>‹</button>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78" }}>{viewMonthName} {viewMonth.year}</div>
                      {viewMonthStr !== `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}` && (
                        <button onClick={goToday} style={{ fontSize:"10px", color:"#E8694A", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>Back to today</button>
                      )}
                    </div>
                    <button onClick={nextMonth} style={{ width:"34px", height:"34px", borderRadius:"50%", border:"1px solid #EDE8DF", background:"#FAF0E8", fontSize:"16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#178F78", fontWeight:700 }}>›</button>
                  </div>
                  {(() => {
                    const dIM = new Date(viewMonth.year, viewMonth.month+1, 0).getDate();
                    const fD  = new Date(viewMonth.year, viewMonth.month, 1).getDay();
                    return (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"2px", marginBottom:"12px" }}>
                        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                          <div key={d} style={{ textAlign:"center", fontSize:"10px", fontWeight:700, color:"#6B7A99", padding:"4px 0" }}>{d}</div>
                        ))}
                        {Array.from({length:fD}).map((_,i) => <div key={`e${i}`}/>)}
                        {Array.from({length:dIM}).map((_,i) => {
                          const day=i+1, date=`${viewMonthStr}-${String(day).padStart(2,"0")}`;
                          const dayEvts=calEventsView.filter(ev=>ev.event_date===date);
                          const isToday=viewMonth.year===now.getFullYear()&&viewMonth.month===now.getMonth()&&day===now.getDate();
                          const isHoliday=dayEvts.some(ev=>ev.is_holiday);
                          const isSun=(fD+i)%7===0;
                          return (
                            <div key={day} title={dayEvts.map(ev=>ev.title).join(", ")}
                              style={{ textAlign:"center", padding:"5px 2px", borderRadius:"8px", fontSize:"12px", fontWeight:isToday?700:400, position:"relative",
                                background:isToday?"#178F78":isHoliday?"rgba(232,105,74,0.08)":"transparent",
                                color:isToday?"white":isHoliday?"#E8694A":isSun?"#E8694A":"#1A2F4A" }}>
                              {day}
                              {dayEvts.length>0&&!isToday&&<div style={{ width:"4px", height:"4px", borderRadius:"50%", background:dayEvts[0].color, margin:"1px auto 0" }}/>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                {calEventsView.length > 0 ? (
                  <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"16px" }}>
                    <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"15px", fontWeight:700, color:"#178F78", marginBottom:"12px" }}>Events in {viewMonthName}</div>
                    {calEventsView.map(ev => (
                      <div key={ev.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"9px 0", borderBottom:"1px solid #EDE8DF" }}>
                        <span style={{ fontSize:"20px" }}>{ev.icon}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>{ev.title}
                            {ev.is_holiday&&<span style={{ marginLeft:"6px", background:"rgba(232,105,74,0.1)", color:"#E8694A", borderRadius:"20px", padding:"1px 7px", fontSize:"9px", fontWeight:700 }}>HOLIDAY</span>}
                          </div>
                          <div style={{ fontSize:"11px", color:"#6B7A99" }}>
                            {new Date(ev.event_date).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}
                            {ev.description&&` · ${ev.description}`}
                          </div>
                        </div>
                        <span style={{ fontSize:"10px", fontWeight:700, color:EVENT_TYPE_COLORS[ev.event_type]||"#6B7A99", background:`${EVENT_TYPE_COLORS[ev.event_type]||"#6B7A99"}15`, borderRadius:"20px", padding:"2px 8px", textTransform:"capitalize", whiteSpace:"nowrap" }}>{ev.event_type}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px", textAlign:"center", color:"#6B7A99", fontSize:"13px" }}>No events for {viewMonthName} {viewMonth.year}</div>
                )}
              </div>
            )}

            {/* ══ PHOTOS TAB ══ */}
            {tab === "photos" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px", flexWrap:"wrap", gap:"8px" }}>
                  <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78" }}>📸 {selectedChild.section_name||"Class"} Photos</div>
                  {matchLoading && (
                    <div style={{ display:"flex", alignItems:"center", gap:"5px", fontSize:"11px", color:"#6B7A99" }}>
                      <div style={{ width:"10px", height:"10px", border:"2px solid #EDE8DF", borderTopColor:"#178F78", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                      Finding your child…
                    </div>
                  )}
                  {!matchLoading && matchedPhotos.length > 0 && (
                    <div style={{ fontSize:"11px", background:"rgba(23,143,120,0.1)", color:"#178F78", borderRadius:"20px", padding:"3px 10px", fontWeight:600 }}>✨ {selectedChild.child_name} spotted!</div>
                  )}
                </div>
                {!hasSection ? (
                  <div style={{ background:"rgba(245,184,41,0.08)", border:"1px solid rgba(245,184,41,0.25)", borderRadius:"16px", padding:"24px", textAlign:"center" }}>
                    <div style={{ fontSize:"32px", marginBottom:"8px" }}>📸</div>
                    <div style={{ fontWeight:700, fontSize:"14px", color:"#B08000" }}>Section not assigned yet</div>
                  </div>
                ) : photos.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"24px", color:"#6B7A99" }}>
                    <div style={{ fontSize:"32px", marginBottom:"8px" }}>🌿</div>
                    No photos uploaded yet for {selectedChild.section_name}.
                  </div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:"8px" }}>
                    {photos.map((p:any) => {
                      const isMatch=!matchLoading&&matchedPhotos.find((m:any)=>m.id===p.id);
                      return (
                        <div key={p.id} style={{ borderRadius:"12px", overflow:"hidden", border:`2px solid ${isMatch?"rgba(23,143,120,0.4)":"#EDE8DF"}`, position:"relative", transition:"border-color 0.4s" }}>
                          <img src={p.photo_url} alt={p.title||"Class photo"} style={{ width:"100%", height:"120px", objectFit:"cover", display:"block" }} />
                          {isMatch&&<div style={{ position:"absolute", top:"5px", right:"5px", background:"rgba(23,143,120,0.88)", borderRadius:"20px", padding:"2px 8px", fontSize:"10px", fontWeight:700, color:"white" }}>✨ You!</div>}
                          {(p.title||p.ai_caption)&&<div style={{ padding:"5px 7px", fontSize:"10px", color:"#6B7A99", fontWeight:600 }}>{p.title||p.ai_caption}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ PAYMENTS TAB ══ */}
            {tab === "payments" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>

                {/* ── Due / Overdue Fees ── */}
                {(pendingLoading || pendingFees.length > 0 || tabPaidIds.length > 0) && (
                  <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                    <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"12px" }}>📋 Fees Due</div>

                    {tabPayError && (
                      <div style={{ background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:"10px", padding:"9px 12px", fontSize:"11px", color:"#DC2626", marginBottom:"12px" }}>
                        ⚠️ {tabPayError}
                      </div>
                    )}

                    {pendingLoading ? (
                      <div style={{ textAlign:"center", padding:"20px", color:"#6B7A99" }}>
                        <div style={{ width:"28px", height:"28px", border:"3px solid #EDE8DF", borderTopColor:"#178F78", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 8px" }} />
                        Loading…
                      </div>
                    ) : pendingFees.length === 0 ? (
                      <div style={{ display:"flex", alignItems:"center", gap:"12px", background:"rgba(23,143,120,0.07)", borderRadius:"14px", padding:"14px 16px" }}>
                        <span style={{ fontSize:"24px" }}>✅</span>
                        <div>
                          <div style={{ fontWeight:700, fontSize:"13px", color:"#178F78" }}>All fees are paid!</div>
                          <div style={{ fontSize:"11px", color:"#6B7A99", marginTop:"2px" }}>No pending dues for {selectedChild.child_name}.</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                        {pendingFees.map((f: any) => {
                          const isOverdue = f.status === "overdue" || new Date(f.due_date) < new Date();
                          const isPaying  = tabPaying === f.id;
                          return (
                            <div key={f.id} style={{ border:`1px solid ${isOverdue ? "rgba(220,38,38,0.25)" : "rgba(245,184,41,0.35)"}`, borderRadius:"14px", padding:"14px 16px", background: isOverdue ? "rgba(220,38,38,0.03)" : "rgba(245,184,41,0.04)" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"10px", flexWrap:"wrap" }}>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>
                                    {(f.fee_structures as any)?.name || f.period_label || f.fee_type || "Fee"}
                                  </div>
                                  <div style={{ fontSize:"11px", color:"#6B7A99", marginTop:"3px" }}>
                                    Due:{" "}
                                    <span style={{ fontWeight:600, color: isOverdue ? "#DC2626" : "#B08000" }}>
                                      {new Date(f.due_date).toLocaleDateString("en-IN")}
                                    </span>
                                    {isOverdue && (
                                      <span style={{ marginLeft:"6px", background:"rgba(220,38,38,0.1)", color:"#DC2626", borderRadius:"20px", padding:"1px 7px", fontSize:"9px", fontWeight:700 }}>OVERDUE</span>
                                    )}
                                  </div>
                                  {/* Breakdown when discount or partial payment exists */}
                                  {((f.discount_amount || 0) > 0 || (f.paid_amount || 0) > 0) && (
                                    <div style={{ marginTop:"6px", background:"rgba(0,0,0,0.03)", borderRadius:"8px", padding:"6px 8px", fontSize:"10px", color:"#6B7A99" }}>
                                      <div>Total: ₹{(f.amount || 0).toLocaleString("en-IN")}</div>
                                      {(f.discount_amount || 0) > 0 && (
                                        <div style={{ color:"#178F78" }}>Discount: −₹{(f.discount_amount).toLocaleString("en-IN")}</div>
                                      )}
                                      {(f.paid_amount || 0) > 0 && (
                                        <div style={{ color:"#6366F1" }}>Paid: −₹{(f.paid_amount).toLocaleString("en-IN")}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"8px" }}>
                                  <div style={{ fontSize:"20px", fontWeight:700, color: isOverdue ? "#DC2626" : "#1A2F4A" }}>
                                    ₹{Math.max(0, (f.amount||0) - (f.discount_amount||0) - (f.paid_amount||0)).toLocaleString("en-IN")}
                                  </div>
                                  <div style={{ fontSize:"10px", color:"#6B7A99" }}>balance due</div>
                                  <button
                                    onClick={() => handleTabPay(f)}
                                    disabled={!!tabPaying}
                                    style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", background: isPaying ? "#b2dfdb" : "#178F78", color:"white", border:"none", borderRadius:"14px", padding:"9px 20px", fontSize:"13px", fontWeight:700, cursor: tabPaying ? "not-allowed" : "pointer", boxShadow: isPaying ? "none" : "0 4px 14px rgba(23,143,120,0.4)", transition:"all 0.2s", whiteSpace:"nowrap" as const, minWidth:"120px" }}>
                                    {isPaying ? (
                                      <><span style={{ width:"13px", height:"13px", border:"2px solid rgba(255,255,255,0.35)", borderTopColor:"white", borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite" }} />Processing…</>
                                    ) : <>💳 Pay Now</>}
                                  </button>
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:"5px", flexWrap:"wrap", marginTop:"8px" }}>
                                {["UPI / GPay / PhonePe", "Credit Card", "Debit Card", "Net Banking"].map(m => (
                                  <span key={m} style={{ fontSize:"9px", fontWeight:600, background:"rgba(23,143,120,0.07)", color:"#178F78", borderRadius:"20px", padding:"2px 8px", border:"1px solid rgba(23,143,120,0.15)" }}>{m}</span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ fontSize:"10px", color:"#9CA3AF", display:"flex", alignItems:"center", gap:"5px", paddingTop:"4px" }}>
                          🔒 Secured by Razorpay · All payments are encrypted
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Payment History ── */}
                <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                  <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>🧾 Payment History</div>
                  <div style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"16px" }}>All completed fee payments for {selectedChild.child_name}</div>

                  {paidLoading ? (
                    <div style={{ textAlign:"center", padding:"30px", color:"#6B7A99" }}>
                      <div style={{ width:"32px", height:"32px", border:"3px solid #EDE8DF", borderTopColor:"#178F78", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
                      Loading…
                    </div>
                  ) : paidFees.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"32px", color:"#6B7A99" }}>
                      <div style={{ fontSize:"32px", marginBottom:"8px" }}>🧾</div>
                      <div style={{ fontWeight:700, fontSize:"14px" }}>No payment history yet</div>
                      <div style={{ fontSize:"11px", marginTop:"4px" }}>Completed payments will appear here.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ background:"rgba(23,143,120,0.08)", borderRadius:"16px", padding:"14px", marginBottom:"16px", display:"flex", gap:"20px", flexWrap:"wrap" }}>
                        <div>
                          <div style={{ fontSize:"10px", color:"#6B7A99", textTransform:"uppercase" }}>Total Paid</div>
                          <div style={{ fontWeight:700, fontSize:"18px", color:"#178F78" }}>
                            ₹{paidFees.reduce((s, f) => s + Number(f.paid_amount || f.amount || 0), 0).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize:"10px", color:"#6B7A99", textTransform:"uppercase" }}>Receipts</div>
                          <div style={{ fontWeight:700, fontSize:"18px", color:"#178F78" }}>{paidFees.length}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                        {paidFees.map((f: any) => (
                          <div key={f.id} style={{ border:"1px solid #EDE8DF", borderRadius:"14px", padding:"14px 16px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"10px", flexWrap:"wrap" }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>{f.period_label || f.fee_type || "Fee"}</div>
                                <div style={{ fontSize:"11px", color:"#6B7A99", marginTop:"3px" }}>
                                  {(f.payment_date || f.paid_at) && `Paid: ${new Date(f.payment_date || f.paid_at).toLocaleDateString("en-IN")}`}
                                  {f.payment_mode && ` · ${f.payment_mode.toUpperCase()}`}
                                </div>
                                {(f.receipt_number || f.receipt_no) && (
                                  <div style={{ fontSize:"10px", color:"#6366F1", marginTop:"2px", fontFamily:"monospace" }}>#{f.receipt_number || f.receipt_no}</div>
                                )}
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"6px" }}>
                                <div style={{ fontWeight:700, fontSize:"18px", color:"#178F78" }}>
                                  ₹{Number(f.paid_amount || f.amount || 0).toLocaleString("en-IN")}
                                </div>
                                <span style={{ fontSize:"9px", fontWeight:700, background:"rgba(23,143,120,0.1)", color:"#178F78", borderRadius:"20px", padding:"2px 8px", textTransform:"uppercase" }}>
                                  {f.status}
                                </span>
                                <button
                                  onClick={() => printReceipt(f)}
                                  style={{ display:"flex", alignItems:"center", gap:"4px", background:"transparent", border:"1px solid #EDE8DF", borderRadius:"10px", padding:"4px 10px", fontSize:"10px", fontWeight:600, color:"#6B7A99", cursor:"pointer", whiteSpace:"nowrap" as const }}>
                                  🖨️ Receipt
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ══ MEDICAL TAB ══ */}
            {tab === "medical" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>🩺 Medical Records</div>
                <div style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"16px" }}>Health information for {selectedChild.child_name}. Kept confidential and shared only with school staff.</div>
                <ChildMedicalTab
                  enquiryId={selectedChild.id}
                  childName={selectedChild.child_name}
                  updatedBy={session?.phone || "parent"}
                />
              </div>
            )}

            {/* ══ PICKUP AUTHORIZATION TAB ══ */}
            {tab === "pickup" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>🚗 Pickup Authorization</div>
                <div style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"16px" }}>People authorized to collect {selectedChild.child_name} from school.</div>
                <PickupAuthTab
                  enquiryId={selectedChild.id}
                  childName={selectedChild.child_name}
                  addedBy={session?.phone || "parent"}
                />
              </div>
            )}

            {/* ══ DOCUMENTS TAB ══ */}
            {tab === "documents" && sbClient && (
              <ParentDocumentsTab
                child={selectedChild}
                supabase={sbClient}
                parentName={session?.childName ? `${selectedChild.child_name}'s Parent` : (session?.phone || "Parent")}
              />
            )}

            {/* ══ KIT & BOOKS TAB ══ */}
            {tab === "kit" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>🎒 Kit & Books</div>
                <div style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"16px" }}>
                  Track what books, uniform and items have been issued to {selectedChild.child_name}. Add a comment if anything is missing.
                </div>
                <KitChecklist
                  enquiryId={selectedChild.id}
                  childName={selectedChild.child_name}
                  programmeId={selectedChild.program_id || "nursery"}
                  mode="parent"
                  issuedBy={session?.phone || "Parent"}
                />
              </div>
            )}

            {/* ══ TRANSPORT TAB ══ */}
            {tab === "transport" && (
              <TransportParentView fixedChild={selectedChild} session={session} />
            )}

            {/* ══ REFERRALS TAB ══ */}
            {tab === "referrals" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>🎁 Refer a Friend</div>
                <div style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"16px" }}>Refer friends to Evergreen and earn rewards when they enroll!</div>
                <ReferralTab enquiryId={selectedChild.id} referrerName={session?.parent_name || session?.name || ""} />
              </div>
            )}

            {/* ══ INCIDENTS TAB ══ */}
            {tab === "incidents" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"16px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>🚨 Incident Reports</div>
                <div style={{ fontSize:"12px", color:"#6B7A99", marginBottom:"16px" }}>View any incidents reported involving {selectedChild.child_name}.</div>
                <IncidentLog enquiryId={selectedChild.id} childName={selectedChild.child_name} />
              </div>
            )}

            {/* ══ ASK SCHOOL AI TAB ══ */}
            {tab === "askschool" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", overflow:"hidden" }}>
                <ParentKBChat childName={selectedChild?.child_name} phone={session?.phone} />
              </div>
            )}

            {/* ══ AUDIO OVERVIEWS TAB ══ */}
            {tab === "audio" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", overflow:"hidden" }}>
                <AudioPlayer />
              </div>
            )}

            {tab === "community" && (
              <CommunityTab userType="parent" userRef={session?.phone || ""} displayName={session?.parent_name || session?.childName || session?.name || "Parent"} />
            )}

            {tab === "reels" && (
              <ReelComposer role="parent" phone={session?.phone || ""} />
            )}

            {/* ══ PROFILE TAB ══ */}
            {tab === "profile" && (
              <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
                <div style={{ textAlign:"center", marginBottom:"20px" }}>
                  <div style={{ position:"relative", width:"90px", margin:"0 auto 10px" }}>
                    {selectedChild.photo_url
                      ? <img src={selectedChild.photo_url} alt={selectedChild.child_name} style={{ width:"90px", height:"90px", borderRadius:"50%", objectFit:"cover", border:"3px solid #178F78" }} />
                      : <div style={{ width:"90px", height:"90px", borderRadius:"50%", background:"linear-gradient(135deg,rgba(232,105,74,0.2),rgba(23,143,120,0.2))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"36px", border:"3px solid #EDE8DF" }}>{prog?.icon||"🧒"}</div>
                    }
                    {profileUploading && (
                      <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <div style={{ width:"24px", height:"24px", border:"3px solid rgba(255,255,255,0.3)", borderTopColor:"white", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                      </div>
                    )}
                    <label htmlFor="profile-photo-input" style={{ position:"absolute", bottom:0, right:0, width:"28px", height:"28px", borderRadius:"50%", background:profileUploading?"#ccc":"#178F78", border:"2px solid white", display:"flex", alignItems:"center", justifyContent:"center", cursor:profileUploading?"not-allowed":"pointer", fontSize:"14px" }}>📷</label>
                    <input id="profile-photo-input" type="file" accept="image/*" style={{ display:"none" }} disabled={profileUploading}
                      onChange={async (e) => {
                        const file=e.target.files?.[0]; if(!file) return;
                        setProfileUploading(true); setProfileError("");
                        try {
                          const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
                          const fileName=`profiles/${selectedChild.id}.${ext}`;
                          const sb=await getSb();
                          const {error:storageErr}=await sb.storage.from("school-photos").upload(fileName,file,{contentType:file.type,upsert:true});
                          if(storageErr){setProfileError(storageErr.message);setProfileUploading(false);return;}
                          const {data:urlData}=sb.storage.from("school-photos").getPublicUrl(fileName);
                          const photoUrl=urlData.publicUrl+`?t=${Date.now()}`;
                          const res=await fetch("/api/photos/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enquiryId:selectedChild.id,photoUrl})});
                          const data=await res.json();
                          if(data.error){setProfileError(data.error);}else{
                            setChildren(prev=>prev.map(c=>c.id===selectedChild.id?{...c,photo_url:photoUrl}:c));
                            setSelected((p:any)=>({...p,photo_url:photoUrl}));
                          }
                        } catch(err:any){setProfileError(err?.message||"Upload failed");}
                        setProfileUploading(false); e.target.value="";
                      }} />
                  </div>
                  <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"20px", fontWeight:700, color:"#178F78" }}>{selectedChild.child_name}</div>
                  <div style={{ fontSize:"12px", color:"#6B7A99" }}>{selectedChild.program_label}{selectedChild.section_name&&` · ${selectedChild.section_name}`}</div>
                  <div style={{ fontSize:"10px", color:profileUploading?"#F5B829":"#178F78", marginTop:"4px" }}>{profileUploading?"⏳ Uploading photo…":"📷 Tap camera icon to update photo"}</div>
                  {profileError&&<div style={{ marginTop:"8px", background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", borderRadius:"10px", padding:"7px 12px", fontSize:"11px", color:"#DC2626" }}>❌ {profileError}</div>}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                  {[
                    ["🎂","Date of Birth",selectedChild.child_dob?new Date(selectedChild.child_dob).toLocaleDateString("en-IN"):"—"],
                    ["📏","Age",selectedChild.child_age_months?`${Math.floor(selectedChild.child_age_months/12)} yr ${selectedChild.child_age_months%12} mo`:"—"],
                    ["📚","Programme",selectedChild.program_label||"—"],
                    ["🏫","Section",selectedChild.section_name||"Not assigned yet"],
                    ["📊","Status",selectedChild.status||"Enquired"],
                    ["📞","Parent Phone",session?.phone||"—"],
                  ].map(([icon,label,value])=>(
                    <div key={String(label)} style={{ background:"#FAF0E8", borderRadius:"14px", padding:"12px" }}>
                      <div style={{ fontSize:"16px", marginBottom:"4px" }}>{icon}</div>
                      <div style={{ fontSize:"10px", color:"#6B7A99", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
                      <div style={{ fontSize:"13px", fontWeight:700, color:"#1A2F4A", marginTop:"2px", textTransform:"capitalize" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setPwModalOpen(true)} style={{ width:"100%", marginTop:"20px", padding:"11px", borderRadius:"20px", background:"rgba(23,143,120,0.08)", border:"1px solid rgba(23,143,120,0.25)", color:"#178F78", fontWeight:700, fontSize:"13px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                  🔐 Change Password
                </button>
                <button onClick={logout} style={{ width:"100%", marginTop:"10px", padding:"11px", borderRadius:"20px", background:"rgba(220,38,38,0.08)", border:"1px solid rgba(220,38,38,0.2)", color:"#DC2626", fontWeight:700, fontSize:"13px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                  <LogOut style={{ width:"16px", height:"16px" }} /> Logout
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ChangePasswordModal
        open={pwModalOpen}
        phone={session?.phone}
        onClose={() => setPwModalOpen(false)}
        onSuccess={onPwChanged}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ai-pulse {
          0%,100% { box-shadow: 0 0 14px rgba(137,87,229,0.7), 0 2px 8px rgba(0,0,0,0.2); }
          50%      { box-shadow: 0 0 28px rgba(137,87,229,1),   0 4px 16px rgba(0,0,0,0.25); }
        }
      `}</style>
    </div>
  );
}
