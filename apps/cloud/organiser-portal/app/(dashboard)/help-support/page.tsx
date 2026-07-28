"use client";

import { BookOpen, LifeBuoy, MessageSquareText } from "lucide-react";
import {
  EnterprisePageIntro,
  EnterprisePanel,
} from "@/components/organizer/platform/EnterprisePortal";

export default function HelpSupportPage() {
  return (
    <div className="space-y-6 pb-8 pt-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          {
            icon: BookOpen,
            title: "Documentation",
            description: "Platform setup guides, process references, and admin workflows.",
          },
          {
            icon: LifeBuoy,
            title: "Support desk",
            description: "Escalate product issues and coordinate with the implementation team.",
          },
          {
            icon: MessageSquareText,
            title: "Training",
            description: "Share onboarding instructions and operating notes with your event team.",
          },
        ].map((card) => (
          <EnterprisePanel key={card.title} className="p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50">
              <card.icon className="h-5 w-5 text-violet-500" />
            </div>
            <p className="mt-5 text-[18px] font-semibold tracking-[-0.02em] text-slate-950">
              {card.title}
            </p>
            <p className="mt-2 text-[14px] leading-6 text-slate-500">{card.description}</p>
          </EnterprisePanel>
        ))}
      </div>
    </div>
  );
}
