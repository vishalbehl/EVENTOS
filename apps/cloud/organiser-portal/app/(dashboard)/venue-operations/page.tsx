"use client";

import { useMemo, useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEvents } from "@/hooks/useEvents";
import { useAddons } from "@/hooks/useBilling";
import { useCatalogTemplates, useCreateServiceRequest, useCatalogTemplate } from "@/hooks/useVenueOperations";
import { orgApi } from "@/components/organizer/org/org-api";
import { CommercialDetailsDialog } from "@/components/organizer/platform/CommercialDetailsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EnterprisePageIntro,
  EnterprisePanel,
} from "@/components/organizer/platform/EnterprisePortal";
import {
  CommercialAddonCard,
  TemplateRecommendationCard,
} from "@/components/organizer/platform/CommercialCards";

type QuestionOption = {
  label: string;
  value: number;
  min?: number;
  max?: number;
};

const attendeeRangeOptions: QuestionOption[] = [
  { label: "Up to 250 attendees", value: 250, min: 1, max: 250 },
  { label: "250 to 750 attendees", value: 750, min: 250, max: 750 },
  { label: "750 to 2,000 attendees", value: 2000, min: 750, max: 2000 },
  { label: "2,000+ attendees", value: 5000, min: 2000, max: 5000 },
];

const speakerRangeOptions: QuestionOption[] = [
  { label: "Up to 25 speakers", value: 25, min: 1, max: 25 },
  { label: "25 to 75 speakers", value: 75, min: 25, max: 75 },
  { label: "75 to 150 speakers", value: 150, min: 75, max: 150 },
  { label: "150+ speakers", value: 250, min: 150, max: 250 },
];

const roomOptions: QuestionOption[] = [
  { label: "1 room", value: 1 },
  { label: "2 rooms", value: 2 },
  { label: "3 rooms", value: 3 },
  { label: "4+ rooms", value: 4 },
];

const dayOptions: QuestionOption[] = [
  { label: "1 day", value: 1 },
  { label: "2 days", value: 2 },
  { label: "3 days", value: 3 },
  { label: "4+ days", value: 4 },
];

function asArray<T = Record<string, any>>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function toNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(amount: number | null | undefined, currency = "INR") {
  if (amount === null || amount === undefined) return "Custom quote";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
}

function normalizeTemplate(template: Record<string, any>, categoryLabel: string) {
  return {
    id: String(template.id ?? template.slug ?? template.name),
    name: String(template.name ?? "Template"),
    description: template.description || template.short_description || "",
    categoryLabel,
    coverageLabel:
      categoryLabel === "Room Template"
        ? `${template.rooms ?? template.default_capacity ?? 1} room coverage`
        : categoryLabel === "Registration Template"
          ? `${template.min_attendees ?? template.default_capacity ?? 0}+ attendee throughput`
          : `${template.min_speakers ?? template.default_capacity ?? 0}+ speaker capacity`,
    imageUrl: template.image_url || undefined,
    meta: template,
  };
}

