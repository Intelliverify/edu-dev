"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { LogOut, Plus, Trash2, MessageSquare, Send, Clock, Pencil } from "lucide-react";
import PhotoUploader from "@/components/PhotoUploader";
import FaceAutoTagger from "@/components/FaceAutoTagger";
import TeacherKitTab from "@/components/TeacherKitTab";
import TransportStaffView from "@/components/TransportStaffView";
import IncidentLog from "@/components/IncidentLog";
import BirthdayPanel from "@/components/BirthdayPanel";
import PTMScheduler from "@/components/PTMScheduler";
import StaffTrainingChat from "@/components/StaffTrainingChat";
import CommunityTab from "@/components/CommunityTab";
import ReelComposer from "@/components/ReelComposer";
import RichText from "@/components/RichText";
import { getSubjectTheme } from "@/lib/subjectTheme";
import { uploadHomeworkFile } from "@/lib/uploadHomeworkFile";

type TeacherTab = "attendance" | "homework" | "students" | "photos" | "reels" | "kit" | "messages" | "transport" | "incidents" | "birthdays" | "ptm" | "training" | "community";

const TD_TABS = [
  { key: "attendance" as TeacherTab, icon: "📅", label: "Attendance" },
  { key: "homework"   as TeacherTab, icon: "📚", label: "Homework"   },
  { key: "students"   as TeacherTab, icon: "👶", label: "Students"   },
  { key: "photos"     as TeacherTab, icon: "📸", label: "Photos"     },
  { key: "reels"      as TeacherTab, icon: "🎬", label: "Reels"      },
  { key: "kit"        as TeacherTab, icon: "🎒", label: "Kit"        },
  { key: "messages"   as TeacherTab, icon: "💬", label: "Messages"   },
  { key: "transport"  as TeacherTab, icon: "🚌", label: "Transport"  },
  { key: "incidents"  as TeacherTab, icon: "🚨", label: "Incidents"  },
  { key: "birthdays"  as TeacherTab, icon: "🎂", label: "Birthdays"  },
  { key: "ptm"        as TeacherTab, icon: "📅", label: "PTM"        },
  { key: "training"   as TeacherTab, icon: "🎓", label: "Training"   },
  { key: "community"  as TeacherTab, icon: "👪", label: "Community"  },
];

