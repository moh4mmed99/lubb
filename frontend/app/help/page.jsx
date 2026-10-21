"use client";

// Help Center: how to reach support.
import { LifeBuoy, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/help";

export default function HelpPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 page">
      <PageHeader title={t("help.title")} subtitle={t("help.subtitle")} />

      <div className="max-w-md rounded-2xl bg-fg p-8 text-bg">
        <span className="grid size-12 place-items-center rounded-xl bg-signal text-black">
          <LifeBuoy size={24} />
        </span>
        <p className="mt-6 text-2xl font-semibold tracking-tight">{t("help.contactTitle")}</p>
        <p className="mt-2 text-bg/70">{t("help.contactText")}</p>
        {SUPPORT_EMAIL ? (
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bg px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-signal hover:text-black"
          >
            <Mail size={16} />
            <span dir="ltr">{SUPPORT_EMAIL}</span>
          </a>
        ) : (
          <p className="mt-6 text-sm text-bg/50">{t("help.contactSoon")}</p>
        )}
      </div>
    </div>
  );
}