export default function VenueOperationsPage() {
  const { data: events = [] } = useEvents();
  const { data: addonsData } = useAddons();
  const { data: templatesData } = useCatalogTemplates();
  const createServiceRequest = useCreateServiceRequest();

  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailType, setDetailType] = useState<"addon" | "template" | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);

  const [activeTemplateSlug, setActiveTemplateSlug] = useState<string | null>(null);

  // Hook to fetch template by slug
  const { data: templateDetailRes } = useCatalogTemplate(activeTemplateSlug);

  useEffect(() => {
    if (activeTemplateSlug && templateDetailRes) {
      setDetailType("template");
      setDetailData(templateDetailRes);
      setDetailOpen(true);
    }
  }, [templateDetailRes, activeTemplateSlug]);

  const handleOpenAddonDetails = async (addonId: string) => {
    try {
      const res = await orgApi.addon(addonId);
      setDetailType("addon");
      setDetailData(res);
      setDetailOpen(true);
    } catch (err) {
      console.error("Failed to fetch addon details", err);
    }
  };

  const handleOpenTemplateDetails = (slug: string) => {
    setActiveTemplateSlug(null);
    setTimeout(() => {
      setActiveTemplateSlug(slug);
    }, 10);
  };

  const [answers, setAnswers] = useState({
    maxAttendees: attendeeRangeOptions[1].value,
    maxSpeakers: speakerRangeOptions[1].value,
    roomCount: roomOptions[1].value,
    eventDays: dayOptions[1].value,
  });

  const allTemplates = useMemo(() => {
    if (!templatesData) return [];
    return [
      ...asArray<Record<string, any>>(templatesData.registration_templates).map((template) =>
        normalizeTemplate(template, "Registration Template")
      ),
      ...asArray<Record<string, any>>(templatesData.srr_templates).map((template) =>
        normalizeTemplate(template, "Speaker Ready Room")
      ),
      ...asArray<Record<string, any>>(templatesData.room_templates).map((template) =>
        normalizeTemplate(template, "Room Template")
      ),
    ];
  }, [templatesData]);

  const venueAddons = useMemo(
    () =>
      asArray<Record<string, any>>(addonsData)
        .filter((addon) => String(addon.addon_type || "PLAN").toUpperCase() === "VENUE")
        .map((addon) => ({
          id: String(addon.id ?? addon.key ?? addon.name),
          key: String(addon.key ?? addon.id ?? addon.name),
          name: String(addon.name ?? "Venue service"),
          description: addon.short_description || addon.description || undefined,
          imageUrl: addon.image_url || undefined,
          type: "VENUE" as const,
          billingUnit: String(addon.billing_unit || "PER_EVENT"),
          hardwareCount: asArray(addon.hardware_spec).reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          ),
          staffCount: asArray(addon.staff_spec).reduce(
            (sum: number, item: any) => sum + Number(item.quantity || 0),
            0
          ),
          targetsLabel: Array.isArray(addon.template_types) && addon.template_types.length > 0
            ? addon.template_types.map((item: string) => item === "srr" ? "SRR" : item).join(" · ")
            : "Other",
          priceLabel: (() => {
            const finalPrice = toNumber(addon.final_price);
            if (finalPrice !== null && finalPrice > 0) {
              return formatCurrency(finalPrice);
            }
            const minPrice = toNumber(addon.min_price_inr ?? addon.price_inr);
            const maxPrice = toNumber(addon.max_price_inr);
            if (minPrice !== null && maxPrice !== null && maxPrice > minPrice) {
              return `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
            }
            return formatCurrency(minPrice);
          })(),
          priceUnit: addon.price_unit || undefined,
          isActive: addon.is_active !== false,
          templateTypes: Array.isArray(addon.template_types) ? addon.template_types : [],
        })),
    [addonsData]
  );

  const recommendations = useMemo(() => {
    const registrations = allTemplates
      .filter((template) => template.categoryLabel === "Registration Template")
      .sort(
        (left, right) =>
          Number(left.meta.min_attendees ?? left.meta.default_capacity ?? 0) -
          Number(right.meta.min_attendees ?? right.meta.default_capacity ?? 0)
      );
    const srr = allTemplates
      .filter((template) => template.categoryLabel === "Speaker Ready Room")
      .sort(
        (left, right) =>
          Number(left.meta.min_speakers ?? left.meta.default_capacity ?? 0) -
          Number(right.meta.min_speakers ?? right.meta.default_capacity ?? 0)
      );
    const rooms = allTemplates
      .filter((template) => template.categoryLabel === "Room Template")
      .sort(
        (left, right) =>
          Number(left.meta.rooms ?? left.meta.default_capacity ?? 0) -
          Number(right.meta.rooms ?? right.meta.default_capacity ?? 0)
      );

    const pickFirstFit = (items: typeof allTemplates, target: number, keys: string[]) =>
      items.find((item) => keys.some((key) => Number(item.meta[key] ?? 0) >= target)) || items[items.length - 1];

    return [
      pickFirstFit(registrations, answers.maxAttendees, ["min_attendees", "default_capacity"]),
      pickFirstFit(srr, answers.maxSpeakers, ["min_speakers", "default_capacity"]),
      pickFirstFit(rooms, answers.roomCount, ["rooms", "default_capacity"]),
    ].filter(Boolean);
  }, [allTemplates, answers]);

  const recommendedTypes = useMemo(
    () =>
      new Set<string>(
        recommendations.map((template) =>
          template.categoryLabel === "Registration Template"
            ? "registration"
            : template.categoryLabel === "Speaker Ready Room"
              ? "srr"
              : "room"
        )
      ),
    [recommendations]
  );

  const recommendedAddons = useMemo(
    () => venueAddons,
    [venueAddons]
  );

  const submitServiceRequest = async () => {
    if (!selectedEventId) {
      toast.error("Select an event before sending a venue operations request.");
      return;
    }

    const event = events.find((item) => item.id === selectedEventId);
    const selectedAddonLabels = recommendedAddons
      .filter((addon) => selectedAddons.includes(addon.id))
      .map((addon) => addon.name);

    const description = [
      `Venue operations request for ${event?.name || "selected event"}.`,
      `Attendees: up to ${answers.maxAttendees}.`,
      `Speakers: up to ${answers.maxSpeakers}.`,
      `Presentation rooms: ${answers.roomCount}.`,
      `Event days: ${answers.eventDays}.`,
      `Recommended templates: ${recommendations.map((item) => item.name).join(", ") || "None"}.`,
      `Selected venue services: ${selectedAddonLabels.join(", ") || "None"}.`,
    ].join(" ");

    try {
      await createServiceRequest.mutateAsync({
        eventId: selectedEventId,
        title: `Venue Operations Setup - ${event?.name || "Event"}`,
        description,
        priority: "MEDIUM",
        request_type: "CUSTOM",
      });
      toast.success("Venue operations request sent successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to send the venue operations request.");
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <EnterprisePageIntro
        title="Venue Operations"
        subtitle="Recommend venue templates, attach venue services, and raise a service request from the organizer portal using the same commercial logic used in command center."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <EnterprisePanel className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5">
              <Sparkles className="h-5 w-5 text-[var(--color-primary-mid)]" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                Venue questionnaire
              </h2>
              <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                We use this to recommend the smallest templates that fully cover the event brief.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <QuestionBlock
              label="How many attendees are expected?"
              options={attendeeRangeOptions}
              value={answers.maxAttendees}
              onChange={(value) => setAnswers((current) => ({ ...current, maxAttendees: value }))}
            />
            <QuestionBlock
              label="How many speakers are expected?"
              options={speakerRangeOptions}
              value={answers.maxSpeakers}
              onChange={(value) => setAnswers((current) => ({ ...current, maxSpeakers: value }))}
            />
            <QuestionBlock
              label="How many presentation rooms will be active?"
              options={roomOptions}
              value={answers.roomCount}
              onChange={(value) => setAnswers((current) => ({ ...current, roomCount: value }))}
            />
            <QuestionBlock
              label="How many event days should operations cover?"
              options={dayOptions}
              value={answers.eventDays}
              onChange={(value) => setAnswers((current) => ({ ...current, eventDays: value }))}
            />
          </div>
        </EnterprisePanel>

        <EnterprisePanel className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5">
              <ClipboardList className="h-5 w-5 text-[var(--color-primary-mid)]" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                Request context
              </h2>
              <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                Select the event receiving the venue setup request and send the recommendations directly to service operations.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Event
              </span>
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 text-sm text-[var(--text-primary)] outline-none"
              >
                <option value="">Select event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Request type
              </span>
              <Input readOnly value="Venue operations setup" className="h-11 rounded-xl bg-[var(--bg-surface-2)]" />
            </label>
          </div>

          <div className="mt-6 rounded-[24px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Prepared brief
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Attendees" value={`Up to ${answers.maxAttendees}`} />
              <Metric label="Speakers" value={`Up to ${answers.maxSpeakers}`} />
              <Metric label="Rooms" value={String(answers.roomCount)} />
              <Metric label="Days" value={String(answers.eventDays)} />
            </div>
          </div>

          <Button
            onClick={submitServiceRequest}
            disabled={createServiceRequest.isPending}
            className="mt-6 h-11 rounded-xl px-5 text-[12px] font-semibold"
          >
            {createServiceRequest.isPending ? "Sending Request..." : "Send Service Request"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </EnterprisePanel>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
            Recommended Venue Templates
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
            These recommendations follow the questionnaire pattern from the quote builder.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {recommendations.map((template) => (
            <TemplateRecommendationCard
              key={template.id}
              template={template}
              ctaLabel="Included in request"
              onDetails={() => handleOpenTemplateDetails(template.meta.slug)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
              Additional Venue Services
            </h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
              These are the venue-facing packages from the add-on catalog, filtered against the recommended template types.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {recommendedAddons.map((addon) => (
            <CommercialAddonCard
              key={addon.id}
              addon={addon}
              selected={selectedAddons.includes(addon.id)}
              actionLabel={selectedAddons.includes(addon.id) ? "Selected" : "Select Service"}
              onAction={() =>
                setSelectedAddons((current) =>
                  current.includes(addon.id)
                    ? current.filter((item) => item !== addon.id)
                    : [...current, addon.id]
                )
              }
              onDetails={() => handleOpenAddonDetails(addon.id)}
            />
          ))}
        </div>
      </section>

      <EnterprisePanel className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5">
            <CheckCircle2 className="h-5 w-5 text-[var(--color-primary-mid)]" />
          </div>
          <div>
            <p className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
              You can review template guidance, select additional venue services, and send the request.
            </p>
            <p className="mt-2 text-[14px] leading-6 text-[var(--color-text-secondary)]">
              We will review your request and contact you with a custom quotation for your requested services. Thank You for choosing our Venue Services.
            </p>
          </div>
        </div>
      </EnterprisePanel>

      <CommercialDetailsDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        type={detailType}
        data={detailData}
      />
    </div>
  );
}

function QuestionBlock({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: QuestionOption[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.label}
            onClick={() => onChange(option.value)}
            className={
              value === option.value
                ? "rounded-full border border-[var(--pri)] bg-[var(--pri)] px-4 py-2 text-[12px] font-semibold text-black"
                : "rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)]"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
