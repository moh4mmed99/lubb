"use client";

// Presentation library: drop a PowerPoint in, the hub turns it into slides, each deck shows as a card stack.
// With no decks yet the page is one big drop zone; once a file goes up it shrinks to a cloud beside the title.
import { AlertCircle, FileUp, Trash2, UploadCloud } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { spring } from "@/components/motion";
import { Loading, Notice, PageHeader } from "@/components/ui";
import { api, cached, errorText } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useHub } from "@/lib/useHub";

const ACCEPT = ".pptx,.ppt,.odp,.key,.pdf";

/** Uploads with progress (fetch can't report upload progress). Resolves with the new presentation. */
function upload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/presentations?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status < 300) resolve(body);
      else reject(new Error(body?.detail ?? (xhr.status >= 500 ? "hub_unreachable" : xhr.statusText)));
    };
    xhr.onerror = () => reject(new Error("hub_unreachable"));
    xhr.send(file);
  });
}

export default function PresentationsPage() {
  const { t } = useTranslation();
  const [decks, setDecks] = useState(() => cached("/presentations") ?? null);
  const [error, setError] = useState(null);
  const [uploads, setUploads] = useState([]); // [{ key, name, progress }]
  const [dragging, setDragging] = useState(false); // a file is being dragged over the page
  const input = useRef(null);
  const pick = () => input.current?.click();

  const load = useCallback(async () => {
    try {
      setDecks(await api("/presentations"));
      setError(null);
    } catch (err) {
      setError(errorText(err, t));
    }
  }, [t]);

  const connected = useHub((e) => {
    if (e.type === "presentation_ready")
      setDecks((ds) => (ds ?? []).map((d) => (d.id === e.presentation.id ? e.presentation : d)));
  });
  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  const addFiles = (files) => {
    for (const file of files) {
      const key = Math.random().toString(36).slice(2);
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      upload(file, (progress) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress } : x))))
        .then((deck) => setDecks((ds) => [deck, ...(ds ?? [])]))
        .catch((err) => setError(`${file.name}: ${errorText(err, t)}`))
        .finally(() => setUploads((u) => u.filter((x) => x.key !== key)));
    }
  };

  const remove = async (deck) => {
    if (!confirm(t("decks.deleteConfirm", { title: deck.title }))) return;
    try {
      await api(`/presentations/${deck.id}`, { method: "DELETE" });
      setDecks((ds) => ds.filter((d) => d.id !== deck.id));
    } catch (err) {
      setError(errorText(err, t));
    }
  };

  // Files can be dropped anywhere on the page, so the small cloud never has to be hit exactly
  const dropTarget = {
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setDragging(false),
    onDrop: (e) => {
      e.preventDefault();
      setDragging(false);
      addFiles([...e.dataTransfer.files]);
    },
  };

  // Before the first deck, the drop zone is the page. Once a file is on its way it shrinks to the cloud
  // beside the title (the same element, morphing: layoutId "upload").
  const compact = (decks?.length ?? 0) > 0 || uploads.length > 0;

  return (
    <div className="space-y-10 page" {...dropTarget}>
      <PageHeader
        title={t("decks.title")}
        subtitle={t("decks.subtitle")}
        actions={compact && <UploadCloudTile dragging={dragging} uploads={uploads} onPick={pick} />}
      />
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          addFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
      {error && (
        <Notice tone="danger" action={<button className="text-xs text-muted hover:text-fg" onClick={() => setError(null)}>✕</button>}>
          {error}
        </Notice>
      )}

      {decks === null && !compact ? (
        !error && <Loading />
      ) : !compact ? (
        <DropZone className="fill" dragging={dragging} onPick={pick} />
      ) : (
        // Newest deck = focal point (2 columns × 2 rows); the next two stack beside it. Below that the
        // middle column drops one step, so the grid reads as a rhythm rather than a table.
        <div className="grid items-start gap-x-10 gap-y-14 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {uploads.map((u) => (
              <UploadingCard key={u.key} upload={u} />
            ))}
            {(decks ?? []).map((deck, i) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                index={i}
                featured={i === 0}
                className={i === 0 ? "sm:col-span-2 lg:row-span-2" : i >= 3 && (i - 3) % 3 === 1 ? "lg:mt-16" : ""}
                onDelete={() => remove(deck)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** The empty library: one big glass drop zone filling the page. */
function DropZone({ dragging, onPick, className = "" }) {
  const { t } = useTranslation();
  return (
    <motion.button
      type="button"
      layoutId="upload"
      transition={spring}
      onClick={onPick}
      className={`glass no-print flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? "border-accent" : "hover:border-muted"
      } ${className}`}
    >
      <motion.span
        layoutId="upload-icon"
        transition={spring}
        animate={{ y: dragging ? -8 : 0 }}
        className="grid size-20 place-items-center rounded-2xl bg-fg text-bg"
      >
        <UploadCloud size={34} strokeWidth={1.75} />
      </motion.span>
      <div>
        <p className="text-2xl font-semibold tracking-tight">{t("decks.drop")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t("decks.formats")}</p>
      </div>
      {/* looks like the primary button; the whole zone is the button */}
      <span className="inline-flex items-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg">
        <FileUp size={16} />
        {t("decks.add")}
      </span>
    </motion.button>
  );
}

/** The drop zone shrunk to its cloud, beside the title. Rings with progress while files upload. */
function UploadCloudTile({ dragging, uploads, onPick }) {
  const { t } = useTranslation();
  const busy = uploads.length > 0;
  const progress = busy ? uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length : 0;
  const r = 30;
  const around = 2 * Math.PI * r;

  return (
    <motion.button
      type="button"
      layoutId="upload"
      transition={spring}
      onClick={onPick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={t("decks.add")}
      title={t("decks.addHint")}
      className={`glass no-print relative grid size-[4.5rem] place-items-center rounded-2xl border-2 border-dashed transition-colors ${
        dragging ? "border-accent" : "hover:border-muted"
      }`}
    >
      <motion.span layoutId="upload-icon" transition={spring} animate={{ y: dragging ? -6 : 0 }} className="grid size-12 place-items-center rounded-xl bg-fg text-bg">
        {/* the cloud bobs while a file is going up (inside, so it never disturbs the shrink morph) */}
        <motion.span
          animate={{ y: busy ? [0, -3, 0] : 0 }}
          transition={busy ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : spring}
        >
          <UploadCloud size={22} strokeWidth={1.75} />
        </motion.span>
      </motion.span>
      {busy && (
        <svg viewBox="0 0 72 72" className="pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90" aria-hidden>
          <motion.circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={around}
            animate={{ strokeDashoffset: around * (1 - progress) }}
            transition={{ ease: "easeOut" }}
          />
        </svg>
      )}
    </motion.button>
  );
}

/** A file on its way up: a glass slide with its progress, until the hub has it and it becomes a deck. */
function UploadingCard({ upload: u }) {
  const { t } = useTranslation();
  return (
    <motion.div
      layout
      initial={{ y: -60, rotate: -3 }}
      animate={{ y: 0, rotate: 0 }}
      exit={{ scale: 0.95, transition: { duration: 0.2 } }}
      transition={spring}
    >
      <div className="glass grid aspect-video place-items-center rounded-xl border">
        <div className="w-2/3 space-y-4 text-center">
          <motion.span
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto grid size-10 place-items-center rounded-xl bg-fg text-bg"
          >
            <UploadCloud size={18} />
          </motion.span>
          <div className="h-1 overflow-hidden rounded-full bg-fg/10">
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${u.progress * 100}%` }} transition={{ ease: "easeOut" }} />
          </div>
        </div>
      </div>
      <div className="mt-5 min-w-0">
        <h2 className="truncate font-semibold">
          <bdi>{u.name}</bdi>
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {t("decks.uploading")} ·{" "}
          <span className="font-mono" dir="ltr">
            {Math.round(u.progress * 100)}%
          </span>
        </p>
      </div>
    </motion.div>
  );
}

const slideUrl = (deck, n) => `/api/presentations/${deck.id}/slides/${n}.png`;

/**
 * A deck as a physical stack: two cards fanned behind the cover. The stack drops onto the page,
 * and fans out on hover as if you were about to pick it up.
 */
// Three hand-tuned fans, never mirror images of each other. A deck always gets the same one (from its id),
// so the page looks composed rather than random, and stays the same between visits.
const FANS = [
  [{ rotate: -7, x: -14, y: 10 }, { rotate: 3, x: 10, y: 3 }],
  [{ rotate: 5, x: 16, y: 9 }, { rotate: -2, x: -6, y: 4 }],
  [{ rotate: -3, x: -6, y: 13 }, { rotate: 8, x: 20, y: 2 }],
];
const fanFor = (id) => FANS[[...id].reduce((h, c) => h + c.charCodeAt(0), 0) % FANS.length];

function DeckCard({ deck, index, featured, className = "", onDelete }) {
  const { t, i18n } = useTranslation();
  const ready = deck.status === "ready";
  // The featured stack is twice the size: its offsets grow with it, but its tilt shrinks, because
  // the same angle on a bigger card swings the corners much further (into the neighbouring decks).
  const k = featured ? 1.6 : 1;
  const tilt = featured ? 0.45 : 1;
  const behind = fanFor(deck.id).map((b) => ({
    rotate: b.rotate * tilt,
    x: b.x * k,
    y: b.y * k,
    hover: { rotate: b.rotate * tilt * 1.8, x: b.x * k * 2, y: b.y * k * 0.4 },
  }));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -80, rotate: -4 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: 40, scale: 0.9, transition: { duration: 0.25 } }}
      transition={{ ...spring, delay: Math.min(index, 8) * 0.07 }}
      className={`group ${className}`}
    >
      <motion.div initial="rest" whileHover="hover" animate="rest" className="relative">
        {/* cards behind the cover */}
        {behind.map((b, i) => (
          <motion.div
            key={i}
            variants={{ rest: { rotate: b.rotate, x: b.x, y: b.y }, hover: b.hover }}
            transition={spring}
            className="absolute inset-0 overflow-hidden rounded-xl border border-line bg-card shadow-sm"
          >
            {ready && deck.slides > i + 1 && <img src={slideUrl(deck, i + 2)} alt="" className="size-full object-cover opacity-80" />}
          </motion.div>
        ))}

        {/* cover */}
        <motion.div variants={{ rest: { y: 0 }, hover: { y: featured ? -12 : -8 } }} transition={spring} className="relative">
          <Link
            href={ready ? `/presentations/${deck.id}` : "#"}
            onClick={(e) => !ready && e.preventDefault()}
            className="block aspect-video overflow-hidden rounded-xl border border-line bg-card shadow-md transition-shadow group-hover:shadow-xl"
          >
            {ready ? (
              <img src={slideUrl(deck, 1)} alt={deck.title} className="size-full object-cover" />
            ) : deck.status === "failed" ? (
              <div className="grid size-full place-items-center p-4 text-center text-xs text-danger">
                <span>
                  <AlertCircle size={20} className="me-auto mb-2" />
                  {t("decks.failed")}
                  {deck.error && <span className="mt-1 block text-muted">{deck.error}</span>}
                </span>
              </div>
            ) : (
              <div className="grid size-full place-items-center gap-2 text-xs text-muted">
                <span className="flex flex-col items-center gap-2">
                  <span className="size-5 animate-spin rounded-full border-2 border-line border-t-fg" />
                  {t("decks.converting")}
                </span>
              </div>
            )}
          </Link>
        </motion.div>
      </motion.div>

      <div className={`flex items-start justify-between gap-3 ${featured ? "mt-8" : "mt-5"}`}>
        <div className="min-w-0">
          {featured && <p className="label mb-1 text-accent">{t("decks.latest")}</p>}
          <h2 className={`truncate font-semibold ${featured ? "text-2xl tracking-tight" : ""}`}>
            <bdi>{deck.title}</bdi>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {ready ? t("decks.slides", { count: deck.slides }) + " · " : ""}
            {formatDate(deck.created_at, i18n.language)}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label={t("decks.delete")}
          title={t("decks.delete")}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  );
}