const ATT_STATUS = [
  { key:"present", label:"Present", color:"#178F78", bg:"rgba(23,143,120,0.1)", icon:"✅" },
  { key:"absent",  label:"Absent",  color:"#E8694A", bg:"rgba(232,105,74,0.1)",  icon:"❌" },
  { key:"late",    label:"Late",    color:"#F5B829", bg:"rgba(245,184,41,0.12)", icon:"⏰" },
];
export default function TeacherDashboardPage() {
  const router = useRouter();
  const [session, setSession]         = useState<any>(null);
  const [tab, setTab]                 = useState<TeacherTab>("attendance");
  const [teacherSections, setTeacherSections] = useState<any[]>([]);
  const [currentSectionId, setCurrentSectionId] = useState<string>("");
  const [children, setChildren]       = useState<any[]>([]);
  const [attendance, setAtt]          = useState<Record<string, string>>({});
  const [homework, setHomework]       = useState<any[]>([]);
  const [photos, setPhotos]           = useState<any[]>([]);
  // undefined = loading | null = role not in staff_roles (show all) | string[] = role found
  const [permissions, setPermissions] = useState<string[] | null | undefined>(undefined);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState<string | null>(null);
  const [attSaved, setAttSaved]       = useState(false);

  // New homework form
  const [showHWForm, setShowHWForm] = useState(false);
  const [hwForm, setHWForm] = useState({ title:"", subject:"", description:"", dueDate:"", keywords:"" });
  const [hwFiles, setHWFiles] = useState<any[]>([]);          // teacher attachments for the new homework
  const [hwUploading, setHWUploading] = useState(false);
  const [hwStatuses, setHWStatuses] = useState<Record<string, any[]>>({}); // homework_id → parent responses
  const [hwReply, setHWReply] = useState<Record<string, string>>({});      // status row id → reply draft
  const [hwExpanded, setHWExpanded] = useState<string | null>(null);
  const [hwSaving, setHWSaving]   = useState(false);
  const [hwEditId, setHWEditId]   = useState<string | null>(null);   // homework id being edited (null = creating)
  const hwDescRef = useRef<HTMLTextAreaElement>(null);               // for the rich-text toolbar

  // Attendance history state
  const [showAttHistory, setShowAttHistory] = useState(false);
  const [attHistory, setAttHistory]         = useState<any[]>([]);
  const [attHistChildren, setAttHistChildren] = useState<any[]>([]);
  const [histLoading, setHistLoading]       = useState(false);
  const [histFrom, setHistFrom]             = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  });
  const [histTo, setHistTo] = useState(new Date().toISOString().split("T")[0]);

  // Messages state
  const [msgSubject, setMsgSubject]   = useState("");
  const [msgBody, setMsgBody]         = useState("");
  const [msgSending, setMsgSending]   = useState(false);
  const [msgSent, setMsgSent]         = useState(false);
  const [sentMessages, setSentMessages] = useState<any[]>([]);
  const [msgLoading, setMsgLoading]   = useState(false);

  // Clock in/out state
  const [clockRecord, setClockRecord] = useState<any>(null);
  const [clockLoading, setClockLoading] = useState(false);

  // Medical records (keyed by enquiry_id) — loaded when students tab opens
  const [medicalMap, setMedicalMap]   = useState<Record<string, any>>({});
  const [medExpanded, setMedExpanded] = useState<string | null>(null);

  // Pickup authorizations (keyed by enquiry_id)
  const [pickupMap, setPickupMap]       = useState<Record<string, any[]>>({});
  const [pickupExpanded, setPickupExp]  = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const todayFmt = new Date().toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

  // Fetch medical + pickup records for all children when Students tab opens
  useEffect(() => {
    if (tab !== "students" || children.length === 0) return;
    Promise.all(
      children.map(c =>
        fetch(`/api/medical?enquiryId=${c.id}`).then(r => r.json()).then(d => ({ id: c.id, data: d })).catch(() => ({ id: c.id, data: null }))
      )
    ).then(results => {
      const map: Record<string, any> = {};
      results.forEach(r => { if (r.data) map[r.id] = r.data; });
      setMedicalMap(map);
    });
    Promise.all(
      children.map(c =>
        fetch(`/api/pickup?enquiryId=${c.id}`).then(r => r.json()).then(d => ({ id: c.id, data: d })).catch(() => ({ id: c.id, data: [] }))
      )
    ).then(results => {
      const map: Record<string, any[]> = {};
      results.forEach(r => { map[r.id] = Array.isArray(r.data) ? r.data : []; });
      setPickupMap(map);
    });
  }, [tab, children]);

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    const s = localStorage.getItem("ep_teacher_session");
    if (!s) { router.replace("/teacher-login"); return; }
    const parsed = JSON.parse(s);
    if (Date.now() - parsed.loginTime > 12 * 60 * 60 * 1000) {
      localStorage.removeItem("ep_teacher_session"); router.replace("/teacher-login"); return;
    }
    setSession(parsed);
  }, [router]);

  // ── Load permissions ──────────────────────────────────
  useEffect(() => {
    if (!session) return;
    fetch("/api/teacher/permissions")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setPermissions(null); return; } // fetch failed → treat as unrestricted
        // d.permissions: null = role not in DB (unrestricted), array = role found
        const perms: string[] | null = d.permissions;
        setPermissions(perms);
        if (Array.isArray(perms)) {
          const tdPerms = perms.filter((p: string) => p.startsWith("td:"));
          if (tdPerms.length > 0) {
            // Switch to first visible tab if current one is restricted
            setTab(cur => {
              if (perms.includes(`td:${cur}`)) return cur;
              const first = TD_TABS.find(t => perms.includes(`td:${t.key}`));
              return first ? first.key : cur;
            });
          }
        }
      })
      .catch(() => setPermissions(null));
  }, [session]);

  // ── Auto-redirect to admin if no TD tabs but has admin access ────────────
  useEffect(() => {
    if (!Array.isArray(permissions)) return;
    const hasTd    = permissions.some(p => p.startsWith("td:"));
    const hasAdmin = permissions.some(p => !p.startsWith("td:"));
    if (!hasTd && hasAdmin) router.replace("/admin");
  }, [permissions, router]);

  // ── Load teacher's assigned sections ─────────────────
  useEffect(() => {
    if (!session) return;
    fetch("/api/teacher/sections")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setLoading(false); return; }
        const secs = d.sections || [];
        setTeacherSections(secs);
        if (secs.length > 0) {
          // Prefer session.sectionId if it's in the list, else first
          const preferred = secs.find((s: any) => s.id === session.sectionId) || secs[0];
          setCurrentSectionId(preferred.id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [session]);

  // ── Load data ─────────────────────────────────────────
  const loadData = useCallback(async (sectionId: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/teacher/dashboard?sectionId=${sectionId}`);
      const d = await r.json();
      setChildren(d.children || []);
      setHomework(d.homework  || []);
      setPhotos(d.photos      || []);
      const attMap: Record<string, string> = {};
      (d.attendance || []).forEach((a: any) => { attMap[a.student_id] = a.status; });
      setAtt(attMap);
    } catch { /* ignore, just stop spinner */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (currentSectionId) loadData(currentSectionId);
  }, [currentSectionId, loadData]);

  // Real-time sync: reload when parent or another teacher changes data
  useEffect(() => {
    if (!currentSectionId) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !key) return;
    const sb = createClient(url, key);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => loadData(currentSectionId), 800); };

    const ch = sb.channel("teacher-dash-realtime")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "attendance" }, debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "homework" }, debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "section_photos" }, debounced)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "enquiries" }, debounced)
      .subscribe();

    return () => { if (timer) clearTimeout(timer); sb.removeChannel(ch); };
  }, [currentSectionId, loadData]);

  // Load clock record for today
  const loadClockRecord = useCallback(async (name: string) => {
    const r = await fetch(`/api/teacher/clock?staffName=${encodeURIComponent(name)}`);
    if (r.ok) { const d = await r.json(); setClockRecord(d.record); }
  }, []);

  useEffect(() => {
    if (session?.name) loadClockRecord(session.name);
  }, [session, loadClockRecord]);

  // Load sent messages
  const loadMessages = useCallback(async (name: string) => {
    setMsgLoading(true);
    const r = await fetch(`/api/teacher/messages?teacherName=${encodeURIComponent(name)}`);
    if (r.ok) { const d = await r.json(); setSentMessages(d.messages || []); }
    setMsgLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "messages" && session?.name) loadMessages(session.name);
  }, [tab, session, loadMessages]);

  const logout = async () => {
    localStorage.removeItem("ep_teacher_session");
    await fetch("/api/teacher/logout", { method: "POST" }).catch(() => {});
    router.push("/teacher-login");
  };

  const loadAttHistory = useCallback(async () => {
    if (!session?.sectionId) return;
    setHistLoading(true);
    const r = await fetch(`/api/teacher/attendance?sectionId=${currentSectionId}&from=${histFrom}&to=${histTo}`);
    const d = await r.json();
    setAttHistory(d.attendance || []);
    setAttHistChildren(d.children || []);
    setHistLoading(false);
  }, [session, histFrom, histTo]);

  // ── Mark attendance ───────────────────────────────────
  const markAtt = async (childId: string, status: string) => {
    setSaving(childId);
    const prev = attendance[childId];
    setAtt(p => ({ ...p, [childId]: status }));  // optimistic update
    try {
      const res = await fetch("/api/teacher/attendance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: childId, date: today, status }),
      });
      if (!res.ok) {
        setAtt(p => ({ ...p, [childId]: prev }));  // revert on failure
        const d = await res.json().catch(() => ({}));
        alert(`Failed to save attendance: ${d.error || res.statusText}`);
      }
    } catch {
      setAtt(p => ({ ...p, [childId]: prev }));  // revert on network error
    }
    setSaving(null);
  };

  const saveAllAttendance = async () => {
    setSaving("all");
    for (const child of children) {
      if (!attendance[child.id]) {
        await fetch("/api/teacher/attendance", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: child.id, date: today, status: "present" }),
        });
      }
    }
    setAttSaved(true);
    setSaving(null);
    setTimeout(() => setAttSaved(false), 3000);
  };

  // ── Assign / edit homework ────────────────────────────
  const resetHWForm = () => {
    setHWForm({ title:"", subject:"", description:"", dueDate:"", keywords:"" });
    setHWFiles([]);
    setHWEditId(null);
  };

  const assignHW = async () => {
    if (!hwForm.title) return;
    setHWSaving(true);
    if (hwEditId) {
      await fetch("/api/teacher/homework", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:          hwEditId,
          title:       hwForm.title,
          subject:     hwForm.subject,
          description: hwForm.description,
          dueDate:     hwForm.dueDate || null,
          attachments: hwFiles,
          audioKeywords: hwForm.keywords || null,
        }),
      });
    } else {
      await fetch("/api/teacher/homework", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId:   currentSectionId,
          sectionName: currentSectionName,
          title:       hwForm.title,
          subject:     hwForm.subject,
          description: hwForm.description,
          dueDate:     hwForm.dueDate || null,
          assignedBy:  session.name,
          attachments: hwFiles,
          audioKeywords: hwForm.keywords || null,
        }),
      });
    }
    resetHWForm();
    setShowHWForm(false);
    setHWSaving(false);
    loadData(currentSectionId);
  };

  // Open the form pre-filled to edit an existing homework
  const startEditHW = (hw: any) => {
    setHWEditId(hw.id);
    setHWForm({
      title:       hw.title || "",
      subject:     hw.subject || "",
      description: hw.description || "",
      dueDate:     (hw.due_date || "").slice(0, 10),
      keywords:    hw.audio_keywords || "",
    });
    setHWFiles(Array.isArray(hw.attachments) ? hw.attachments : []);
    setShowHWForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Rich-text toolbar: wrap the current description selection with markers
  const wrapHWDesc = (left: string, right: string = left) => {
    const ta = hwDescRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const val = hwForm.description;
    const sel = val.slice(s, e) || "text";
    const next = val.slice(0, s) + left + sel + right + val.slice(e);
    setHWForm(p => ({ ...p, description: next }));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + left.length, s + left.length + sel.length); }, 0);
  };

  // Upload a teacher attachment (image / pdf / video) for the new homework
  const uploadHWFile = async (file: File) => {
    setHWUploading(true);
    const uploaded = await uploadHomeworkFile(file);
    if (uploaded) setHWFiles(f => [...f, uploaded]);
    setHWUploading(false);
  };

  // Parent responses (status / doubts) for the loaded homework
  const loadHWStatuses = async (hwList: any[]) => {
    const ids = (hwList || []).map(h => h.id).filter(Boolean);
    if (!ids.length) { setHWStatuses({}); return; }
    try {
      const res = await fetch(`/api/teacher/homework/status?homeworkIds=${ids.join(",")}`);
      const rows = await res.json();
      const map: Record<string, any[]> = {};
      (Array.isArray(rows) ? rows : []).forEach((r: any) => { (map[r.homework_id] ??= []).push(r); });
      setHWStatuses(map);
    } catch {}
  };

  const replyToDoubt = async (rowId: string) => {
    const reply = (hwReply[rowId] || "").trim();
    if (!reply) return;
    await fetch("/api/teacher/homework/status", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rowId, reply }),
    });
    setHWReply(d => ({ ...d, [rowId]: "" }));
    loadHWStatuses(homework);
  };

  useEffect(() => { loadHWStatuses(homework); /* refresh responses when homework list changes */ }, [homework]);

  const deleteHW = async (id: string) => {
    if (!confirm("Delete this homework?")) return;
    await fetch("/api/teacher/homework", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadData(currentSectionId);
  };

  // ── Send message to owner ─────────────────────────────
  const sendMessage = async () => {
    if (!msgSubject.trim() || !msgBody.trim()) return;
    setMsgSending(true);
    await fetch("/api/teacher/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_teacher_id: session.id,
        from_teacher_name: session.name,
        from_section: currentSectionName,
        subject: msgSubject.trim(),
        message: msgBody.trim(),
      }),
    });
    setMsgSubject(""); setMsgBody(""); setMsgSent(true);
    setTimeout(() => setMsgSent(false), 3000);
    setMsgSending(false);
    loadMessages(session.name);
  };

  // ── Clock in / out ────────────────────────────────────
  const handleClock = async (action: "in" | "out") => {
    setClockLoading(true);
    await fetch("/api/teacher/clock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, staff_id: session.id, staff_name: session.name }),
    });
    loadClockRecord(session.name);
    setClockLoading(false);
  };

  const inp = { border:"1px solid #EDE8DF", borderRadius:"10px", padding:"9px 12px", fontSize:"13px", outline:"none", background:"#FAF0E8", fontFamily:"'Quicksand',sans-serif", width:"100%", boxSizing:"border-box" as const };

  const currentSection = teacherSections.find(s => s.id === currentSectionId) || null;
  const currentSectionName = currentSection?.name || session?.sectionName || "";
  const currentProgLabel   = currentSection?.program_label || session?.programLabel || "";

  const presentCount = Object.values(attendance).filter(s => s === "present").length;
  const absentCount  = Object.values(attendance).filter(s => s === "absent").length;
  const markedCount  = Object.values(attendance).length;

  // undefined (loading) or null (role not in DB) → show all tabs
  // string[] → show only what's configured for this role (may be empty)
  // transport is always visible for all staff regardless of permissions
  const visibleTabs = Array.isArray(permissions)
    ? TD_TABS.filter(t => t.key === "transport" || permissions.includes(`td:${t.key}`))
    : TD_TABS;

  // True only when role is found AND has at least one non-td: permission
  const hasAdminAccess = Array.isArray(permissions) && permissions.some(p => !p.startsWith("td:"));

  if (!session) return null;

  return (
    <div style={{ minHeight:"100vh", background:"#F0F4F8", fontFamily:"'Quicksand',sans-serif" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1A2F4A,#0f6b5a)", padding:"14px 20px" }}>
        <div style={{ maxWidth:"900px", margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"18px", fontWeight:700, color:"white" }}>
                👩‍🏫 {session.name}
              </div>
              {session.role && (
                <span style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:"20px", padding:"2px 10px", fontSize:"11px", fontWeight:700, color:"rgba(255,255,255,0.9)", letterSpacing:"0.03em" }}>
                  {session.role}
                </span>
              )}
              {currentSectionName && (
                <span style={{ background:"rgba(23,143,120,0.35)", border:"1px solid rgba(23,143,120,0.5)", borderRadius:"20px", padding:"2px 10px", fontSize:"11px", fontWeight:700, color:"#7EFCE1" }}>
                  {currentSectionName}
                </span>
              )}
            </div>
            <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.55)", marginTop:"4px" }}>
              {currentProgLabel ? `${currentProgLabel} · ` : ""}{todayFmt}
            </div>
          </div>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            {hasAdminAccess && (
              <a href="/admin" style={{ display:"flex", alignItems:"center", gap:"5px", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:"20px", padding:"6px 14px", color:"white", fontSize:"12px", fontWeight:600, textDecoration:"none" }}>
                🏢 Admin Panel
              </a>
            )}
            <button onClick={() => router.push("/ai-tools/teacher")}
              style={{ display:"flex", alignItems:"center", gap:"6px", background:"linear-gradient(135deg,#178F78,#0F766E)", border:"2px solid rgba(255,255,255,0.35)", borderRadius:"20px", padding:"7px 12px", color:"white", fontSize:"12px", fontWeight:700, cursor:"pointer", fontFamily:"'Quicksand',sans-serif" }}>
              <span style={{ fontSize:"15px" }}>🤖</span>
              <span className="hidden sm:inline">AI Tools</span>
            </button>
            <button onClick={logout} style={{ display:"flex", alignItems:"center", gap:"6px", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:"20px", padding:"7px 12px", color:"white", fontSize:"12px", fontWeight:600, cursor:"pointer" }}>
              <LogOut style={{ width:"13px", height:"13px" }} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Section switcher — shown only when teacher has multiple sections */}
      {teacherSections.length > 1 && (
        <div style={{ background:"#1A2F4A", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ maxWidth:"900px", margin:"0 auto", padding:"8px 20px", display:"flex", alignItems:"center", gap:"8px" }}>
            <span style={{ fontSize:"11px", color:"rgba(255,255,255,0.5)", fontWeight:700, marginRight:"4px" }}>SECTION:</span>
            {teacherSections.map(s => (
              <button key={s.id} onClick={() => setCurrentSectionId(s.id)}
                style={{ padding:"5px 14px", borderRadius:"20px", border:`1.5px solid ${s.id===currentSectionId?"rgba(23,143,120,0.8)":"rgba(255,255,255,0.15)"}`, background:s.id===currentSectionId?"rgba(23,143,120,0.25)":"transparent", color:s.id===currentSectionId?"#7EFCE1":"rgba(255,255,255,0.6)", fontSize:"12px", fontWeight:700, cursor:"pointer", fontFamily:"'Quicksand',sans-serif" }}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div style={{ background:"white", borderBottom:"1px solid #EDE8DF" }}>
        <div style={{ maxWidth:"900px", margin:"0 auto", padding:"12px 16px", display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"8px" }}>
          {[
            { icon:"👶", label:"Total Students", value:children.length, color:"#178F78" },
            { icon:"✅", label:"Present Today",  value:presentCount,     color:"#178F78" },
            { icon:"❌", label:"Absent Today",   value:absentCount,      color:"#E8694A" },
            { icon:"📚", label:"Homework Active",value:homework.length,  color:"#6366F1" },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center", padding:"10px", background:"#FAF0E8", borderRadius:"14px" }}>
              <div style={{ fontSize:"18px", marginBottom:"2px" }}>{s.icon}</div>
              <div style={{ fontSize:"20px", fontWeight:700, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:"10px", color:"#6B7A99" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs — only render when there are visible tabs */}
      {visibleTabs.length > 0 && (
        <div style={{ background:"white", borderBottom:"1px solid #EDE8DF" }}>
          <div style={{ maxWidth:"900px", margin:"0 auto", display:"flex", flexWrap:"wrap", justifyContent:"center" }}>
            {visibleTabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex:"1 0 auto", minWidth:"76px", maxWidth:"110px", padding:"13px 8px", border:"none", borderBottom:`3px solid ${tab===t.key?"#178F78":"transparent"}`, background:"transparent", fontWeight:700, fontSize:"12px", color:tab===t.key?"#178F78":"#6B7A99", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"3px", touchAction:"manipulation" }}>
                <span style={{ fontSize:"18px" }}>{t.icon}</span>
                <span style={{ fontSize:"10px" }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No staff dashboard tabs configured for this role */}
      {Array.isArray(permissions) && visibleTabs.length === 0 && (
        <div style={{ maxWidth:"900px", margin:"40px auto", padding:"0 16px" }}>
          <div style={{ textAlign:"center", padding:"48px 32px", background:"white", borderRadius:"20px", border:"1px solid #EDE8DF" }}>
            <div style={{ fontSize:"40px", marginBottom:"12px" }}>🔒</div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"18px", fontWeight:700, color:"#1A2F4A", marginBottom:"8px" }}>No Staff Dashboard Tabs</div>
            <div style={{ fontSize:"13px", color:"#6B7A99", lineHeight:1.6 }}>
              Your role ({session.role}) has not been assigned any staff dashboard tabs.
              {hasAdminAccess && <><br/>Please use the <strong style={{ color:"#178F78" }}>Admin Panel</strong> button above.</>}
              {!hasAdminAccess && <><br/>Contact the school owner to configure access for your role.</>}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth:"900px", margin:"0 auto", padding:"16px" }}>

        {/* ══ ATTENDANCE TAB ══ */}
        {tab === "attendance" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"17px", fontWeight:700, color:"#1A2F4A" }}>
                {showAttHistory ? "Attendance History" : "Today's Attendance"}
              </div>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                {!showAttHistory && (
                  <>
                    <span style={{ fontSize:"11px", color:"#6B7A99" }}>{markedCount}/{children.length} marked</span>
                    <button onClick={saveAllAttendance} disabled={saving==="all"}
                      style={{ background:"#178F78", color:"white", border:"none", borderRadius:"12px", padding:"7px 16px", fontSize:"12px", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:"5px" }}>
                      {saving==="all" ? "Saving…" : attSaved ? "✅ Saved!" : "Mark All Present"}
                    </button>
                  </>
                )}
                <button onClick={() => {
                  setShowAttHistory(p => !p);
                  if (!showAttHistory) loadAttHistory();
                }} style={{ background: showAttHistory ? "#1A2F4A" : "rgba(26,47,74,0.08)", color: showAttHistory ? "white" : "#1A2F4A", border:"none", borderRadius:"12px", padding:"7px 14px", fontSize:"11px", fontWeight:700, cursor:"pointer" }}>
                  {showAttHistory ? "← Today" : "📊 History"}
                </button>
              </div>
            </div>

            {/* ── Attendance History View ── */}
            {showAttHistory && (
              <div>
                <div style={{ display:"flex", gap:"10px", marginBottom:"14px", flexWrap:"wrap", alignItems:"center" }}>
                  <div>
                    <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"3px" }}>FROM</label>
                    <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
                      style={{ border:"1px solid #EDE8DF", borderRadius:"8px", padding:"7px 10px", fontSize:"12px", background:"#FAF0E8", outline:"none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"3px" }}>TO</label>
                    <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
                      style={{ border:"1px solid #EDE8DF", borderRadius:"8px", padding:"7px 10px", fontSize:"12px", background:"#FAF0E8", outline:"none" }} />
                  </div>
                  <button onClick={loadAttHistory} disabled={histLoading}
                    style={{ background:"#178F78", color:"white", border:"none", borderRadius:"10px", padding:"7px 16px", fontSize:"12px", fontWeight:700, cursor:"pointer", alignSelf:"flex-end" }}>
                    {histLoading ? "Loading…" : "Apply"}
                  </button>
                  <button onClick={() => {
                    const csv = ["Date,Child,Status",
                      ...attHistory.map(a => {
                        const child = attHistChildren.find(c => c.id === a.student_id);
                        return `${a.date},"${child?.child_name || a.student_id}",${a.status}`;
                      })
                    ].join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url  = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url; link.download = `attendance-${histFrom}-to-${histTo}.csv`; link.click();
                    URL.revokeObjectURL(url);
                  }} style={{ background:"rgba(99,102,241,0.1)", color:"#6366F1", border:"none", borderRadius:"10px", padding:"7px 14px", fontSize:"12px", fontWeight:700, cursor:"pointer", alignSelf:"flex-end" }}>
                    ⬇ Export CSV
                  </button>
                </div>

                {histLoading ? (
                  <div style={{ textAlign:"center", padding:"30px", color:"#6B7A99" }}>Loading…</div>
                ) : attHistory.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"30px", color:"#6B7A99", background:"white", borderRadius:"14px", border:"1px solid #EDE8DF" }}>No attendance records for this period.</div>
                ) : (() => {
                  const dates = [...new Set(attHistory.map(a => a.date))].sort((a, b) => b.localeCompare(a));
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                      {dates.map(date => {
                        const dayRecs = attHistory.filter(a => a.date === date);
                        const present = dayRecs.filter(a => a.status === "present").length;
                        const absent  = dayRecs.filter(a => a.status === "absent").length;
                        const late    = dayRecs.filter(a => a.status === "late").length;
                        return (
                          <div key={date} style={{ background:"white", borderRadius:"14px", border:"1px solid #EDE8DF", padding:"12px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                              <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>
                                {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" })}
                              </div>
                              <div style={{ display:"flex", gap:"8px", fontSize:"11px" }}>
                                <span style={{ color:"#178F78", fontWeight:700 }}>✅ {present}</span>
                                <span style={{ color:"#E8694A", fontWeight:700 }}>❌ {absent}</span>
                                {late > 0 && <span style={{ color:"#F5B829", fontWeight:700 }}>⏰ {late}</span>}
                              </div>
                            </div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:"5px" }}>
                              {dayRecs.map(a => {
                                const child = attHistChildren.find(c => c.id === a.student_id);
                                const icon  = a.status === "present" ? "✅" : a.status === "absent" ? "❌" : "⏰";
                                return (
                                  <span key={a.id} style={{ fontSize:"10px", fontWeight:600, background:"#FAF0E8", borderRadius:"20px", padding:"2px 8px", color:"#1A2F4A" }}>
                                    {icon} {child?.child_name || "—"}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {!showAttHistory && loading ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#6B7A99" }}>Loading students…</div>
            ) : !showAttHistory && children.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#6B7A99", background:"white", borderRadius:"16px", border:"1px solid #EDE8DF" }}>
                <div style={{ fontSize:"32px", marginBottom:"8px" }}>👶</div>
                {currentSectionId
                  ? <>No students assigned to <strong>{currentSectionName}</strong> yet. Admin needs to assign children to this section.</>
                  : <>No class section assigned to your account yet.<br/>Please contact the admin to assign you to a section.</>
                }
              </div>
            ) : !showAttHistory ? (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {children.map(child => {
                  const attStatus = attendance[child.id];
                  return (
                    <div key={child.id} style={{ background:"white", borderRadius:"16px", border:`2px solid ${attStatus==="present"?"rgba(23,143,120,0.25)":attStatus==="absent"?"rgba(232,105,74,0.25)":attStatus==="late"?"rgba(245,184,41,0.25)":"#EDE8DF"}`, padding:"12px 16px", display:"flex", alignItems:"center", gap:"12px" }}>
                      <div style={{ width:"40px", height:"40px", borderRadius:"50%", background:"linear-gradient(135deg,rgba(23,143,120,0.15),rgba(232,105,74,0.15))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px", flexShrink:0 }}>🧒</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:"14px", color:"#1A2F4A" }}>{child.child_name}</div>
                        <div style={{ fontSize:"11px", color:"#6B7A99" }}>
                          {child.child_age_months ? `${Math.floor(child.child_age_months/12)}y ${child.child_age_months%12}m` : ""} · 📞 {child.phone}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:"6px" }}>
                        {ATT_STATUS.map(s => (
                          <button key={s.key} onClick={() => markAtt(child.id, s.key)}
                            disabled={saving===child.id}
                            style={{ display:"flex", alignItems:"center", gap:"4px", padding:"5px 10px", borderRadius:"20px", border:`1.5px solid ${attStatus===s.key?s.color:"#EDE8DF"}`, background:attStatus===s.key?s.bg:"white", color:attStatus===s.key?s.color:"#6B7A99", fontSize:"11px", fontWeight:attStatus===s.key?700:400, cursor:"pointer", transition:"all 0.15s" }}>
                            <span>{s.icon}</span> {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {/* ══ HOMEWORK TAB ══ */}
        {tab === "homework" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
              <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"17px", fontWeight:700, color:"#1A2F4A" }}>Homework — {currentSectionName}</div>
              <button onClick={() => { if (showHWForm) { setShowHWForm(false); resetHWForm(); } else { resetHWForm(); setShowHWForm(true); } }}
                style={{ display:"flex", alignItems:"center", gap:"6px", background:"#178F78", color:"white", border:"none", borderRadius:"12px", padding:"7px 16px", fontSize:"12px", fontWeight:700, cursor:"pointer" }}>
                <Plus style={{ width:"13px", height:"13px" }} /> Assign Homework
              </button>
            </div>

            {/* Homework form */}
            {showHWForm && (
              <div style={{ background:"white", borderRadius:"16px", border:"2px solid #178F78", padding:"18px", marginBottom:"14px" }}>
                <div style={{ fontWeight:700, fontSize:"14px", color:"#178F78", marginBottom:"14px" }}>{hwEditId ? "✏️ Edit Homework" : "New Homework"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:"10px", marginBottom:"10px" }}>
                  <div>
                    <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"4px" }}>TITLE *</label>
                    <input value={hwForm.title} onChange={e => setHWForm(p=>({...p,title:e.target.value}))} style={inp} placeholder="e.g. Draw your family" />
                  </div>
                  <div>
                    <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"4px" }}>SUBJECT</label>
                    <input value={hwForm.subject} onChange={e => setHWForm(p=>({...p,subject:e.target.value}))} style={inp} placeholder="Art, Math, English…" />
                  </div>
                  <div>
                    <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"4px" }}>DUE DATE (optional)</label>
                    <input type="date" value={hwForm.dueDate} onChange={e => setHWForm(p=>({...p,dueDate:e.target.value}))} style={inp} min={today} />
                  </div>
                </div>
                <div style={{ marginBottom:"12px" }}>
                  <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"4px" }}>DESCRIPTION (optional)</label>
                  <div style={{ display:"flex", gap:"6px", marginBottom:"6px" }}>
                    <button type="button" onClick={() => wrapHWDesc("**")} title="Bold"
                      style={{ fontWeight:800, fontSize:"13px", width:"30px", height:"28px", borderRadius:"8px", border:"1px solid #EDE8DF", background:"#FAF0E8", cursor:"pointer", color:"#1A2F4A" }}>B</button>
                    <button type="button" onClick={() => wrapHWDesc("*")} title="Italic"
                      style={{ fontStyle:"italic", fontSize:"13px", width:"30px", height:"28px", borderRadius:"8px", border:"1px solid #EDE8DF", background:"#FAF0E8", cursor:"pointer", color:"#1A2F4A" }}>i</button>
                    <button type="button" onClick={() => wrapHWDesc("==")} title="Highlight"
                      style={{ fontSize:"13px", height:"28px", padding:"0 8px", borderRadius:"8px", border:"1px solid #EDE8DF", background:"#FEF9C3", cursor:"pointer", color:"#1A2F4A" }}>Highlight</button>
                  </div>
                  <textarea ref={hwDescRef} value={hwForm.description} onChange={e => setHWForm(p=>({...p,description:e.target.value}))}
                    style={{ ...inp, minHeight:"80px", resize:"vertical", lineHeight:1.5 }}
                    placeholder={"Add details or instructions…\nUse the buttons above or type **bold**, *italic*, ==highlight==. Press Enter for a new line."} />
                  <div style={{ fontSize:"10px", color:"#6B7A99", marginTop:"4px" }}>Tip: select text then tap <b>B</b> / <i>i</i> / Highlight. New lines are kept.</div>
                </div>
                <div style={{ marginBottom:"12px" }}>
                  <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"4px" }}>KEEP IN ENGLISH — e.g. 1 to 10, A B C (optional)</label>
                  <input value={hwForm.keywords} onChange={e => setHWForm(p=>({...p,keywords:e.target.value}))} style={inp} placeholder="Words/phrases that must NOT be translated in the audio" />
                </div>
                <div style={{ marginBottom:"12px" }}>
                  <label style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"4px" }}>ATTACHMENTS — image / pdf / video (optional)</label>
                  <input type="file" accept="image/*,application/pdf,video/*"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadHWFile(f); e.currentTarget.value=""; }}
                    style={{ fontSize:"12px" }} />
                  {hwUploading && <span style={{ fontSize:"11px", color:"#6B7A99", marginLeft:"8px" }}>Uploading…</span>}
                  {hwFiles.length > 0 && (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"8px" }}>
                      {hwFiles.map((f,i) => (
                        <span key={i} style={{ fontSize:"11px", background:"#EEF8F6", color:"#178F78", borderRadius:"8px", padding:"3px 8px" }}>
                          📎 {f.name || `file ${i+1}`}
                          <span onClick={() => setHWFiles(arr => arr.filter((_,j)=>j!==i))} style={{ cursor:"pointer", color:"#DC2626", marginLeft:"6px", fontWeight:700 }}>✕</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", gap:"8px" }}>
                  <button onClick={assignHW} disabled={hwSaving||!hwForm.title}
                    style={{ background:"#178F78", color:"white", border:"none", borderRadius:"10px", padding:"8px 18px", fontSize:"12px", fontWeight:700, cursor:"pointer", opacity: hwSaving||!hwForm.title ? 0.6 : 1 }}>
                    {hwSaving ? "Saving…" : hwEditId ? "Save Changes" : "Assign to Class"}
                  </button>
                  <button onClick={() => { setShowHWForm(false); resetHWForm(); }} style={{ background:"#EDE8DF", color:"#6B7A99", border:"none", borderRadius:"10px", padding:"8px 14px", fontSize:"12px", cursor:"pointer" }}>Cancel</button>
                </div>
              </div>
            )}

            {homework.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#6B7A99", background:"white", borderRadius:"16px", border:"1px solid #EDE8DF" }}>
                <div style={{ fontSize:"32px", marginBottom:"8px" }}>📚</div>
                No homework assigned yet. Click "Assign Homework" to add one.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {homework.map(hw => {
                  const isPast = hw.due_date ? new Date(hw.due_date) < new Date() : false;
                  const th = getSubjectTheme(hw.subject);
                  const isNew = hw.created_at && Date.now() - new Date(hw.created_at).getTime() < 2 * 864e5;
                  const sts: any[] = hwStatuses[hw.id] || [];
                  const doneCount = sts.filter(r => r.status === "done").length;
                  const doubts = sts.filter(r => r.parent_doubt);
                  const tFiles: string[] = [
                    ...(Array.isArray(hw.attachments) ? hw.attachments.map((a: any) => a?.url).filter(Boolean) : []),
                    ...(hw.file_url ? [hw.file_url] : []),
                  ];
                  const open = hwExpanded === hw.id;
                  return (
                    <div key={hw.id} style={{ background:"white", borderRadius:"16px", border:`1px solid ${isPast?"rgba(232,105,74,0.25)":"#EDE8DF"}`, borderLeft:`5px solid ${th.color}`, padding:"14px 16px", display:"flex", flexDirection:"column", gap:"10px", boxShadow:"0 2px 10px rgba(26,47,74,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", gap:"12px" }}>
                        <div style={{ width:"44px", height:"44px", borderRadius:"14px", background:th.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", flexShrink:0 }}>{th.emoji}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"6px", flexWrap:"wrap", marginBottom:"3px" }}>
                            {hw.subject && <span style={{ fontSize:"10px", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.04em", color:th.color, background:th.bg, borderRadius:"20px", padding:"3px 9px" }}>{hw.subject}</span>}
                            {isNew && <span style={{ fontSize:"9px", fontWeight:800, color:"#fff", background:"#E8694A", borderRadius:"20px", padding:"3px 8px" }}>NEW</span>}
                            {isPast && <span style={{ fontSize:"9px", fontWeight:800, color:"#fff", background:"#DC2626", borderRadius:"20px", padding:"3px 8px" }}>PAST DUE</span>}
                          </div>
                          <div style={{ fontFamily:"'Fredoka',sans-serif", fontWeight:700, fontSize:"16px", color:"#1A2F4A", lineHeight:1.25 }}><RichText text={hw.title} accent={th.color} /></div>
                          {hw.description && <div style={{ fontSize:"12.5px", color:"#55617A", marginTop:"5px", lineHeight:1.5 }}><RichText text={hw.description} accent={th.color} /></div>}
                          <div style={{ fontSize:"11px", color:"#6B7A99", fontWeight:700, marginTop:"7px" }}>
                            {hw.due_date
                              ? <>📅 Due <span style={{ color:isPast?"#E8694A":"#178F78" }}>{new Date(hw.due_date).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span></>
                              : <span>📌 No due date</span>}
                          </div>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:"6px", flexShrink:0 }}>
                          <button onClick={() => startEditHW(hw)} title="Edit" style={{ background:th.bg, border:"none", borderRadius:"8px", padding:"7px", cursor:"pointer", color:th.color }}>
                            <Pencil style={{ width:"14px", height:"14px" }} />
                          </button>
                          <button onClick={() => deleteHW(hw.id)} title="Delete" style={{ background:"rgba(220,38,38,0.08)", border:"none", borderRadius:"8px", padding:"7px", cursor:"pointer", color:"#DC2626" }}>
                            <Trash2 style={{ width:"14px", height:"14px" }} />
                          </button>
                        </div>
                      </div>

                      {tFiles.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                          {tFiles.map((u, i) => (
                            <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize:"11px", background:"#EEF8F6", color:"#178F78", borderRadius:"8px", padding:"3px 8px", textDecoration:"none" }}>📎 Attachment {i + 1}</a>
                          ))}
                        </div>
                      )}

                      <div onClick={() => setHWExpanded(open ? null : hw.id)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", borderTop:"1px solid #EDE8DF", paddingTop:"8px" }}>
                        <span style={{ fontSize:"12px", fontWeight:700, color:"#1A2F4A" }}>✓ {doneCount} done · {doubts.length} doubt{doubts.length === 1 ? "" : "s"}</span>
                        <span style={{ fontSize:"11px", color:"#6B7A99" }}>{open ? "▲ hide" : "▼ responses"}</span>
                      </div>

                      {open && (
                        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                          {sts.length === 0 ? (
                            <div style={{ fontSize:"11px", color:"#6B7A99", fontStyle:"italic" }}>No parent responses yet.</div>
                          ) : sts.map((r: any) => (
                            <div key={r.id} style={{ background:"#FAFAFA", borderRadius:"10px", padding:"10px" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <span style={{ fontSize:"12px", fontWeight:700, color:"#1A2F4A" }}>{r.child_name || "Child"}</span>
                                <span style={{ fontSize:"10px", fontWeight:700, borderRadius:"12px", padding:"1px 8px", background:r.status === "done" ? "#16A34A" : "#FEF3C7", color:r.status === "done" ? "white" : "#92400E" }}>{r.status === "done" ? "Done" : "Pending"}</span>
                              </div>
                              {r.proof_file_url && <a href={r.proof_file_url} target="_blank" rel="noreferrer" style={{ fontSize:"11px", color:"#178F78", display:"inline-block", marginTop:"4px" }}>🖼 View proof</a>}
                              {r.parent_doubt && (
                                <div style={{ marginTop:"6px" }}>
                                  <div style={{ fontSize:"12px", color:"#1A2F4A" }}>❓ {r.parent_doubt}</div>
                                  {r.doubt_file_url && <a href={r.doubt_file_url} target="_blank" rel="noreferrer" style={{ fontSize:"11px", color:"#178F78" }}>📎 Attachment</a>}
                                  {r.teacher_reply ? (
                                    <div style={{ fontSize:"11px", color:"#178F78", marginTop:"4px", fontWeight:600 }}>↳ You: {r.teacher_reply}</div>
                                  ) : (
                                    <div style={{ display:"flex", gap:"6px", marginTop:"6px" }}>
                                      <input value={hwReply[r.id] || ""} onChange={e => setHWReply(d => ({ ...d, [r.id]: e.target.value }))} placeholder="Reply…" style={{ flex:1, fontSize:"12px", border:"1px solid #EDE8DF", borderRadius:"8px", padding:"6px 8px" }} />
                                      <button onClick={() => replyToDoubt(r.id)} style={{ background:"#178F78", color:"white", border:"none", borderRadius:"8px", padding:"6px 12px", fontSize:"12px", fontWeight:700, cursor:"pointer" }}>Send</button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STUDENTS TAB ══ */}
        {tab === "students" && (
          <div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"17px", fontWeight:700, color:"#1A2F4A", marginBottom:"14px" }}>
              Students — {currentSectionName} ({children.length})
            </div>
            {children.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#6B7A99", background:"white", borderRadius:"16px", border:"1px solid #EDE8DF" }}>
                <div style={{ fontSize:"32px", marginBottom:"8px" }}>👶</div>
                {currentSectionId ? "No students assigned to this section yet." : "No class section assigned. Contact admin to assign you to a section."}
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:"10px" }}>
                {children.map(child => {
                  const attToday  = attendance[child.id];
                  const med       = medicalMap[child.id];
                  const allergies = med?.allergies || [];
                  const contacts  = med?.emergency_contacts || [];
                  const isMedOpen = medExpanded === child.id;
                  const hasAlert  = allergies.length > 0 || med?.medical_conditions;
                  const SEV_COLOR: Record<string,string> = { mild:"#F5B829", moderate:"#E8694A", severe:"#DC2626" };
                  return (
                    <div key={child.id} style={{ background:"white", borderRadius:"16px", border:`1px solid ${hasAlert ? "rgba(220,38,38,0.25)" : "#EDE8DF"}`, padding:"14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"10px" }}>
                        <div style={{ width:"44px", height:"44px", borderRadius:"50%", background:"linear-gradient(135deg,rgba(232,105,74,0.2),rgba(23,143,120,0.2))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", flexShrink:0 }}>🧒</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:"14px", color:"#1A2F4A" }}>{child.child_name}</div>
                          <div style={{ fontSize:"10px", color:"#6B7A99" }}>
                            {child.child_age_months ? `${Math.floor(child.child_age_months/12)}y ${child.child_age_months%12}m` : "Age not set"}
                          </div>
                          {/* Allergy / medical alert badges */}
                          {hasAlert && (
                            <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", marginTop:"4px" }}>
                              {allergies.length > 0 && (
                                <span style={{ fontSize:"9px", fontWeight:700, background:"rgba(220,38,38,0.1)", color:"#DC2626", borderRadius:"20px", padding:"2px 7px" }}>
                                  ⚠️ {allergies.length} allerg{allergies.length > 1 ? "ies" : "y"}
                                </span>
                              )}
                              {med?.medical_conditions && (
                                <span style={{ fontSize:"9px", fontWeight:700, background:"rgba(245,184,41,0.15)", color:"#B08000", borderRadius:"20px", padding:"2px 7px" }}>🏥 Condition</span>
                              )}
                              {med?.blood_group && med.blood_group !== "unknown" && (
                                <span style={{ fontSize:"9px", fontWeight:700, background:"rgba(220,38,38,0.08)", color:"#DC2626", borderRadius:"20px", padding:"2px 7px" }}>🩸 {med.blood_group}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {attToday && (
                          <div style={{ fontSize:"18px", flexShrink:0 }}>
                            {attToday==="present"?"✅":attToday==="absent"?"❌":"⏰"}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
                        <div style={{ background:"#FAF0E8", borderRadius:"10px", padding:"7px 10px" }}>
                          <div style={{ fontSize:"9px", color:"#6B7A99", textTransform:"uppercase", letterSpacing:"0.05em" }}>Phone</div>
                          <div style={{ fontSize:"11px", fontWeight:700, color:"#1A2F4A" }}>{child.phone}</div>
                        </div>
                        <div style={{ background:"#FAF0E8", borderRadius:"10px", padding:"7px 10px" }}>
                          <div style={{ fontSize:"9px", color:"#6B7A99", textTransform:"uppercase", letterSpacing:"0.05em" }}>Status</div>
                          <div style={{ fontSize:"11px", fontWeight:700, color:"#178F78", textTransform:"capitalize" }}>{child.status || "Enquired"}</div>
                        </div>
                      </div>

                      {/* Medical detail toggle — show if any health info exists */}
                      {med && (
                        <button
                          onClick={() => setMedExpanded(isMedOpen ? null : child.id)}
                          style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", width:"100%", marginTop:"8px", background: hasAlert ? "rgba(220,38,38,0.07)" : "rgba(23,143,120,0.07)", border:`1px solid ${hasAlert ? "rgba(220,38,38,0.2)" : "rgba(23,143,120,0.2)"}`, borderRadius:"10px", padding:"7px", fontSize:"11px", fontWeight:700, color: hasAlert ? "#DC2626" : "#178F78", cursor:"pointer" }}>
                          🩺 {isMedOpen ? "Hide" : "View"} Health Info {hasAlert ? "⚠️" : ""}
                        </button>
                      )}

                      {/* Expanded medical detail (read-only) */}
                      {isMedOpen && med && (
                        <div style={{ marginTop:"10px", padding:"12px", background:"#FEFCF8", borderRadius:"12px", border:"1px solid #EDE8DF" }}>
                          {allergies.length > 0 && (
                            <div style={{ marginBottom:"10px" }}>
                              <div style={{ fontSize:"10px", fontWeight:700, color:"#DC2626", textTransform:"uppercase", marginBottom:"6px" }}>⚠️ Allergies</div>
                              {allergies.map((a: any, i: number) => (
                                <div key={i} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px" }}>
                                  <span style={{ fontSize:"11px", fontWeight:700, color:"#1A2F4A", textTransform:"capitalize" }}>{a.name}</span>
                                  <span style={{ fontSize:"9px", color:"#6B7A99", textTransform:"capitalize" }}>{a.type}</span>
                                  <span style={{ fontSize:"9px", fontWeight:700, background:`${SEV_COLOR[a.severity] || "#6B7A99"}18`, color:SEV_COLOR[a.severity] || "#6B7A99", borderRadius:"20px", padding:"1px 6px", textTransform:"capitalize" }}>{a.severity}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {med.medical_conditions && (
                            <div style={{ marginBottom:"10px" }}>
                              <div style={{ fontSize:"10px", fontWeight:700, color:"#B08000", textTransform:"uppercase", marginBottom:"4px" }}>🏥 Medical Conditions</div>
                              <div style={{ fontSize:"12px", color:"#1A2F4A" }}>{med.medical_conditions}</div>
                            </div>
                          )}
                          {contacts.length > 0 && (
                            <div>
                              <div style={{ fontSize:"10px", fontWeight:700, color:"#6366F1", textTransform:"uppercase", marginBottom:"6px" }}>📞 Emergency Contacts</div>
                              {contacts.map((c: any, i: number) => (
                                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" }}>
                                  <span style={{ fontSize:"11px", fontWeight:700, color:"#1A2F4A" }}>{c.name} <span style={{ fontWeight:400, color:"#6B7A99" }}>({c.relation})</span></span>
                                  <a href={`tel:${c.phone}`} style={{ fontSize:"11px", fontWeight:700, color:"#178F78", textDecoration:"none" }}>{c.phone}</a>
                                </div>
                              ))}
                            </div>
                          )}
                          {med.special_needs && (
                            <div style={{ marginTop:"8px" }}>
                              <div style={{ fontSize:"10px", fontWeight:700, color:"#6B7A99", textTransform:"uppercase", marginBottom:"4px" }}>🍽️ Special Needs</div>
                              <div style={{ fontSize:"12px", color:"#1A2F4A" }}>{med.special_needs}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pickup authorization info */}
                      {(() => {
                        const pickups = (pickupMap[child.id] || []).filter((p: any) => p.is_active);
                        const isPickupOpen = pickupExpanded === child.id + "-pickup";
                        return (
                          <>
                            <button
                              onClick={() => setPickupExp(isPickupOpen ? null : child.id + "-pickup")}
                              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", width:"100%", marginTop:"8px", background:"rgba(99,102,241,0.07)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:"10px", padding:"7px", fontSize:"11px", fontWeight:700, color:"#6366F1", cursor:"pointer" }}>
                              🚗 {isPickupOpen ? "Hide" : "View"} Pickup Auth {pickups.length > 0 ? `(${pickups.length})` : ""}
                            </button>
                            {isPickupOpen && (
                              <div style={{ marginTop:"8px", padding:"10px 12px", background:"rgba(99,102,241,0.04)", borderRadius:"12px", border:"1px solid rgba(99,102,241,0.15)" }}>
                                {pickups.length === 0 ? (
                                  <div style={{ fontSize:"11px", color:"#9CA3AF", textAlign:"center", padding:"8px 0" }}>No authorized pickup persons on record.</div>
                                ) : pickups.map((p: any) => (
                                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px" }}>
                                    <span style={{ fontSize:"18px" }}>👤</span>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:"12px", fontWeight:700, color:"#1A2F4A" }}>{p.authorized_name} <span style={{ fontWeight:400, color:"#6B7A99" }}>({p.relation})</span></div>
                                      <a href={`tel:${p.phone}`} style={{ fontSize:"11px", color:"#178F78", fontWeight:600, textDecoration:"none" }}>{p.phone}</a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}

                      <a href={`https://wa.me/91${child.phone}`} target="_blank" rel="noopener noreferrer"
                        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", marginTop:"8px", background:"rgba(37,211,102,0.1)", border:"1px solid rgba(37,211,102,0.25)", borderRadius:"10px", padding:"7px", color:"#128C7E", fontSize:"11px", fontWeight:700, textDecoration:"none" }}>
                        💬 Message Parent
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ KIT TAB ══ */}
        {tab === "kit" && (
          <div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"17px", fontWeight:700, color:"#1A2F4A", marginBottom:"14px" }}>🎒 Kit & Books — {currentSectionName}</div>
            <TeacherKitTab sectionChildren={children} teacherName={session.name} />
          </div>
        )}

        {/* ══ PHOTOS TAB ══ */}
        {tab === "photos" && (
          <div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"17px", fontWeight:700, color:"#1A2F4A", marginBottom:"14px" }}>📸 Class Photos — {currentSectionName}</div>

            <PhotoUploader
              sectionId={currentSectionId}
              sectionName={currentSectionName}
              uploadedBy={session.name}
              uploadedByRole="teacher"
              children={children}
              onUploaded={() => loadData(currentSectionId)}
            />

            <div style={{ marginTop:"16px" }}>
              {photos.length === 0 ? (
                <div style={{ textAlign:"center", padding:"24px", color:"#6B7A99", background:"white", borderRadius:"16px", border:"1px solid #EDE8DF" }}>
                  <div style={{ fontSize:"28px", marginBottom:"6px" }}>📷</div>
                  No photos yet. Upload above!
                </div>
              ) : (
                <div>
                  {photos.map((p: any) => (
                    <FaceAutoTagger key={p.id} photo={p} sectionId={currentSectionId}
                      children={children} onSaved={() => loadData(currentSectionId)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "reels" && (
          <div style={{ background:"white", borderRadius:"20px", border:"1px solid #EDE8DF", padding:"20px" }}>
            <ReelComposer role="teacher" sectionId={currentSectionId} schoolName="Evergreen Preschool" />
          </div>
        )}

        {/* ══ MESSAGES TAB ══ */}
        {tab === "messages" && (
          <div>
            <div style={{ fontFamily:"'Fredoka',sans-serif", fontSize:"17px", fontWeight:700, color:"#1A2F4A", marginBottom:"16px" }}>💬 Messages to Owner</div>

            {/* Clock in/out */}
            <div style={{ background:"white", border:"1px solid #EDE8DF", borderRadius:"16px", padding:"16px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"16px" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>Staff Attendance — Today</div>
                {clockRecord ? (
                  <div style={{ fontSize:"12px", color:"#6B7A99", marginTop:"4px" }}>
                    Clock In: <strong>{clockRecord.clock_in ? new Date(clockRecord.clock_in).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}</strong>
                    {" · "}
                    Clock Out: <strong>{clockRecord.clock_out ? new Date(clockRecord.clock_out).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}</strong>
                  </div>
                ) : (
                  <div style={{ fontSize:"12px", color:"#6B7A99", marginTop:"4px" }}>Not clocked in yet</div>
                )}
              </div>
              <button
                onClick={() => handleClock("in")}
                disabled={clockLoading || !!clockRecord?.clock_in}
                style={{ padding:"9px 18px", borderRadius:"12px", border:"none", background: clockRecord?.clock_in ? "#E8F5F0" : "#178F78", color: clockRecord?.clock_in ? "#178F78" : "white", fontWeight:700, fontSize:"12px", cursor: clockRecord?.clock_in ? "default" : "pointer", fontFamily:"'Quicksand',sans-serif" }}
              >
                {clockRecord?.clock_in ? "✅ Clocked In" : "🕐 Clock In"}
              </button>
              <button
                onClick={() => handleClock("out")}
                disabled={clockLoading || !clockRecord?.clock_in || !!clockRecord?.clock_out}
                style={{ padding:"9px 18px", borderRadius:"12px", border:"none", background: clockRecord?.clock_out ? "#FEF3E8" : clockRecord?.clock_in ? "#E8694A" : "rgba(0,0,0,0.07)", color: clockRecord?.clock_out ? "#E8694A" : clockRecord?.clock_in ? "white" : "#999", fontWeight:700, fontSize:"12px", cursor: (!clockRecord?.clock_in || !!clockRecord?.clock_out) ? "default" : "pointer", fontFamily:"'Quicksand',sans-serif" }}
              >
                {clockRecord?.clock_out ? "✅ Clocked Out" : "🕐 Clock Out"}
              </button>
            </div>

            {/* New message form */}
            <div style={{ background:"white", border:"1px solid #EDE8DF", borderRadius:"16px", padding:"20px", marginBottom:"20px" }}>
              <div style={{ fontWeight:700, fontSize:"14px", color:"#1A2F4A", marginBottom:"14px" }}>Send Message to Owner</div>
              {msgSent && (
                <div style={{ background:"rgba(23,143,120,0.1)", border:"1px solid rgba(23,143,120,0.3)", borderRadius:"10px", padding:"10px 14px", color:"#178F78", fontSize:"13px", marginBottom:"12px" }}>
                  Message sent successfully!
                </div>
              )}
              <div style={{ marginBottom:"12px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.05em" }}>Subject *</label>
                <input value={msgSubject} onChange={e => setMsgSubject(e.target.value)} placeholder="e.g. Maintenance issue in classroom" style={inp} />
              </div>
              <div style={{ marginBottom:"16px" }}>
                <label style={{ fontSize:"11px", fontWeight:700, color:"#6B7A99", display:"block", marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.05em" }}>Message *</label>
                <textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} placeholder="Describe the issue or update…" rows={4} style={{ ...inp, resize:"vertical" }} />
              </div>
              <button
                onClick={sendMessage}
                disabled={msgSending || !msgSubject.trim() || !msgBody.trim()}
                style={{ display:"flex", alignItems:"center", gap:"8px", padding:"10px 20px", borderRadius:"12px", border:"none", background: msgSending || !msgSubject.trim() || !msgBody.trim() ? "#E8E0D8" : "#178F78", color: msgSending || !msgSubject.trim() || !msgBody.trim() ? "#999" : "white", fontWeight:700, fontSize:"13px", cursor: msgSending ? "wait" : "pointer", fontFamily:"'Quicksand',sans-serif" }}
              >
                <Send size={14} /> {msgSending ? "Sending…" : "Send to Owner"}
              </button>
            </div>

            {/* Sent messages history */}
            <div style={{ fontWeight:700, fontSize:"14px", color:"#1A2F4A", marginBottom:"12px" }}>Sent Messages</div>
            {msgLoading ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#6B7A99" }}>Loading…</div>
            ) : sentMessages.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px", color:"#6B7A99", background:"white", borderRadius:"16px", border:"1px solid #EDE8DF" }}>No messages sent yet</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                {sentMessages.map((m: any) => (
                  <div key={m.id} style={{ background:"white", border:"1px solid #EDE8DF", borderRadius:"14px", padding:"16px" }}>
                    <div style={{ fontWeight:700, fontSize:"13px", color:"#1A2F4A" }}>{m.subject}</div>
                    <div style={{ fontSize:"11px", color:"#6B7A99", marginTop:"2px", marginBottom:"10px" }}>
                      {new Date(m.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
                      {" · "}{m.read_by_owner ? "✅ Read" : "⏳ Unread"}
                    </div>
                    <div style={{ fontSize:"13px", color:"#4A5568", background:"#FAF0E8", borderRadius:"8px", padding:"10px", lineHeight:1.6 }}>{m.message}</div>
                    {m.owner_reply && (
                      <div style={{ marginTop:"10px", borderLeft:"3px solid #178F78", paddingLeft:"12px" }}>
                        <div style={{ fontSize:"11px", fontWeight:700, color:"#178F78", marginBottom:"4px" }}>Owner replied:</div>
                        <div style={{ fontSize:"13px", color:"#4A5568", lineHeight:1.6 }}>{m.owner_reply}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TRANSPORT TAB ══ */}
        {tab === "transport" && (
          <TransportStaffView session={session} />
        )}

        {/* ══ INCIDENTS TAB ══ */}
        {tab === "incidents" && (
          <div style={{ maxWidth:"900px", margin:"0 auto", padding:"16px" }}>
            <IncidentLog sectionName={session?.section_name} />
          </div>
        )}

        {/* ══ BIRTHDAYS TAB ══ */}
        {tab === "birthdays" && (
          <div style={{ maxWidth:"900px", margin:"0 auto", padding:"16px" }}>
            <BirthdayPanel days={30} />
          </div>
        )}

        {/* ══ PTM TAB ══ */}
        {tab === "ptm" && (
          <div style={{ maxWidth:"900px", margin:"0 auto", padding:"16px" }}>
            <PTMScheduler />
          </div>
        )}

        {/* ══ TRAINING TAB ══ */}
        {tab === "training" && (
          <div style={{ maxWidth:"900px", margin:"0 auto", padding:"16px" }}>
            <StaffTrainingChat />
          </div>
        )}

        {tab === "community" && (
          <CommunityTab userType="teacher" userRef={session?.username || session?.name || "teacher"} displayName={session?.name || "Teacher"} />
        )}

      </div>

      <style>{`
        @keyframes ai-pulse {
          0%,100% { box-shadow: 0 0 14px rgba(23,143,120,0.7), 0 2px 8px rgba(0,0,0,0.2); }
          50%      { box-shadow: 0 0 28px rgba(23,143,120,1),   0 4px 16px rgba(0,0,0,0.25); }
        }
      `}</style>
    </div>
  );
}
