import { BookOpen, CheckCircle2, FileText, Printer, ScanLine, Search, ShieldCheck, Users } from "lucide-react";

type Mode = "admin" | "registration" | "scanning" | "self_checkin";

const CONTENT: Record<Mode, { title: string; description: string; sections: { title: string; icon: typeof BookOpen; steps: string[] }[] }> = {
  admin: {
    title: "Admin operations manual",
    description: "Configure the local venue node, supervise event operations, and create the final event record.",
    sections: [
      { title: "Event data and sync", icon: CheckCircle2, steps: ["Open Sync & Local Data to fetch an authorized event snapshot.", "Confirm the event identity and freshness before opening operational modes.", "Use the same Sync & Local Data workspace to review fallback database readiness and download workstation copies."] },
      { title: "Check-in gates and devices", icon: ShieldCheck, steps: ["Define a check-in gate for each checkpoint and allowed delegate role.", "Bind scanners, registration desks, and printers from Devices & Hardware.", "Review rejected scans and overrides in Audit Logs."] },
      { title: "Final event report", icon: FileText, steps: ["Open Reports and explicitly select the local event.", "Resolve open check-outs, rejected scans, and data warnings.", "Finalize an immutable version, then export the full PDF or DOCX. Revised finals require a reason and retain earlier versions."] },
    ],
  },
  registration: {
    title: "Registration desk guide",
    description: "Register delegates, find existing records, issue materials, and keep the intake queue moving.",
    sections: [
      { title: "Register and review", icon: Users, steps: ["Use New Registration for onsite delegates and complete required identity fields.", "Use Review Queue for records that require operator approval.", "Search before creating a record to avoid duplicate registrations."] },
      { title: "Badges and certificates", icon: Printer, steps: ["Confirm delegate identity and role before printing.", "Use Print Badge for first prints and record a reason for controlled reprints.", "Use Certificates only when the event configuration makes them available."] },
      { title: "Companions and kits", icon: Search, steps: ["Attach companions to the correct primary delegate.", "Record each kit issue once and verify the configured role eligibility.", "Escalate capacity, station, or device configuration changes to an administrator."] },
    ],
  },
  scanning: {
    title: "Gate scanning guide",
    description: "Operate checkpoint cameras, record attendance accurately, and resolve exceptions safely.",
    sections: [
      { title: "Start a checkpoint", icon: ScanLine, steps: ["Confirm the assigned station and camera in Settings.", "Check the live-sync indicator and camera preview before opening the gate.", "Keep the badge QR code inside the scan frame until a result appears."] },
      { title: "Check-in and check-out", icon: CheckCircle2, steps: ["A successful scan records the delegate, station, operator device, and time.", "Use the configured check-out flow when a session or controlled space requires duration tracking.", "Do not rescan after success unless the station permits repeat visits."] },
      { title: "Rejected scans", icon: ShieldCheck, steps: ["Read the displayed rejection reason before taking action.", "Confirm role and capacity rules with an administrator; never share or use stored credentials for an override.", "Every authorized override must identify the administrator and remain in the event audit trail."] },
    ],
  },
  self_checkin: {
    title: "Self check-in kiosk guide",
    description: "Let already registered participants scan their emailed QR, confirm identity, check in at the initial gate, and print their badge.",
    sections: [
      { title: "Participant lookup", icon: ScanLine, steps: ["Ask the participant to present the QR code received from the registration cloud app.", "If the camera cannot read it, enter the registration code, email, phone, or name manually.", "Confirm the displayed photo and profile details before check-in."] },
      { title: "Allowed updates", icon: Users, steps: ["Participants may update only name, email, phone, and photo when available.", "Role, role code, payment, company, designation, and restricted event fields are locked in kiosk mode.", "Send restricted changes to the nearest onsite support desk."] },
      { title: "Check-in and badge print", icon: Printer, steps: ["Self check-in always uses the configured initial check-in gate.", "After successful check-in, the kiosk enables badge printing and detail updates.", "If a participant has no photo, the kiosk shows a neutral 3D-style participant avatar."] },
    ],
  },
};

export default function ModeDocumentationPage({ mode }: { mode: Mode }) {
  const content = CONTENT[mode];
  return <main className="mx-auto w-full max-w-6xl space-y-5 pb-12"><header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"><div className="flex items-center gap-4"><div className="grid size-12 place-items-center rounded-xl bg-[var(--pri)] text-[var(--primary-contrast)]"><BookOpen className="size-6" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--pri)]">Documentation · {mode} mode</p><h1 className="text-2xl font-black tracking-tight text-[var(--text)]">{content.title}</h1><p className="mt-1 text-xs font-medium text-[var(--muted)]">{content.description}</p></div></div></header><div className="grid gap-5 lg:grid-cols-3">{content.sections.map(({ title, icon: Icon, steps }) => <section key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"><div className="mb-4 flex items-center gap-2 border-b border-[var(--border)] pb-3"><Icon className="size-4 text-[var(--pri)]" /><h2 className="text-xs font-black uppercase tracking-wider text-[var(--text)]">{title}</h2></div><ol className="space-y-3">{steps.map((step, index) => <li key={step} className="flex gap-3 text-xs font-medium leading-5 text-[var(--muted)]"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--pri)]/10 text-[10px] font-black text-[var(--pri)]">{index + 1}</span><span>{step}</span></li>)}</ol></section>)}</div></main>;
}
