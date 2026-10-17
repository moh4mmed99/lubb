"use client";

import { useTranslation } from "react-i18next";
import { Badge } from "./ui";

export function StatusBadge({ meeting }) {
  const { t } = useTranslation();
  if (meeting.status === "live") return <Badge tone="danger" pulse>{t("history.live")}</Badge>;
  if (meeting.status === "scheduled") return <Badge>{t("history.scheduled")}</Badge>;
  if (meeting.report_pending) return <Badge tone="accent" pulse>{t("report.generating")}</Badge>;
  if (!meeting.report) return <Badge tone="warn">{t("report.missing")}</Badge>;
  return meeting.report.approved ? <Badge tone="ok">{t("report.approved")}</Badge> : <Badge>{t("report.draft")}</Badge>;
}
