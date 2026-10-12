import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Card, PageHeader, inputClass } from "../components/ui";
import { duration, formatDate } from "../lib/format";
import { mockHistory } from "../mocks/meeting";

export function History() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const [query, setQuery] = useState("");
  const results = mockHistory.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase()));
  const Chevron = lng === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className={`${inputClass} ps-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("history.search")} />
      </div>

      <Card>
        {results.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">{t("history.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {results.map((m) => (
              <li key={m.id}>
                <Link to="/report" className="flex items-center gap-4 px-5 py-4 transition hover:bg-subtle">
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-lg font-semibold leading-none">{formatDate(m.started_at, lng, { day: "numeric" })}</div>
                    <div className="mt-1 text-xs text-muted">{formatDate(m.started_at, lng, { month: "short" })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      <bdi>{m.title}</bdi>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                      <span>{formatDate(m.started_at, lng, { timeStyle: "short" })}</span>
                      <span>{duration(m.started_at, m.ended_at, lng)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} /> {m.participants}
                      </span>
                    </div>
                  </div>
                  <Badge tone={m.approved ? "ok" : "muted"}>{m.approved ? t("report.approved") : t("report.draft")}</Badge>
                  <Chevron size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
