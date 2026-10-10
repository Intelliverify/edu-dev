import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sectionId, sectionName, title, description, dueDate, subject, assignedBy, attachments, audioKeywords } = body;
    if (!sectionId || !title) return NextResponse.json({ error: "Missing required fields" }, { status: 400 }); // dueDate optional

    const row: any = {
      section_id: sectionId, section_name: sectionName, title,
      description: description || null, due_date: dueDate || null, subject,
      assigned_by: assignedBy || null,
      attachments: Array.isArray(attachments) ? attachments : [],
    };
    if (audioKeywords) row.audio_keywords = audioKeywords;

    // resilient insert: if a newer column is missing on this DB, retry without it
    let { data, error } = await sb().from("homework").insert(row).select().single();
    if (error && /audio_keywords|attachments/i.test(error.message)) {
      delete row.audio_keywords; delete row.attachments;
      ({ data, error } = await sb().from("homework").insert(row).select().single());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, title, description, dueDate, subject, attachments, audioKeywords } = body;
    if (!id || !title) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const row: any = {
      title,
      description: description || null,
      due_date: dueDate || null,
      subject,
      attachments: Array.isArray(attachments) ? attachments : [],
    };
    if (audioKeywords !== undefined) row.audio_keywords = audioKeywords || null;

    // resilient update: drop newer columns if this DB doesn't have them
    let { data, error } = await sb().from("homework").update(row).eq("id", id).select().single();
    if (error && /audio_keywords|attachments/i.test(error.message)) {
      delete row.audio_keywords; delete row.attachments;
      ({ data, error } = await sb().from("homework").update(row).eq("id", id).select().single());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const { error } = await sb().from("homework").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
