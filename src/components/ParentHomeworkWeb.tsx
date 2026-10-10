"use client";
import { useEffect, useRef, useState } from "react";
import RichText from "@/components/RichText";
import { getSubjectTheme } from "@/lib/subjectTheme";
import { uploadHomeworkFile } from "@/lib/uploadHomeworkFile";

async function uploadFile(file: File): Promise<string | null> {
  const uploaded = await uploadHomeworkFile(file);
  return uploaded?.url || null;
}

function FileLink({ url, label }: { url: string; label: string }) {
  return <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, background: "#EEF8F6", color: "#178F78", borderRadius: 8, padding: "3px 8px", textDecoration: "none", marginRight: 6 }}>📎 {label}</a>;
}

function Card({ hw, st, enquiryId, childName, onChanged }: { hw: any; st: any | null; enquiryId: string; childName: string; onChanged: () => void; }) {
  const [busy, setBusy]     = useState(false);
  const [doubt, setDoubt]   = useState(st?.parent_doubt || "");
  const [doubtFile, setDoubtFile] = useState<string | null>(st?.doubt_file_url || null);
  const [audioUrl, setAudioUrl]   = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const proofPick = useRef<HTMLInputElement>(null);
  const proofCam  = useRef<HTMLInputElement>(null);
  const doubtPick = useRef<HTMLInputElement>(null);
  const doubtCam  = useRef<HTMLInputElement>(null);

  const done = st?.status === "done";
  const th = getSubjectTheme(hw.subject);
  const isNew = hw.created_at && Date.now() - new Date(hw.created_at).getTime() < 2 * 864e5;
  const pastDue = !done && hw.due_date && new Date(hw.due_date) < new Date(new Date().toDateString());
  const teacherFiles: string[] = [
    ...(Array.isArray(hw.attachments) ? hw.attachments.map((a: any) => a?.url).filter(Boolean) : []),
    ...(hw.file_url ? [hw.file_url] : []),
  ];

  const save = async (patch: any) => {
    setBusy(true);
    await fetch("/api/parent/homework-status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkId: hw.id, enquiryId, childName, ...patch }),
    });
    setBusy(false); onChanged();
  };

  const onProof = async (f?: File) => { if (!f) return; setBusy(true); const url = await uploadFile(f); setBusy(false); if (url) save({ proofFileUrl: url, status: "done" }); };
  const onDoubtFile = async (f?: File) => { if (!f) return; setBusy(true); const url = await uploadFile(f); setBusy(false); if (url) setDoubtFile(url); };
  const sendDoubt = () => { if (!doubt.trim() && !doubtFile) return; save({ parentDoubt: doubt.trim() || null, doubtFileUrl: doubtFile }); };

  const listen = async () => {
    setAudioBusy(true);
    try {
      const r = await fetch("/api/audio/for", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "custom", sourceId: hw.id, title: hw.title || hw.subject || "Homework", content: `${hw.title || ""}. ${hw.description || ""}`.trim(), language: "en", keepEnglish: hw.audio_keywords || undefined }),
      });
      const j = await r.json();
      if (j.status === "ready" && j.audio_url) setAudioUrl(j.audio_url); else alert("Audio unavailable right now.");
    } catch { alert("Audio unavailable right now."); }
    setAudioBusy(false);
  };

  const hide = { display: "none" } as const;
  const chip = { fontSize: 12, fontWeight: 700, color: "#178F78", background: "#EEF8F6", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };

  return (
    <div style={{ border: `1px solid ${done ? "rgba(23,143,120,0.25)" : "#EDE8DF"}`, borderLeft: `5px solid ${th.color}`, borderRadius: 18, padding: 16, marginBottom: 12, background: done ? "rgba(23,143,120,0.04)" : "white", boxShadow: "0 2px 10px rgba(26,47,74,0.05)" }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 14, background: th.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{th.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            {hw.subject && <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: th.color, background: th.bg, borderRadius: 20, padding: "3px 9px" }}>{hw.subject}</span>}
            {isNew && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#E8694A", borderRadius: 20, padding: "3px 8px" }}>NEW</span>}
            {pastDue && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 20, padding: "3px 8px" }}>PAST DUE</span>}
          </div>
          <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 16, color: done ? "#6B7A99" : "#1A2F4A", lineHeight: 1.25 }}><RichText text={hw.title} accent={th.color} /></div>
          {hw.description && <div style={{ fontSize: 12.5, color: "#55617A", marginTop: 5, lineHeight: 1.5 }}><RichText text={hw.description} accent={th.color} /></div>}
          <div style={{ fontSize: 11, color: done ? "#178F78" : "#6B7A99", fontWeight: 700, marginTop: 7 }}>
            {done ? "✅ Completed" : (hw.due_date ? `📅 Due ${new Date(hw.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "📌 No due date")}
          </div>
          {teacherFiles.length > 0 && <div style={{ marginTop: 8 }}>{teacherFiles.map((u, i) => <FileLink key={i} url={u} label={`Attachment ${i + 1}`} />)}</div>}
        </div>
        <button onClick={() => save({ status: done ? "pending" : "done" })} disabled={busy}
          style={{ flexShrink: 0, alignSelf: "flex-start", background: done ? "rgba(23,143,120,0.1)" : "#178F78", color: done ? "#178F78" : "white", border: done ? "1px solid rgba(23,143,120,0.3)" : "none", borderRadius: 12, padding: "7px 13px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          {done ? "↩ Undo" : "✅ Done"}
        </button>
      </div>

      {/* Listen */}
      <div style={{ marginTop: 10 }}>
        {audioUrl ? <audio src={audioUrl} controls autoPlay style={{ height: 34, verticalAlign: "middle" }} />
          : <button onClick={listen} disabled={audioBusy} style={chip}>{audioBusy ? "Preparing…" : "🔊 Listen"}</button>}
      </div>

      {/* Proof + capture */}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#6B7A99", fontWeight: 600 }}>Proof:</span>
        {st?.proof_file_url && <FileLink url={st.proof_file_url} label="your proof" />}
        <button onClick={() => proofPick.current?.click()} disabled={busy} style={chip}>📎 File</button>
        <button onClick={() => proofCam.current?.click()} disabled={busy} style={chip}>📷 Camera</button>
        <input ref={proofPick} type="file" accept="image/*,video/*,application/pdf" style={hide} onChange={e => onProof(e.target.files?.[0])} />
        <input ref={proofCam} type="file" accept="image/*" capture="environment" style={hide} onChange={e => onProof(e.target.files?.[0])} />
      </div>

      {/* Doubt */}
      <div style={{ marginTop: 12, borderTop: "1px solid #EDE8DF", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1A2F4A", marginBottom: 6 }}>Ask a doubt</div>
        <textarea value={doubt} onChange={e => setDoubt(e.target.value)} placeholder="Type a question for the teacher…"
          style={{ width: "100%", minHeight: 44, border: "1px solid #EDE8DF", borderRadius: 8, padding: 8, fontSize: 13, resize: "vertical" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button onClick={() => doubtPick.current?.click()} disabled={busy} style={chip}>📎 {doubtFile ? "Attached ✓" : "File"}</button>
          <button onClick={() => doubtCam.current?.click()} disabled={busy} style={chip}>📷 Camera</button>
          <input ref={doubtPick} type="file" accept="image/*,video/*,application/pdf" style={hide} onChange={e => onDoubtFile(e.target.files?.[0])} />
          <input ref={doubtCam} type="file" accept="image/*" capture="environment" style={hide} onChange={e => onDoubtFile(e.target.files?.[0])} />
          <button onClick={sendDoubt} disabled={busy} style={{ marginLeft: "auto", background: "#178F78", color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Send</button>
        </div>
        {st?.teacher_reply
          ? <div style={{ marginTop: 8, background: "#EEF8F6", borderRadius: 8, padding: 8, fontSize: 12, color: "#1A2F4A" }}><b>Teacher:</b> {st.teacher_reply}</div>
          : (st?.parent_doubt ? <div style={{ marginTop: 6, fontSize: 11, color: "#6B7A99", fontStyle: "italic" }}>Sent — waiting for the teacher’s reply.</div> : null)}
      </div>
    </div>
  );
}

export default function ParentHomeworkWeb({ homework, enquiryId, childName }: { homework: any[]; enquiryId: string; childName: string; }) {
  const [statusMap, setStatusMap] = useState<Record<string, any>>({});

  const load = () => {
    if (!enquiryId) return;
    fetch(`/api/parent/homework-status?enquiryId=${enquiryId}`).then(r => r.json()).then((rows) => {
      const m: Record<string, any> = {};
      (Array.isArray(rows) ? rows : []).forEach((r: any) => { m[r.homework_id] = r; });
      setStatusMap(m);
    }).catch(() => {});
  };
  useEffect(load, [enquiryId, homework]);

  if (!homework.length) {
    return <div style={{ background: "rgba(23,143,120,0.06)", border: "1px solid rgba(23,143,120,0.2)", borderRadius: 14, padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#178F78" }}>No homework yet!</div>
    </div>;
  }
  return <>{homework.map((hw: any) => <Card key={hw.id} hw={hw} st={statusMap[hw.id] || null} enquiryId={enquiryId} childName={childName} onChanged={load} />)}</>;
}
