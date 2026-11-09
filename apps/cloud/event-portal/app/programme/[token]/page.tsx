"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Grant = { audience: "AUTHOR" | "REVIEWER" | "SPEAKER"; event_id: string; expires_at: string };
type AuthorFormField = { key: string; label: string; type: "text" | "textarea" | "select" | "multiselect" | "file" | "checkbox"; required?: boolean; options?: string[] };
type SubmissionAuthor = { full_name: string; email: string; affiliation?: string | null; country?: string | null; is_presenter: boolean };
type Submission = { id: string; code: string; title: string; body: string; keywords: string[]; abstract_type: string; topic?: string | null; track?: string | null; form_payload?: Record<string, unknown>; authors: SubmissionAuthor[]; attachments: Array<{ id: string; filename: string; kind: string }>; status: string; version: number; notes_to_author?: string | null; author_confirmation?: string | null };
type SpeakerPortal = { speaker_id: string; event_name: string; first_name: string; last_name: string; email: string; designation?: string | null; affiliation?: string | null; country?: string | null; bio?: string | null; photo_url?: string | null; programme_availability?: Record<string, Array<{ start: string; end: string }>>; programme_custom_fields?: Record<string, unknown>; programme_travel_details?: Record<string, unknown>; version: number; participation: string; sessions: Array<{ id: string; code: string; title: string; start_time: string; end_time: string; room?: string | null; role: string; presentation_title?: string | null; is_confirmed: boolean }> };

export default function ProgrammeAccessPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [grant, setGrant] = useState<Grant | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authorEmail, setAuthorEmail] = useState("");
  const [speaker, setSpeaker] = useState<SpeakerPortal | null>(null);
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [authorFormFields, setAuthorFormFields] = useState<AuthorFormField[]>([]);

  const path = (suffix: string) => `${API_BASE}/api/v1/programme/access/${encodeURIComponent(token)}${suffix}`;
  const load = async () => {
    setError(null);
    const grantResponse = await fetch(path(""));
    if (!grantResponse.ok) throw new Error("This access link is expired, revoked, or unavailable.");
    const nextGrant: Grant = await grantResponse.json();
    if (nextGrant.audience === "REVIEWER") {
      if (!nextGrant.event_id) throw new Error("The reviewer workspace is unavailable.");
      router.replace(`/${encodeURIComponent(nextGrant.event_id)}/review/${encodeURIComponent(token)}`);
      return;
    }
    setGrant(nextGrant);
    const suffix = "/author/submissions";
    if (nextGrant.audience === "SPEAKER") {
      const response = await fetch(path("/speaker"));
      if (!response.ok) throw new Error("Unable to load your speaker workspace.");
      setSpeaker(await response.json());
      return;
    }
    if (nextGrant.audience === "AUTHOR") {
      const callResponse = await fetch(`${API_BASE}/api/v1/programme/events/${nextGrant.event_id}/call-for-abstracts`);
      if (callResponse.ok) {
        const call = await callResponse.json();
        const configured = Array.isArray(call.form_schema?.fields) ? call.form_schema.fields : [];
        setAuthorFormFields(configured.map((field: any) => ({ key: String(field.key || field.name), label: String(field.label || field.name), type: field.type || "text", required: Boolean(field.required), options: Array.isArray(field.options) ? field.options.map(String) : [] })));
      }
    }
    const response = await fetch(path(suffix));
    if (!response.ok) throw new Error("Unable to load your programme workspace.");
    const data = await response.json();
    setSubmissions(data);
  };
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, [token]);

  const submitAbstract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const coauthors = String(form.get("coauthors") || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [full_name, email, affiliation] = line.split(",").map((value) => value.trim());
      return { full_name, email, affiliation: affiliation || null, is_presenter: false };
    });
    const formPayload = Object.fromEntries(authorFormFields.map((field) => [field.key, form.get(field.key)]));
    const response = await fetch(path("/author/submissions"), {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ title: form.get("title"), body: form.get("body"), abstract_type: form.get("abstract_type"), topic: form.get("topic") || null, track: form.get("track") || null, keywords: String(form.get("keywords") || "").split(",").map((value) => value.trim()).filter(Boolean), form_payload: formPayload, authors: [{ full_name: form.get("author_name"), email: authorEmail, is_presenter: true }, ...coauthors] }),
    });
    setBusy(false);
    if (!response.ok) { const detail = await response.json().catch(() => null); setError(detail?.detail?.message || "Your abstract could not be submitted. Check the required fields and call rules."); return; }
    event.currentTarget.reset(); await load();
  };
  const withdraw = async (submission: Submission) => {
    if (!window.confirm("Withdraw this abstract? The organiser will see that it was withdrawn.")) return;
    setBusy(true);
    const response = await fetch(path(`/author/submissions/${submission.id}/withdraw`), { method: "POST", headers: { "If-Match": String(submission.version) } });
    setBusy(false);
    if (!response.ok) { setError("This abstract could not be withdrawn. Refresh to see its latest status."); return; }
    await load();
  };
  const confirmParticipation = async (submission: Submission) => {
    setBusy(true); setError(null);
    const response = await fetch(path(`/author/submissions/${submission.id}/confirm`), { method: "POST", headers: { "If-Match": String(submission.version), "Idempotency-Key": `programme-author-confirm:${submission.id}:${submission.version}` } });
    setBusy(false);
    if (!response.ok) { const detail = await response.json().catch(() => null); setError(detail?.detail?.message || "This accepted place could not be confirmed."); return; }
    await load();
  };

  const uploadAttachment = async (submission: Submission, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null);
    const body = new FormData(); body.append("file", file);
    const response = await fetch(path(`/author/submissions/${submission.id}/attachments/upload`), { method: "POST", headers: { "Idempotency-Key": `public-abstract-upload:${submission.id}:${file.name}:${file.size}:${file.lastModified}` }, body });
    setBusy(false);
    if (!response.ok) { setError("The supporting file could not be uploaded. Use PDF, DOCX, JPG, PNG, or ZIP under 50 MB."); return; }
    await load();
  };

  const revise = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editingSubmission) return; setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(path(`/author/submissions/${editingSubmission.id}`), { method: "PUT", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ expected_version: editingSubmission.version, title: form.get("title"), body: form.get("body"), abstract_type: editingSubmission.abstract_type, topic: form.get("topic") || editingSubmission.topic || null, track: form.get("track") || editingSubmission.track || null, keywords: editingSubmission.keywords, authors: editingSubmission.authors }) });
    setBusy(false); if (!response.ok) { setError("This revision could not be saved. The deadline or version may have changed."); return; } setEditingSubmission(null); await load();
  };

  const updateSpeaker = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!speaker) return; setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    let programmeAvailability = speaker.programme_availability || {};
    try { programmeAvailability = JSON.parse(String(form.get("programme_availability") || "{}")); } catch { setBusy(false); setError("Availability must be valid JSON with event dates and start/end windows."); return; }
    let customFields = speaker.programme_custom_fields || {};
    let travelDetails = speaker.programme_travel_details || {};
    try { customFields = JSON.parse(String(form.get("programme_custom_fields") || "{}")); travelDetails = JSON.parse(String(form.get("programme_travel_details") || "{}")); } catch { setBusy(false); setError("Travel and custom programme fields must be valid JSON."); return; }
    const response = await fetch(path("/speaker/profile"), { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": String(speaker.version), "Idempotency-Key": `programme-speaker-profile:${speaker.speaker_id}:${speaker.version}` }, body: JSON.stringify({ expected_version: speaker.version, first_name: form.get("first_name"), last_name: form.get("last_name"), designation: form.get("designation") || null, affiliation: form.get("affiliation") || null, country: form.get("country") || null, bio: form.get("bio") || null, photo_url: form.get("photo_url") || null, programme_availability: programmeAvailability, programme_custom_fields: customFields, programme_travel_details: travelDetails, research_interests: String(form.get("research_interests") || "").split(",").map((value) => value.trim()).filter(Boolean) }) });
    setBusy(false); if (!response.ok) { setError("Your profile could not be saved. Refresh and try again."); return; } setSpeaker(await response.json());
  };

  const updateParticipation = async (accepted: boolean) => {
    if (!speaker) return;
    setBusy(true); setError(null);
    const response = await fetch(path(`/speaker/participation?accepted=${accepted}`), { method: "POST", headers: { "If-Match": String(speaker.version), "Idempotency-Key": `programme-speaker-participation:${speaker.speaker_id}:${speaker.version}:${accepted}` } });
    setBusy(false); if (!response.ok) { setError("Your participation response could not be saved."); return; } setSpeaker(await response.json());
  };

  const uploadHeadshot = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !speaker) return;
    setBusy(true); setError(null);
    const body = new FormData(); body.append("file", file);
    const response = await fetch(path("/speaker/headshot"), { method: "POST", headers: { "If-Match": String(speaker.version), "Idempotency-Key": `programme-speaker-headshot:${speaker.speaker_id}:${speaker.version}:${file.name}:${file.size}` }, body });
    setBusy(false);
    if (!response.ok) { setError("The headshot could not be uploaded. Use a JPEG, PNG, or WebP under 10 MB."); return; }
    setSpeaker(await response.json());
  };

  if (grant?.audience === "AUTHOR" && !error) return <main className="mx-auto max-w-6xl p-6 sm:p-10"><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Author workspace</p><h1 className="mt-2 text-3xl font-bold">Your abstract submissions</h1><p className="mt-2 text-sm text-slate-600">Submit, revise, attach supporting files, and confirm an accepted programme place.</p><div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><section className="space-y-3">{submissions.length ? submissions.map((submission) => <article key={submission.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{submission.code} · {submission.authors.length} author{submission.authors.length === 1 ? "" : "s"}</p><h2 className="mt-1 text-lg font-bold">{submission.title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{submission.author_confirmation === "CONFIRMED" ? "PARTICIPATION CONFIRMED" : submission.status}</span></div><p className="mt-2 text-xs text-slate-600">{submission.authors.map((author) => `${author.full_name}${author.is_presenter ? " · presenter" : ""}`).join(" · ")}</p>{submission.notes_to_author ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Committee note: {submission.notes_to_author}</p> : null}<div className="mt-4 flex flex-wrap gap-3">{submission.status === "ACCEPTED" && submission.author_confirmation !== "CONFIRMED" ? <button disabled={busy} onClick={() => confirmParticipation(submission)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">Confirm participation</button> : null}{["DRAFT", "SUBMITTED", "REVISION_REQUESTED"].includes(submission.status) ? <><button disabled={busy} onClick={() => setEditingSubmission(submission)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-indigo-700">Edit revision</button><button disabled={busy} onClick={() => withdraw(submission)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-rose-700">Withdraw</button></> : null}</div><label className="mt-4 block text-xs font-semibold text-slate-600">Supporting file<input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.zip" disabled={busy || !["DRAFT", "SUBMITTED", "REVISION_REQUESTED"].includes(submission.status)} onChange={(event) => uploadAttachment(submission, event)} className="mt-1 block w-full rounded border p-2 text-sm" /></label>{editingSubmission?.id === submission.id ? <form onSubmit={revise} className="mt-4 space-y-2 border-t pt-4"><input required name="title" defaultValue={submission.title} className="w-full rounded-lg border p-2.5" /><textarea required name="body" defaultValue={submission.body} className="min-h-32 w-full rounded-lg border p-2.5" /><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-bold text-white">Save revision</button><button type="button" onClick={() => setEditingSubmission(null)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Cancel</button></div></form> : null}</article>) : <p className="rounded-xl border border-dashed p-6 text-sm text-slate-600">No submissions yet. Start with the call form.</p>}</section><form onSubmit={submitAbstract} className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-700">Call for abstracts</p><h2 className="mt-1 text-lg font-bold">New submission</h2><div className="mt-4 space-y-3"><input required name="author_name" className="w-full rounded-lg border bg-white p-2.5" placeholder="Your full name" /><input required type="email" value={authorEmail} onChange={(event) => setAuthorEmail(event.target.value)} className="w-full rounded-lg border bg-white p-2.5" placeholder="Your email" /><input required name="title" className="w-full rounded-lg border bg-white p-2.5" placeholder="Abstract title" /><textarea required name="body" minLength={10} className="min-h-36 w-full rounded-lg border bg-white p-2.5" placeholder="Abstract body" /><input name="topic" className="w-full rounded-lg border bg-white p-2.5" placeholder="Topic" /><input name="keywords" className="w-full rounded-lg border bg-white p-2.5" placeholder="Keywords, separated by commas" /><textarea name="coauthors" className="min-h-20 w-full rounded-lg border bg-white p-2.5" placeholder="Co-authors, one per line: Full name, email, affiliation" />{authorFormFields.filter((field) => !["title", "body", "keywords", "topic", "authors"].includes(field.key)).map((field) => field.type === "select" ? <select key={field.key} required={field.required} name={field.key} className="w-full rounded-lg border bg-white p-2.5"><option value="">{field.label}</option>{(field.options || []).map((option) => <option key={option}>{option}</option>)}</select> : <textarea key={field.key} required={field.required} name={field.key} className="min-h-20 w-full rounded-lg border bg-white p-2.5" placeholder={`${field.label}${field.required ? " *" : ""}`} />)}<button disabled={busy} className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-bold text-white">Submit abstract</button></div></form></div></main>;
  if (error) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Programme access</h1><p className="mt-4 text-red-600">{error}</p></main>;
  if (!grant) return <main className="mx-auto max-w-xl p-8">Loading your programme workspace…</main>;
  if (grant.audience === "SPEAKER" && speaker) return <main className="min-h-screen bg-slate-50 px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">{speaker.event_name} · speaker desk</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">Welcome, {speaker.first_name}</h1><p className="mt-1 text-sm text-slate-600">Keep your programme details current and respond to your participation invitation.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${speaker.participation === "ACCEPTED" ? "bg-emerald-100 text-emerald-800" : speaker.participation === "DECLINED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{speaker.participation}</span></div><div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={updateSpeaker} className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Your profile</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required name="first_name" defaultValue={speaker.first_name} className="rounded-lg border p-2.5" placeholder="First name" /><input required name="last_name" defaultValue={speaker.last_name} className="rounded-lg border p-2.5" placeholder="Last name" /><input name="designation" defaultValue={speaker.designation || ""} className="rounded-lg border p-2.5" placeholder="Role / designation" /><input name="affiliation" defaultValue={speaker.affiliation || ""} className="rounded-lg border p-2.5" placeholder="Organisation" /><input name="country" defaultValue={speaker.country || ""} className="rounded-lg border p-2.5 sm:col-span-2" placeholder="Country" /><input name="photo_url" defaultValue={speaker.photo_url || ""} className="rounded-lg border p-2.5 sm:col-span-2" placeholder="Headshot URL (optional)" /><label className="rounded-lg border border-dashed p-3 text-xs font-semibold text-slate-600 sm:col-span-2">Upload headshot<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadHeadshot} disabled={busy} className="mt-2 block w-full text-xs" /></label><textarea name="bio" defaultValue={speaker.bio || ""} className="min-h-32 rounded-lg border p-2.5 sm:col-span-2" placeholder="Short biography" /><input name="research_interests" className="rounded-lg border p-2.5 sm:col-span-2" placeholder="Topics, separated by commas" /><textarea name="programme_availability" defaultValue={JSON.stringify(speaker.programme_availability || {}, null, 2)} className="min-h-28 rounded-lg border p-2.5 font-mono text-xs sm:col-span-2" placeholder={'{"2026-09-24":[{"start":"09:00","end":"12:00"}]}'}/><textarea name="programme_travel_details" defaultValue={JSON.stringify(speaker.programme_travel_details || {}, null, 2)} className="min-h-20 rounded-lg border p-2.5 font-mono text-xs sm:col-span-2" placeholder='{"arrival":"2026-09-23","departure":"2026-09-25","needs_hotel":false}'/><textarea name="programme_custom_fields" defaultValue={JSON.stringify(speaker.programme_custom_fields || {}, null, 2)} className="min-h-20 rounded-lg border p-2.5 font-mono text-xs sm:col-span-2" placeholder='{"dietary":"Vegetarian"}'/><p className="text-xs text-slate-500 sm:col-span-2">Availability, travel, and custom fields are shared with programme readiness and scheduling conflicts.</p></div><button disabled={busy} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Save profile</button></form><section className="space-y-4"><div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-indigo-950">Programme participation</h2><p className="mt-1 text-sm text-indigo-800">Confirm once your sessions and presentation details are ready.</p></div><div className="flex gap-2"><button disabled={busy} onClick={() => updateParticipation(true)} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white">Accept programme</button><button disabled={busy} onClick={() => updateParticipation(false)} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700">Decline</button></div></div></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Your sessions</h2><div className="mt-4 space-y-3">{speaker.sessions.length ? speaker.sessions.map((session) => <article key={session.id} className="rounded-xl border p-4"><p className="text-xs font-bold text-indigo-600">{new Date(session.start_time).toLocaleString()} · {session.room || "Room to be announced"}</p><h3 className="mt-1 font-bold">{session.title}</h3><p className="mt-1 text-xs text-slate-600">{session.role}{session.presentation_title ? ` · ${session.presentation_title}` : ""}</p></article>) : <p className="text-sm text-slate-600">No sessions have been linked yet.</p>}</div></div></section></div></div></main>;
  return <main className="mx-auto max-w-3xl p-6 sm:p-10"><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Programme workspace</p><h1 className="mt-2 text-3xl font-bold">{grant.audience === "AUTHOR" ? "Your abstract submissions" : "Your review assignments"}</h1><p className="mt-2 text-sm text-slate-600">Access expires {new Date(grant.expires_at).toLocaleString()}.</p>
    {grant.audience === "AUTHOR" ? <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><div className="space-y-3">{submissions.length ? submissions.map((submission) => <article key={submission.id} className="rounded-xl border p-4"><p className="text-sm text-slate-500">{submission.code} · {submission.status} · {submission.authors.length} author{submission.authors.length === 1 ? "" : "s"}</p><h2 className="mt-1 font-bold">{submission.title}</h2><p className="mt-2 text-xs text-slate-600">{submission.authors.map((author) => `${author.full_name}${author.is_presenter ? " · presenter" : ""}`).join(" · ")}</p>{submission.attachments.length ? <p className="mt-2 text-xs text-slate-600">Files: {submission.attachments.map((attachment) => attachment.filename).join(", ")}</p> : null}<label className="mt-3 block text-xs font-semibold text-slate-600">Supporting file<input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.zip" disabled={busy || !["DRAFT", "SUBMITTED", "REVISION_REQUESTED"].includes(submission.status)} onChange={(event) => uploadAttachment(submission, event)} className="mt-1 block w-full rounded border p-2 text-sm" /></label>{submission.notes_to_author ? <p className="mt-2 text-sm">Committee note: {submission.notes_to_author}</p> : null}<div className="mt-3 flex gap-3">{["DRAFT", "SUBMITTED", "REVISION_REQUESTED"].includes(submission.status) ? <><button disabled={busy} onClick={() => setEditingSubmission(submission)} className="text-sm font-semibold text-indigo-700">Edit revision</button><button disabled={busy} onClick={() => withdraw(submission)} className="text-sm font-semibold text-rose-700">Withdraw abstract</button></> : null}</div>{editingSubmission?.id === submission.id ? <form onSubmit={revise} className="mt-4 space-y-2 border-t pt-4"><input required name="title" defaultValue={submission.title} className="w-full rounded-lg border p-2.5" /><textarea required name="body" defaultValue={submission.body} className="min-h-36 w-full rounded-lg border p-2.5" /><input name="topic" defaultValue={submission.topic || ""} className="w-full rounded-lg border p-2.5" placeholder="Topic" /><input name="track" defaultValue={submission.track || ""} className="w-full rounded-lg border p-2.5" placeholder="Track" /><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-bold text-white">Save revision</button><button type="button" onClick={() => setEditingSubmission(null)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Cancel</button></div></form> : null}</article>) : <p>No submissions yet.</p>}</div><form onSubmit={submitAbstract} className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-700">New submission</p><h2 className="mt-1 text-lg font-bold">Send an abstract</h2><div className="mt-4 space-y-3"><input required name="author_name" className="w-full rounded-lg border bg-white p-2.5" placeholder="Your full name" /><input required type="email" value={authorEmail} onChange={(event) => setAuthorEmail(event.target.value)} className="w-full rounded-lg border bg-white p-2.5" placeholder="Your email" /><input required name="title" className="w-full rounded-lg border bg-white p-2.5" placeholder="Abstract title" /><textarea required name="body" minLength={10} className="min-h-36 w-full rounded-lg border bg-white p-2.5" placeholder="Abstract body" /><div className="grid grid-cols-2 gap-3"><select name="abstract_type" className="rounded-lg border bg-white p-2.5"><option>ORAL</option><option>POSTER</option></select><input name="topic" className="rounded-lg border bg-white p-2.5" placeholder="Topic" /></div><input name="track" className="w-full rounded-lg border bg-white p-2.5" placeholder="Track" /><input name="keywords" className="w-full rounded-lg border bg-white p-2.5" placeholder="Keywords, separated by commas" /><textarea name="coauthors" className="min-h-20 w-full rounded-lg border bg-white p-2.5" placeholder="Co-authors, one per line: Full name, email, affiliation" />{authorFormFields.filter((field) => !["title", "body", "keywords", "topic", "authors"].includes(field.key)).map((field) => field.type === "select" ? <select key={field.key} required={field.required} name={field.key} className="w-full rounded-lg border bg-white p-2.5"><option value="">{field.label}</option>{(field.options || []).map((option) => <option key={option}>{option}</option>)}</select> : <textarea key={field.key} required={field.required} name={field.key} className="min-h-20 w-full rounded-lg border bg-white p-2.5" placeholder={field.label} />)}<button disabled={busy} className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 font-bold text-white">Submit abstract</button></div></form></section> : <section className="mt-8"><p>The reviewer workspace is opening.</p></section>}
  </main>;
}
