"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowsClockwise,
  CaretDown,
  CheckCircle,
  Copy,
  DotsSixVertical,
  FilePdf,
  FloppyDisk,
  FunnelSimple,
  GitMerge,
  NotePencil,
  Plus,
  Rows,
  Scissors,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import CustomSelect from "@/components/ui/CustomSelect";
import Modal from "@/components/ui/Modal";
import {
  buildOriginalRow,
  cloneSnapshot,
  EventPlan,
  EventPlanIssue,
  EventPlanRow,
  EventPlanSnapshot,
  formatDateTime,
  formatStatusLabel,
  getPlanTotals,
  normalizeSnapshot,
} from "@/lib/eventPlanning";

type EditorTab = "board" | "preview";
type ConfirmIntent = "refresh" | "archive" | "delete-row" | "delete-draft-row";

interface PlanningEditorClientProps {
  planId: string;
}

interface BoardItemGroup {
  location: string;
  timeSlot: string;
  parent: EventPlanRow;
  children: EventPlanRow[];
  totalQuantity: number;
}

interface TimeSlotSection {
  id: string;
  timeSlot: string;
  itemGroups: BoardItemGroup[];
  totalQuantity: number;
}

interface LocationLane {
  location: string;
  timeSlots: TimeSlotSection[];
  totalQuantity: number;
}

interface ReportItemTotal {
  item: string;
  quantity: number;
}

interface ReportTimeSlotTotal {
  timeSlot: string;
  totalQuantity: number;
  items: ReportItemTotal[];
}

interface ReportLocationTotal {
  location: string;
  totalQuantity: number;
  timeSlots: ReportTimeSlotTotal[];
}

interface ConfirmDialogState {
  intent: ConfirmIntent;
  title: string;
  body: string;
  confirmLabel: string;
  rowId?: string;
  variant?: "default" | "danger";
}

function makeDropId(location: string, timeSlot: string) {
  return `${location}|||${timeSlot}`;
}

function parseDropId(id: string) {
  const [location, timeSlot] = id.split("|||");
  return { location: location || "Unassigned", timeSlot: timeSlot || "Unassigned" };
}

function statusTone(status: string) {
  if (status === "confirmed" || status === "ready" || status === "picked_up") return "success";
  if (status === "pending" || status === "draft") return "warning";
  if (status === "no_show") return "error";
  return "muted";
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "success" | "warning" | "error" | "muted" }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        background:
          tone === "success"
            ? "var(--color-success-bg)"
            : tone === "warning"
              ? "var(--color-warning-bg)"
              : tone === "error"
                ? "var(--color-error-bg)"
                : "var(--color-cream)",
        color:
          tone === "success"
            ? "var(--color-success-text)"
            : tone === "warning"
              ? "var(--color-warning-text)"
              : tone === "error"
                ? "var(--color-error-text)"
                : "var(--color-muted)",
        border: `1px solid ${
          tone === "success"
            ? "var(--color-success-border)"
            : tone === "warning"
              ? "var(--color-warning-border)"
              : tone === "error"
                ? "var(--color-error-border)"
                : "var(--color-border)"
        }`,
      }}
    >
      {children}
    </span>
  );
}

function getSplitGroupKey(row: EventPlanRow) {
  if (row.split_group_id) return `split:${row.split_group_id}`;
  return row.source_order_id ? `source:${row.source_order_id}` : `row:${row.id}`;
}

function stopDrag(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function DraggablePlanRow({
  row,
  splitRows,
  onOpenSplit,
  onMergeSplit,
  onDelete,
  readOnly,
}: {
  row: EventPlanRow;
  splitRows: EventPlanRow[];
  onOpenSplit: (rowId: string) => void;
  onMergeSplit: (rowId: string) => void;
  onDelete: (rowId: string) => void;
  readOnly: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const hasSplitRows = splitRows.length > 0;
  const isExtra = row.row_type === "extra";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...style,
        opacity: isDragging ? 0.58 : 1,
        background: "white",
        border: "1px solid var(--color-border)",
      }}
      className="cursor-grab rounded-2xl p-3 shadow-[0_12px_30px_-24px_rgba(18,39,15,0.5)] transition-shadow active:cursor-grabbing"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onPointerDown={stopDrag}
          className="mt-0.5 rounded-xl border p-1.5 transition-all active:scale-[0.98]"
          style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "var(--color-cream)" }}
          title="Drag planned row"
          tabIndex={-1}
        >
          <DotsSixVertical size={17} weight="bold" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                {row.planned_item_name}
              </p>
              <p className="mt-1 truncate text-xs" style={{ color: "var(--color-muted)" }}>
                {row.customer_name || "Extra row"}
              </p>
            </div>
            <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums" style={{ background: "var(--color-cream)", color: "var(--color-forest)" }}>
              x{row.quantity}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={statusTone(row.status ?? "extra")}>{row.row_type === "extra" ? "Extra" : formatStatusLabel(row.status)}</Pill>
              {hasSplitRows && <Pill>{splitRows.length} split</Pill>}
              {row.flags?.includes("refresh_new_quantity") && <Pill tone="warning">Review</Pill>}
              {row.flags?.includes("refresh_conflict") && <Pill tone="error">Conflict</Pill>}
              {row.notes && <Pill><NotePencil size={12} weight="bold" /> Note</Pill>}
            </div>
            <div className="flex items-center gap-2">
              {hasSplitRows ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => onMergeSplit(row.id)}
                  disabled={readOnly}
                  className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-55"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-forest)", background: "var(--color-cream)" }}
                  title="Merge split rows"
                >
                  <GitMerge size={14} weight="bold" />
                  Merge
                </button>
              ) : isExtra ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => onOpenSplit(row.id)}
                  disabled={readOnly}
                  className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-55"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-forest)", background: "var(--color-cream)" }}
                  title="Edit extra row"
                >
                  <NotePencil size={14} weight="bold" />
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => onOpenSplit(row.id)}
                  disabled={readOnly}
                  className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-55"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-forest)", background: "var(--color-cream)" }}
                  title="Split item"
                >
                  <Scissors size={14} weight="bold" />
                  Split
                </button>
              )}
              <button
                type="button"
                onPointerDown={stopDrag}
                onClick={() => onDelete(row.id)}
                disabled={readOnly}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-[0.98] disabled:opacity-55"
                style={{ borderColor: "var(--color-border)", color: "var(--color-error-text)", background: "white" }}
                title="Delete row"
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
          </div>
          {splitRows.length > 0 && (
            <div className="mt-3 space-y-2 border-l pl-3" style={{ borderColor: "var(--color-sage)" }}>
              {splitRows.map((child) => (
                <DraggableSubRow key={child.id} row={child} onOpenSplit={onOpenSplit} onDelete={onDelete} readOnly={readOnly} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableSubRow({
  row,
  onOpenSplit,
  onDelete,
  readOnly,
}: {
  row: EventPlanRow;
  onOpenSplit: (rowId: string) => void;
  onDelete: (rowId: string) => void;
  readOnly: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...style,
        opacity: isDragging ? 0.58 : 1,
        background: "var(--color-cream)",
        borderColor: "var(--color-border)",
      }}
      className="cursor-grab rounded-xl border p-2.5 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onPointerDown={stopDrag}
          className="mt-0.5 rounded-lg p-1 transition-all active:scale-[0.98]"
          style={{ color: "var(--color-muted)" }}
          title="Drag split row"
          tabIndex={-1}
        >
          <DotsSixVertical size={15} weight="bold" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold" style={{ color: "var(--color-text)" }}>
            {row.planned_item_name} x{row.quantity}
          </p>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-muted)" }}>
            {row.pickup_location} | {row.pickup_time_slot}
          </p>
          {(row.notes || row.flags?.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {row.notes && <Pill><NotePencil size={11} weight="bold" /> Note</Pill>}
              {row.flags?.includes("refresh_new_quantity") && <Pill tone="warning">Review</Pill>}
              {row.flags?.includes("refresh_conflict") && <Pill tone="error">Conflict</Pill>}
            </div>
          )}
        </div>
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={() => onOpenSplit(row.id)}
          className="ml-auto rounded-lg p-1.5 transition-all active:scale-[0.98]"
          style={{ color: "var(--color-forest)" }}
          title="Edit split"
          disabled={readOnly}
        >
          <Scissors size={14} weight="bold" />
        </button>
        <button
          type="button"
          onPointerDown={stopDrag}
          onClick={() => onDelete(row.id)}
          className="rounded-lg p-1.5 transition-all active:scale-[0.98] disabled:opacity-55"
          style={{ color: "var(--color-error-text)" }}
          title="Delete split row"
          disabled={readOnly}
        >
          <Trash size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function TimeSlotDropZone({
  section,
  onOpenSplit,
  onMergeSplit,
  onDelete,
  readOnly,
}: {
  section: TimeSlotSection;
  onOpenSplit: (rowId: string) => void;
  onMergeSplit: (rowId: string) => void;
  onDelete: (rowId: string) => void;
  readOnly: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.id });

  return (
    <section ref={setNodeRef} className="border-t py-4 first:border-t-0" style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: "var(--color-sage)" }}>
          {section.timeSlot}
        </h3>
        <span className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums" style={{ background: "var(--color-cream)", color: "var(--color-forest)" }}>
          {section.totalQuantity}
        </span>
      </div>
      <div
        className="min-h-20 space-y-3 rounded-2xl p-3 transition-colors"
        style={{
          background: isOver ? "var(--color-cream)" : "transparent",
        }}
      >
        {section.itemGroups.length === 0 ? (
          <div className="py-5 text-center text-xs" style={{ color: "var(--color-muted)" }}>
            Drop rows here
          </div>
        ) : (
          section.itemGroups.map((group) => (
            <DraggablePlanRow
              key={`${group.parent.id}-${group.location}-${group.timeSlot}`}
              row={group.parent}
              splitRows={group.children}
              onOpenSplit={onOpenSplit}
              onMergeSplit={onMergeSplit}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </section>
  );
}

function LocationLane({
  lane,
  laneIndex,
  onOpenSplit,
  onMergeSplit,
  onDelete,
  readOnly,
}: {
  lane: LocationLane;
  laneIndex: number;
  onOpenSplit: (rowId: string) => void;
  onMergeSplit: (rowId: string) => void;
  onDelete: (rowId: string) => void;
  readOnly: boolean;
}) {
  return (
    <section
      className={laneIndex === 0 ? "pl-0 xl:pl-0" : "border-l pl-4"}
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
            {lane.location}
          </h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
            {lane.timeSlots.length} time section{lane.timeSlots.length === 1 ? "" : "s"}
          </p>
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-bold tabular-nums" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
          {lane.totalQuantity}
        </span>
      </div>
      <div>
        {lane.timeSlots.map((section) => (
          <TimeSlotDropZone key={section.id} section={section} onOpenSplit={onOpenSplit} onMergeSplit={onMergeSplit} onDelete={onDelete} readOnly={readOnly} />
        ))}
      </div>
    </section>
  );
}

function SkeletonEditor() {
  return (
    <div className="w-full space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-28 animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="h-[420px] animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} />
        <div className="h-[420px] animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} />
      </div>
    </div>
  );
}

export default function PlanningEditorClient({ planId }: PlanningEditorClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [plan, setPlan] = useState<EventPlan | null>(null);
  const [snapshot, setSnapshot] = useState<EventPlanSnapshot | null>(null);
  const [savedSnapshotText, setSavedSnapshotText] = useState("");
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("board");
  const [activeSplitRowId, setActiveSplitRowId] = useState<string | null>(null);
  const [splitDraftRows, setSplitDraftRows] = useState<EventPlanRow[]>([]);
  const [splitDraftOrderNotes, setSplitDraftOrderNotes] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    location: "all",
    item: "all",
    needsReview: false,
  });
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const splitPanelRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const loadPlan = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/admin/event-plans/${planId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to load event plan"));
    const data = (await res.json()) as EventPlan;
    const nextSnapshot = normalizeSnapshot(data.snapshot as EventPlanSnapshot);
    setPlan(data);
    setSnapshot(nextSnapshot);
    setSavedSnapshotText(JSON.stringify(nextSnapshot));
    setName(data.name);
    setSavedName(data.name);
    setActiveSplitRowId(null);
    setSplitDraftRows([]);
    setSplitDraftOrderNotes("");
  }, [planId]);

  useEffect(() => {
    setLoading(true);
    loadPlan()
      .catch((error) => showToast(error instanceof Error ? error.message : "Failed to load event plan", "error"))
      .finally(() => setLoading(false));
  }, [loadPlan, showToast]);

  const isDirty = useMemo(() => {
    if (!snapshot) return false;
    return name !== savedName || JSON.stringify(snapshot) !== savedSnapshotText;
  }, [name, savedName, savedSnapshotText, snapshot]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (!activeSplitRowId) return;
    function handlePointerDown(event: MouseEvent) {
      if (splitPanelRef.current && !splitPanelRef.current.contains(event.target as Node)) {
        setActiveSplitRowId(null);
        setSplitDraftRows([]);
        setSplitDraftOrderNotes("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [activeSplitRowId]);

  useEffect(() => {
    if (!actionsOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [actionsOpen]);

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action || !plan || isDirty) return;
    if (action === "duplicate") {
      void handleDuplicate();
    }
    if (action === "archive" && plan.status !== "archived") {
      void handleArchive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, searchParams, isDirty]);

  const clientTotals = useMemo(() => (snapshot ? getPlanTotals(snapshot) : null), [snapshot]);

  const itemNames = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(
      new Set([
        ...snapshot.order_lines.map((line) => line.item_name).filter(Boolean),
        ...snapshot.planned_rows.map((row) => row.planned_item_name).filter(Boolean),
      ])
    ).sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const locations = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Set([
      ...snapshot.order_lines.map((line) => line.pickup_location || "Unassigned"),
      ...snapshot.planned_rows.map((row) => row.pickup_location || "Unassigned"),
    ])).sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const timeSlots = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Set([
      ...snapshot.order_lines.map((line) => line.pickup_time_slot || "Unassigned"),
      ...snapshot.planned_rows.map((row) => row.pickup_time_slot || "Unassigned"),
    ])).sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const statusOptions = useMemo(() => {
    if (!snapshot) return [{ value: "all", label: "All status" }];
    const statuses = Array.from(new Set([...Object.keys(snapshot.status_breakdown), "extra"]));
    return [
      { value: "all", label: "All status" },
      ...statuses.map((status) => ({ value: status, label: status === "extra" ? "Extra" : formatStatusLabel(status) })),
    ];
  }, [snapshot]);

  const locationOptions = useMemo(() => [
    { value: "all", label: "All locations" },
    ...locations.map((location) => ({ value: location, label: location })),
  ], [locations]);

  const itemOptions = useMemo(() => [
    { value: "all", label: "All items" },
    ...itemNames.map((item) => ({ value: item, label: item })),
  ], [itemNames]);

  const activeSplitRow = useMemo(
    () => snapshot?.planned_rows.find((row) => row.id === activeSplitRowId) ?? null,
    [activeSplitRowId, snapshot]
  );

  const activeSplitLimit = useMemo(() => {
    if (!activeSplitRow?.source_order_id || !snapshot) return null;
    const line = snapshot.order_lines.find((entry) => entry.id === activeSplitRow.source_order_id);
    return Math.max(1, Number(line?.quantity || activeSplitRow.ordered_quantity || activeSplitRow.quantity || 1));
  }, [activeSplitRow, snapshot]);

  const splitLimitReached = activeSplitLimit !== null && splitDraftRows.length >= activeSplitLimit;

  const activeSplitBundle = useMemo(() => {
    if (!activeSplitRow?.source_bundle_id || !snapshot) return null;
    return snapshot.bundles.find((bundle) => bundle.bundle_id === activeSplitRow.source_bundle_id) ?? null;
  }, [activeSplitRow, snapshot]);

  const filteredBoardRows = useMemo(() => {
    if (!snapshot) return [];
    const query = filters.search.trim().toLowerCase();
    const issueRowIds = new Set([...(snapshot.issues ?? []), ...(snapshot.warnings ?? [])].map((issue) => issue.row_id).filter(Boolean));
    return snapshot.planned_rows.filter((row) => {
      if (row.row_state === "removed") return false;
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.location !== "all" && row.pickup_location !== filters.location) return false;
      if (filters.item !== "all" && row.planned_item_name !== filters.item) return false;
      if (filters.needsReview && !issueRowIds.has(row.id) && !(row.flags ?? []).some((flag) => flag.includes("refresh"))) return false;
      if (!query) return true;
      return `${row.customer_name} ${row.planned_item_name} ${row.pickup_location} ${row.pickup_time_slot}`.toLowerCase().includes(query);
    });
  }, [filters, snapshot]);

  const boardLanes = useMemo(() => {
    const laneMap = new Map<string, Map<string, EventPlanRow[]>>();
    const laneLocations = filters.location === "all" ? locations : [filters.location];
    for (const location of laneLocations) {
      laneMap.set(location, new Map(timeSlots.map((timeSlot) => [timeSlot, []])));
    }
    for (const row of filteredBoardRows) {
      const location = row.pickup_location || "Unassigned";
      const timeSlot = row.pickup_time_slot || "Unassigned";
      if (!laneMap.has(location)) laneMap.set(location, new Map());
      const slotMap = laneMap.get(location);
      if (!slotMap?.has(timeSlot)) slotMap?.set(timeSlot, []);
      slotMap?.get(timeSlot)?.push(row);
    }

    return Array.from(laneMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([location, slotMap]) => {
        const timeSlots = Array.from(slotMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([timeSlot, rows]) => {
            const groupedRows = new Map<string, EventPlanRow[]>();
            for (const row of rows) {
              const key = getSplitGroupKey(row);
              if (!groupedRows.has(key)) groupedRows.set(key, []);
              groupedRows.get(key)?.push(row);
            }
            const itemGroups = Array.from(groupedRows.values()).map((groupRows) => {
              const sortedRows = [...groupRows].sort((a, b) => {
                if (a.id === activeSplitRowId) return -1;
                if (b.id === activeSplitRowId) return 1;
                return Number(b.quantity || 0) - Number(a.quantity || 0);
              });
              const [parent, ...children] = sortedRows;
              return {
                location,
                timeSlot,
                parent,
                children,
                totalQuantity: sortedRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
              };
            });
            return {
              id: makeDropId(location, timeSlot),
              timeSlot,
              itemGroups,
              totalQuantity: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
            };
          });
        return {
          location,
          timeSlots,
          totalQuantity: timeSlots.reduce((sum, section) => sum + section.totalQuantity, 0),
        };
      });
  }, [activeSplitRowId, filteredBoardRows, filters.location, locations, timeSlots]);

  const quantityBreakdown = useMemo<ReportLocationTotal[]>(() => {
    if (!snapshot) return [];
    const locationMap = new Map<string, Map<string, Map<string, number>>>();
    for (const row of snapshot.planned_rows) {
      if (row.row_state === "removed") continue;
      const location = row.pickup_location || "Unassigned";
      const timeSlot = row.pickup_time_slot || "Unassigned";
      const item = row.planned_item_name || "Unassigned";
      if (!locationMap.has(location)) locationMap.set(location, new Map());
      const timeMap = locationMap.get(location);
      if (!timeMap?.has(timeSlot)) timeMap?.set(timeSlot, new Map());
      const itemMap = timeMap?.get(timeSlot);
      if (itemMap) itemMap.set(item, (itemMap.get(item) ?? 0) + Number(row.quantity || 0));
    }
    return Array.from(locationMap.entries())
      .map(([location, timeMap]) => {
        const timeSlots = Array.from(timeMap.entries())
          .map(([timeSlot, itemMap]) => {
            const items = Array.from(itemMap.entries())
              .map(([item, quantity]) => ({ item, quantity }))
              .sort((a, b) => b.quantity - a.quantity || a.item.localeCompare(b.item));
            return {
              timeSlot,
              items,
              totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
            };
          })
          .sort((a, b) => a.timeSlot.localeCompare(b.timeSlot));
        return {
          location,
          timeSlots,
          totalQuantity: timeSlots.reduce((sum, timeSlot) => sum + timeSlot.totalQuantity, 0),
        };
      })
      .sort((a, b) => b.totalQuantity - a.totalQuantity || a.location.localeCompare(b.location));
  }, [snapshot]);

  const customerHandoffRows = useMemo(() => {
    if (!snapshot) return [];
    const bundleNotes = new Map(snapshot.bundles.map((bundle) => [bundle.bundle_id, bundle.order_notes || ""]));
    const map = new Map<string, { location: string; timeSlot: string; customer: string; status: string; items: string[]; notes: string[] }>();
    for (const row of snapshot.planned_rows) {
      if (row.row_state === "removed") continue;
      const key = [
        row.pickup_location || "Unassigned",
        row.pickup_time_slot || "Unassigned",
        row.customer_name || "Extra",
        row.status || "extra",
        row.source_bundle_id || "",
      ].join("|||");
      const current = map.get(key) ?? {
        location: row.pickup_location || "Unassigned",
        timeSlot: row.pickup_time_slot || "Unassigned",
        customer: row.customer_name || "Extra",
        status: row.status || "extra",
        items: [],
        notes: [],
      };
      current.items.push(`${row.planned_item_name} x${row.quantity}`);
      if (row.notes) current.notes.push(row.notes);
      const bundleNote = row.source_bundle_id ? bundleNotes.get(row.source_bundle_id) : "";
      if (bundleNote && !current.notes.includes(bundleNote)) current.notes.unshift(bundleNote);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => `${a.location} ${a.timeSlot} ${a.customer}`.localeCompare(`${b.location} ${b.timeSlot} ${b.customer}`));
  }, [snapshot]);

  function updateSnapshot(updater: (draft: EventPlanSnapshot) => void) {
    setSnapshot((current) => {
      if (!current) return current;
      const draft = cloneSnapshot(current);
      updater(draft);
      return draft;
    });
  }

  function updateRow(rowId: string, patch: Partial<EventPlanRow>) {
    updateSnapshot((draft) => {
      draft.planned_rows = draft.planned_rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));
    });
  }

  function performDeletePlannedRow(rowId: string) {
    const row = snapshot?.planned_rows.find((entry) => entry.id === rowId);
    if (!row) return;
    updateSnapshot((draft) => {
      if (row.row_type === "extra") {
        draft.planned_rows = draft.planned_rows.filter((entry) => entry.id !== rowId);
      } else {
        draft.planned_rows = draft.planned_rows.map((entry) => {
          if (entry.id !== rowId) return entry;
          return {
            ...entry,
            row_state: "removed",
            flags: Array.from(new Set([...(entry.flags ?? []), "user_removed"])),
          };
        });
      }
    });
    if (activeSplitRowId === rowId) closeSplitPanel();
  }

  function deletePlannedRow(rowId: string) {
    if (readOnly) return;
    const row = snapshot?.planned_rows.find((entry) => entry.id === rowId);
    if (!row) return;
    const label = row.row_type === "extra" ? "extra row" : "planned row";
    setConfirmDialog({
      intent: "delete-row",
      rowId,
      title: `Delete ${label}`,
      body: `This ${label} will be removed from the board. This cannot be undone after saving.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
  }

  function mergeSplitRows(rowId: string) {
    if (readOnly || !snapshot) return;
    const row = snapshot.planned_rows.find((entry) => entry.id === rowId);
    if (!row) return;
    const groupKey = getSplitGroupKey(row);
    const rows = snapshot.planned_rows.filter((entry) => entry.row_state !== "removed" && getSplitGroupKey(entry) === groupKey);
    if (rows.length < 2) return;
    const sourceLine = row.source_order_id ? snapshot.order_lines.find((entry) => entry.id === row.source_order_id) : null;
    const originalRow = rows.find((entry) => entry.id === rowId)
      ?? rows.find((entry) => entry.planned_item_name === entry.original_item_name)
      ?? rows[0];
    const totalQuantity = rows.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
    const mergedNotes = Array.from(new Set(rows.map((entry) => entry.notes.trim()).filter(Boolean))).join(" | ");
    const preservedFlags = Array.from(new Set(rows.flatMap((entry) => entry.flags ?? [])))
      .filter((flag) => !["manual_split", "manual_duplicate", "refresh_new_quantity"].includes(flag));
    updateSnapshot((draft) => {
      const mergedRow: EventPlanRow = {
        ...originalRow,
        id: originalRow.id,
        row_state: "active",
        planned_item_id: sourceLine?.item_id ?? originalRow.original_item_id ?? originalRow.planned_item_id,
        planned_item_name: sourceLine?.item_name ?? originalRow.original_item_name ?? originalRow.planned_item_name,
        quantity: Math.max(1, totalQuantity),
        pickup_location: sourceLine?.pickup_location ?? originalRow.pickup_location,
        pickup_time_slot: sourceLine?.pickup_time_slot ?? originalRow.pickup_time_slot,
        notes: mergedNotes,
        flags: preservedFlags,
      };
      draft.planned_rows = [
        ...draft.planned_rows.filter((entry) => getSplitGroupKey(entry) !== groupKey),
        mergedRow,
      ];
    });
    if (rows.some((entry) => entry.id === activeSplitRowId)) closeSplitPanel();
  }

  function openSplitPanel(rowId: string) {
    if (!snapshot) return;
    const row = snapshot.planned_rows.find((entry) => entry.id === rowId);
    if (!row) return;
    const groupKey = getSplitGroupKey(row);
    const rows = snapshot.planned_rows.filter((entry) => entry.row_state !== "removed" && getSplitGroupKey(entry) === groupKey);
    const bundle = row.source_bundle_id
      ? snapshot.bundles.find((entry) => entry.bundle_id === row.source_bundle_id)
      : null;
    setActiveSplitRowId(rowId);
    setSplitDraftRows(cloneSnapshot({ ...snapshot, planned_rows: rows }).planned_rows);
    setSplitDraftOrderNotes(bundle?.order_notes ?? "");
  }

  function closeSplitPanel() {
    setActiveSplitRowId(null);
    setSplitDraftRows([]);
    setSplitDraftOrderNotes("");
  }

  function updateDraftRow(rowId: string, patch: Partial<EventPlanRow>) {
    setSplitDraftRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function performDeleteDraftRow(rowId: string) {
    setSplitDraftRows((rows) => rows.filter((row) => row.id !== rowId));
  }

  function deleteDraftRow(rowId: string) {
    if (readOnly) return;
    setConfirmDialog({
      intent: "delete-draft-row",
      rowId,
      title: "Delete split row",
      body: "This split row will be removed from the edit panel. This cannot be undone after saving.",
      confirmLabel: "Delete",
      variant: "danger",
    });
  }

  function splitDraftRow(row: EventPlanRow) {
    if (row.row_type === "extra") {
      showToast("Use the Extra button to add extra rows.", "error");
      return;
    }
    if (activeSplitLimit !== null && splitDraftRows.length >= activeSplitLimit) {
      showToast(`This order can have at most ${activeSplitLimit} split row${activeSplitLimit === 1 ? "" : "s"}.`, "error");
      return;
    }
    const quantity = Math.max(1, Number(row.quantity || 1));
    if (quantity <= 1) {
      showToast("This row is already at the minimum split quantity.", "error");
      return;
    }
    const splitQuantity = quantity > 1 ? Math.floor(quantity / 2) : 1;
    const splitGroupId = row.source_order_id ? row.split_group_id : row.split_group_id ?? row.id;
    setSplitDraftRows((rows) => [
      ...rows.map((entry) => (
        entry.id === row.id
          ? { ...entry, split_group_id: entry.source_order_id ? entry.split_group_id : splitGroupId, quantity: Math.max(1, quantity - splitQuantity) }
          : entry
      )),
      {
        ...row,
        id: `plan-row-${crypto.randomUUID()}`,
        split_group_id: row.source_order_id ? row.split_group_id : splitGroupId,
        quantity: splitQuantity,
        flags: Array.from(new Set([...(row.flags ?? []), "manual_split"])),
      },
    ]);
  }

  function resetDraftOrder(sourceOrderId: string) {
    if (!snapshot) return;
    const line = snapshot.order_lines.find((entry) => entry.id === sourceOrderId);
    if (!line) return;
    setSplitDraftRows([buildOriginalRow(line)]);
  }

  function autoBalanceDraft(sourceOrderId: string) {
    if (!snapshot) return;
    const line = snapshot.order_lines.find((entry) => entry.id === sourceOrderId);
    if (!line) return;
    setSplitDraftRows((rows) => {
      if (rows.length === 0) return [buildOriginalRow(line)];
      const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      const delta = line.quantity - total;
      const last = rows[rows.length - 1];
      return rows.map((row) => (
        row.id === last.id ? { ...row, quantity: Math.max(1, Number(row.quantity || 0) + delta) } : row
      ));
    });
  }

  function saveSplitPanel() {
    if (!activeSplitRow || splitDraftRows.length === 0) return;
    if (activeSplitLimit !== null && splitDraftRows.length > activeSplitLimit) {
      showToast(`This order can have at most ${activeSplitLimit} split row${activeSplitLimit === 1 ? "" : "s"}.`, "error");
      return;
    }
    const groupKey = getSplitGroupKey(activeSplitRow);
    updateSnapshot((draft) => {
      draft.planned_rows = [
        ...draft.planned_rows.filter((row) => getSplitGroupKey(row) !== groupKey),
        ...splitDraftRows.map((row) => ({ ...row, quantity: Math.max(1, Number(row.quantity || 1)) })),
      ];
      if (activeSplitRow.source_bundle_id) {
        draft.bundles = draft.bundles.map((bundle) => (
          bundle.bundle_id === activeSplitRow.source_bundle_id
            ? { ...bundle, order_notes: splitDraftOrderNotes }
            : bundle
        ));
      }
    });
    closeSplitPanel();
  }

  function addExtraRow() {
    updateSnapshot((draft) => {
      const firstRow = draft.planned_rows.find((row) => row.row_state !== "removed");
      draft.planned_rows.push({
        id: `plan-row-${crypto.randomUUID()}`,
        row_type: "extra",
        row_state: "active",
        source_order_id: null,
        source_bundle_id: null,
        customer_name: "Extra",
        status: "extra",
        original_item_id: null,
        original_item_name: null,
        ordered_quantity: 0,
        planned_item_id: null,
        planned_item_name: "Extra",
        quantity: 1,
        pickup_location: firstRow?.pickup_location ?? "",
        pickup_time_slot: firstRow?.pickup_time_slot ?? "",
        notes: "",
        flags: ["extra"],
      });
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const rowId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId) return;
    const { location, timeSlot } = parseDropId(overId);
    updateRow(rowId, { pickup_location: location, pickup_time_slot: timeSlot });
  }

  function handleConfirmDialog() {
    if (!confirmDialog) return;
    const dialog = confirmDialog;
    setConfirmDialog(null);
    if (dialog.intent === "delete-row" && dialog.rowId) {
      performDeletePlannedRow(dialog.rowId);
      return;
    }
    if (dialog.intent === "delete-draft-row" && dialog.rowId) {
      performDeleteDraftRow(dialog.rowId);
      return;
    }
    if (dialog.intent === "refresh") {
      void performRefresh();
      return;
    }
    if (dialog.intent === "archive") {
      void performArchive();
    }
  }

  async function handleSave() {
    if (!plan || !snapshot) return;
    setSaving(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/event-plans/${plan.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expected_updated_at: plan.updated_at,
          name: name.trim() || plan.name,
          snapshot,
        }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to save plan"));
      const data = (await res.json()) as EventPlan;
      const nextSnapshot = normalizeSnapshot(data.snapshot as EventPlanSnapshot);
      setPlan(data);
      setSnapshot(nextSnapshot);
      setSavedSnapshotText(JSON.stringify(nextSnapshot));
      setSavedName(data.name);
      setName(data.name);
      showToast("Plan saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save plan", "error");
    } finally {
      setSaving(false);
    }
  }

  async function stateAction(path: string, successMessage: string) {
    if (!plan || isDirty) return;
    const token = await getAdminToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/admin/event-plans/${plan.id}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expected_updated_at: plan.updated_at }),
    });
    if (!res.ok) throw new Error(await getApiErrorMessage(res, `Failed to ${path.replace("-", " ")}`));
    const data = (await res.json()) as EventPlan;
    const nextSnapshot = normalizeSnapshot(data.snapshot as EventPlanSnapshot);
    setPlan(data);
    setSnapshot(nextSnapshot);
    setSavedSnapshotText(JSON.stringify(nextSnapshot));
    setSavedName(data.name);
    setName(data.name);
    showToast(successMessage, "success");
  }

  async function performRefresh() {
    try {
      await stateAction("refresh", "Plan refreshed.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to refresh plan", "error");
    }
  }

  function handleRefresh() {
    setConfirmDialog({
      intent: "refresh",
      title: "Refresh plan",
      body: "Refresh this saved snapshot from current non-cancelled orders? Manual splits will be preserved where possible.",
      confirmLabel: "Refresh",
    });
  }

  async function handleMarkReady() {
    try {
      await stateAction("mark-ready", "Plan marked ready.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Plan has blocking issues", "error");
    }
  }

  async function performArchive() {
    try {
      await stateAction("archive", "Plan archived.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to archive plan", "error");
    }
  }

  function handleArchive() {
    setConfirmDialog({
      intent: "archive",
      title: "Archive plan",
      body: "Archive this plan? It will become read-only until restored.",
      confirmLabel: "Archive",
      variant: "danger",
    });
  }

  async function handleRestore() {
    try {
      await stateAction("restore", "Plan restored to draft.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to restore plan", "error");
    }
  }

  async function handleDuplicate() {
    if (!plan || isDirty) return;
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/event-plans/${plan.id}/duplicate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: null }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to duplicate plan"));
      const duplicate = (await res.json()) as EventPlan;
      router.push(`/admin/planning/${duplicate.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to duplicate plan", "error");
    }
  }

  async function handleExportPdf() {
    if (!plan || isDirty || issues.length > 0) return;
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/event-plans/${plan.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to export PDF"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = (plan.name || "event-plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event-plan";
      link.href = url;
      link.download = `${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("PDF exported.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to export PDF", "error");
    }
  }

  const readOnly = plan?.status === "archived";
  const cleanStateRequired = isDirty || saving || readOnly;
  const currentIssues = snapshot?.issues ?? [];
  const exportDisabled = isDirty || saving || currentIssues.length > 0;

  if (loading) return <SkeletonEditor />;
  if (!plan || !snapshot || !clientTotals) {
    return (
      <div className="px-6 py-10">
        <p style={{ color: "var(--color-error-text)" }}>Event plan could not be loaded.</p>
      </div>
    );
  }

  const issues = currentIssues;
  const warnings = snapshot.warnings ?? [];

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {toast && (
        <div
          className="fixed bottom-6 right-6 max-w-[360px] rounded-2xl px-5 py-3 text-sm font-semibold shadow-[0_24px_70px_-26px_rgba(28,28,26,0.62)]"
          style={{
            background: toast.type === "success" ? "var(--color-success-bg)" : "var(--color-error-bg)",
            border: `1px solid ${toast.type === "success" ? "var(--color-success-border)" : "var(--color-error-border)"}`,
            color: toast.type === "success" ? "var(--color-success-text)" : "var(--color-error-text)",
            zIndex: 220,
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="w-full space-y-5">
        <header className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_auto] xl:items-start">
            <div className="min-w-0">
              <button type="button" onClick={() => router.push("/admin/planning")} className="mb-4 text-sm font-semibold" style={{ color: "var(--color-sage)" }}>
                Back to planning
              </button>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={readOnly}
                className="w-full border-0 bg-transparent px-0 py-1 text-2xl font-bold outline-none transition-all md:text-3xl"
                style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Pill tone={statusTone(plan.status)}>{plan.status === "archived" ? "Archived" : plan.status === "ready" ? "Ready" : "Draft"}</Pill>
                {plan.is_out_of_date && <Pill tone="warning">Refresh available</Pill>}
                {isDirty && <Pill tone="warning">Unsaved changes</Pill>}
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {snapshot.source_event.name} | {snapshot.source_event.event_date} | Updated {formatDateTime(plan.updated_at)}
                </span>
              </div>
            </div>

	            <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
	              <div className="inline-grid h-10 grid-cols-2 rounded-xl p-1 shadow-[0_18px_42px_-32px_rgba(28,28,26,0.45)]" style={{ background: "var(--color-accent)" }}>
	                {(["board", "preview"] as EditorTab[]).map((tab) => (
	                  <button
	                    key={tab}
	                    type="button"
	                    onClick={() => setActiveTab(tab)}
	                    className="h-8 rounded-lg px-3 text-xs font-bold transition-all active:scale-[0.98] sm:min-w-28"
	                    style={{
	                      background: activeTab === tab ? "var(--color-text)" : "transparent",
	                      color: activeTab === tab ? "var(--color-cream)" : "var(--color-text)",
	                    }}
	                  >
	                    {tab === "board" ? "Plan Board" : "Report Preview"}
	                  </button>
	                ))}
	              </div>
	              {plan.status !== "archived" && (
	                <button
	                  type="button"
	                  onClick={handleRefresh}
	                  disabled={cleanStateRequired}
	                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
	                  style={{ background: "white", borderColor: "var(--color-border)", color: "var(--color-text)" }}
	                  title="Refresh"
	                >
	                  <ArrowsClockwise size={17} weight="bold" />
	                </button>
	              )}
	              <button
	                type="button"
	                onClick={handleSave}
	                disabled={!isDirty || saving || readOnly}
	                className="inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
	                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
	              >
	                <FloppyDisk size={17} weight="bold" />
	                {saving ? "Saving..." : "Save"}
	              </button>
	              <div ref={actionsMenuRef} className="relative">
	                <button
	                  type="button"
	                  onClick={() => setActionsOpen((value) => !value)}
	                  className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-all active:scale-[0.98]"
	                  style={{ background: "white", borderColor: "var(--color-border)", color: "var(--color-text)" }}
	                >
	                  Actions
	                  <CaretDown size={14} weight="bold" />
	                </button>
	                {actionsOpen && (
	                  <div className="absolute right-0 top-12 z-[70] w-56 rounded-2xl border bg-white p-1.5 shadow-[0_22px_60px_-32px_rgba(28,28,26,0.45)]" style={{ borderColor: "var(--color-border)" }}>
	                    <button
	                      type="button"
	                      onClick={() => {
	                        setActionsOpen(false);
	                        void handleExportPdf();
	                      }}
	                      disabled={exportDisabled}
	                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
	                      style={{ color: "var(--color-text)" }}
	                      title={issues.length > 0 ? "Resolve blocking issues before export" : isDirty ? "Save changes before export" : "Export PDF"}
	                    >
	                      <FilePdf size={16} />
	                      Export PDF
	                    </button>
	                    {plan.status === "archived" ? (
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setActionsOpen(false);
	                          void handleRestore();
	                        }}
	                        disabled={isDirty}
	                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
	                        style={{ color: "var(--color-text)" }}
	                      >
	                        <Archive size={16} />
	                        Restore
	                      </button>
	                    ) : (
	                      <>
	                        <button
	                          type="button"
	                          onClick={() => {
	                            setActionsOpen(false);
	                            void handleMarkReady();
	                          }}
	                          disabled={cleanStateRequired}
	                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
	                          style={{ color: "var(--color-text)" }}
	                        >
	                          <CheckCircle size={16} />
	                          Mark as ready
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => {
	                            setActionsOpen(false);
	                            void handleArchive();
	                          }}
	                          disabled={cleanStateRequired}
	                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
	                          style={{ color: "var(--color-text)" }}
	                        >
	                          <Archive size={16} />
	                          Archive
	                        </button>
	                      </>
	                    )}
	                    <button
	                      type="button"
	                      onClick={() => {
	                        setActionsOpen(false);
	                        void handleDuplicate();
	                      }}
	                      disabled={isDirty}
	                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
	                      style={{ color: "var(--color-text)" }}
	                    >
	                      <Copy size={16} />
	                      Duplicate
	                    </button>
	                  </div>
	                )}
	              </div>
	            </div>
          </div>

	          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
	            {[
	              { label: "Orders", value: snapshot.totals.included_order_count, detail: "included", tone: "forest" },
	              { label: "Ordered", value: clientTotals.orderedQuantity, detail: "quantity", tone: "sage" },
	              { label: "Planned", value: clientTotals.plannedQuantity, detail: clientTotals.overCount > 0 ? `${clientTotals.overCount} over` : "quantity", tone: "accent" },
	              { label: "Issues", value: `${issues.length} / ${warnings.length}`, detail: "issues / warnings", tone: issues.length > 0 ? "error" : "forest" },
	            ].map((metric) => (
	              <div
	                key={metric.label}
	                className="relative overflow-hidden rounded-2xl px-4 py-3 shadow-[0_18px_40px_-34px_rgba(18,39,15,0.45)]"
	                style={{
	                  background: "white",
	                  border: "1px solid var(--color-border)",
	                }}
	              >
	                <span
	                  className="absolute left-0 top-0 h-full w-1.5"
	                  style={{
	                    background:
	                      metric.tone === "accent"
	                        ? "var(--color-accent)"
	                        : metric.tone === "sage"
	                          ? "var(--color-sage)"
	                          : metric.tone === "error"
	                            ? "var(--color-error-border)"
	                            : "var(--color-forest)",
	                  }}
	                />
	                <p className="pl-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--color-muted)" }}>{metric.label}</p>
	                <p className="mt-1 pl-2 text-3xl font-bold tabular-nums" style={{ color: "var(--color-forest)" }}>{metric.value}</p>
	                <p className="mt-0.5 pl-2 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>{metric.detail}</p>
	              </div>
	            ))}
	          </div>
        </header>

	        {activeTab === "board" ? (
	          <div className="space-y-5">
	            <section className="py-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_150px_150px_150px_auto]">
                <input value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} className="rounded-2xl border bg-white px-4 py-3 text-sm outline-none" placeholder="Search rows" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                <CustomSelect options={statusOptions} value={filters.status} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
                <CustomSelect options={locationOptions} value={filters.location} onChange={(value) => setFilters((prev) => ({ ...prev, location: value }))} />
                <CustomSelect options={itemOptions} value={filters.item} onChange={(value) => setFilters((prev) => ({ ...prev, item: value }))} />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
                    <input type="checkbox" checked={filters.needsReview} onChange={(event) => setFilters((prev) => ({ ...prev, needsReview: event.target.checked }))} className="accent-[var(--color-forest)]" />
                    Review
                  </label>
                  <button type="button" onClick={addExtraRow} disabled={readOnly} className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-55" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
                    <Plus size={15} weight="bold" />
                    Extra
                  </button>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>Plan notes</span>
                <textarea rows={1} value={snapshot.plan_notes} disabled={readOnly} onChange={(event) => updateSnapshot((draft) => { draft.plan_notes = event.target.value; })} className="min-h-11 w-full resize-y rounded-2xl border bg-white px-4 py-3 text-sm outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
              </label>
            </section>

            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {filteredBoardRows.length === 0 ? (
	                <div className="p-8 text-center" style={{ color: "var(--color-muted)" }}>
	                  No planned rows match the filters.
	                </div>
	              ) : (
	                <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
	                  {boardLanes.map((lane, laneIndex) => (
	                    <LocationLane key={lane.location} lane={lane} laneIndex={laneIndex} onOpenSplit={openSplitPanel} onMergeSplit={mergeSplitRows} onDelete={deletePlannedRow} readOnly={readOnly} />
	                  ))}
	                </div>
              )}
            </DndContext>

            {activeSplitRow && (
              <div className="fixed inset-0" style={{ zIndex: 120 }}>
                <button
                  type="button"
                  aria-label="Close split panel"
                  onClick={closeSplitPanel}
                  className="absolute inset-0 h-full w-full cursor-default bg-[rgba(28,28,26,0.28)]"
                />
                <aside
                  ref={splitPanelRef}
                  className="absolute bottom-0 right-0 top-0 w-full max-w-[480px] overflow-y-auto border-l bg-white p-5 shadow-[0_24px_90px_-34px_rgba(18,39,15,0.62)]"
                  style={{ borderColor: "var(--color-border)" }}
                >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "var(--color-sage)" }}>{activeSplitRow.row_type === "extra" ? "Edit extra" : "Split item"}</p>
                    <h2 className="mt-1 text-xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                      {activeSplitRow.planned_item_name}
                    </h2>
                    <p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{activeSplitRow.customer_name}</p>
                  </div>
                  <button type="button" onClick={closeSplitPanel} className="rounded-xl border p-2 transition-all active:scale-[0.98]" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "white" }} title="Close split panel">
                    <X size={16} weight="bold" />
                  </button>
                </div>

                {activeSplitBundle && (
                  <label className="mb-5 grid gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Order notes</span>
                    <textarea
                      value={splitDraftOrderNotes}
                      disabled={readOnly}
                      onChange={(event) => setSplitDraftOrderNotes(event.target.value)}
                      className="min-h-20 rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                    />
                  </label>
                )}

                {activeSplitLimit !== null && (
                  <div className="mb-5 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--color-border)", background: "var(--color-cream)", color: "var(--color-text)" }}>
                    <span className="font-semibold">Split rows:</span> {splitDraftRows.length} of {activeSplitLimit}
                    {splitLimitReached && <span className="ml-2 font-semibold" style={{ color: "var(--color-warning-text)" }}>Limit reached</span>}
                  </div>
                )}

                <div className="space-y-4">
                  {splitDraftRows.map((row) => (
                    <div key={row.id} className="border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: "var(--color-border)" }}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <Pill tone={row.id === activeSplitRowId ? "success" : "muted"}>{row.id === activeSplitRowId ? "Selected" : "Subitem"}</Pill>
                        <div className="flex flex-wrap justify-end gap-2">
                          {row.row_type !== "extra" && (
                            <button type="button" onClick={() => splitDraftRow(row)} disabled={readOnly || splitLimitReached || Number(row.quantity || 0) <= 1} className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-55" style={{ borderColor: "var(--color-border)", background: "white", color: "var(--color-text)" }}>Split</button>
                          )}
                          <button type="button" onClick={() => deleteDraftRow(row.id)} disabled={readOnly} className="inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-[0.98] disabled:opacity-55" style={{ borderColor: "var(--color-border)", background: "white", color: "var(--color-error-text)" }} title="Delete split row">
                            <Trash size={14} weight="bold" />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Qty</span>
                          <input type="number" min={1} value={row.quantity} disabled={readOnly} onChange={(event) => updateDraftRow(row.id, { quantity: Number(event.target.value) })} className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Planned item</span>
                          <input value={row.planned_item_name} disabled={readOnly} onChange={(event) => updateDraftRow(row.id, { planned_item_id: null, planned_item_name: event.target.value })} className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Location</span>
                          <input value={row.pickup_location} disabled={readOnly} onChange={(event) => updateDraftRow(row.id, { pickup_location: event.target.value })} className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Time slot</span>
                          <input value={row.pickup_time_slot} disabled={readOnly} onChange={(event) => updateDraftRow(row.id, { pickup_time_slot: event.target.value })} className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                        </label>
                        <label className="grid min-w-0 gap-1 sm:col-span-2">
                          <span className="text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Row notes</span>
                          <input value={row.notes} disabled={readOnly} onChange={(event) => updateDraftRow(row.id, { notes: event.target.value })} className="w-full min-w-0 rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                {activeSplitRow.source_order_id && (
                  <div className="mt-5 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
                    <button type="button" onClick={() => autoBalanceDraft(activeSplitRow.source_order_id as string)} disabled={readOnly} className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--color-border)", background: "white", color: "var(--color-text)" }}>Auto-balance</button>
                    <button type="button" onClick={() => resetDraftOrder(activeSplitRow.source_order_id as string)} disabled={readOnly} className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--color-border)", background: "white", color: "var(--color-text)" }}>Reset order</button>
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
                  <button type="button" onClick={closeSplitPanel} className="rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]" style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "white" }}>
                    Cancel
                  </button>
                  <button type="button" onClick={saveSplitPanel} disabled={readOnly || splitDraftRows.length === 0} className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-55" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
                    {activeSplitRow.row_type === "extra" ? "Save Extra" : "Save Split"}
                  </button>
                </div>
                </aside>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
            <section className="rounded-[1.5rem] border p-5" style={{ background: "white", borderColor: "var(--color-border)" }}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{name}</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{snapshot.source_event.name} | {snapshot.source_event.event_date}</p>
                </div>
	                <div className="rounded-[1.1rem] px-4 py-3 text-right shadow-[0_18px_42px_-34px_rgba(18,39,15,0.45)]" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
	                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--color-accent)" }}>Event Total</p>
	                  <p className="mt-0.5 text-3xl font-bold tabular-nums">{clientTotals.plannedQuantity}</p>
	                  <p className="text-xs font-semibold">planned item quantity</p>
	                </div>
	              </div>
              {snapshot.plan_notes && (
                <div className="mb-5 rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--color-border)", background: "var(--color-cream)", color: "var(--color-text)" }}>
                  {snapshot.plan_notes}
                </div>
              )}

	              <div className="mb-10 rounded-[1.5rem] p-5" style={{ background: "var(--color-cream)" }}>
	                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
	                  {quantityBreakdown.length === 0 ? (
	                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>No planned rows.</p>
	                  ) : (
	                    quantityBreakdown.map((location) => (
	                      <section key={location.location} className="relative rounded-[1.25rem] bg-white p-4 shadow-[0_18px_42px_-36px_rgba(18,39,15,0.35)]">
	                        <div className="mx-auto w-fit rounded-2xl px-4 py-3 text-center" style={{ background: "var(--color-accent)", color: "var(--color-text)", border: "2px solid var(--color-text)" }}>
	                          <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Location</p>
	                          <h3 className="mt-0.5 text-xl font-bold" style={{ fontFamily: "var(--font-serif)" }}>{location.location}</h3>
	                          <p className="mt-1 text-2xl font-bold tabular-nums">{location.totalQuantity}</p>
	                        </div>

	                        <div className="mx-auto h-6 w-1" style={{ background: "var(--color-text)" }} />
	                        <div className="space-y-4">
	                          {location.timeSlots.map((timeSlot) => (
	                            <div key={`${location.location}-${timeSlot.timeSlot}`} className="relative pl-8">
	                              <span className="absolute left-[14px] top-0 z-0 h-full w-1" style={{ background: "var(--color-text)" }} />
	                              <span className="absolute left-[14px] top-5 z-0 h-1 w-5" style={{ background: "var(--color-text)" }} />
	                              <div className="relative z-10 mb-3 inline-flex min-w-52 max-w-full items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "var(--color-sage)", color: "var(--color-cream)", border: "2px solid var(--color-text)" }}>
	                                <p className="min-w-0 truncate text-sm font-bold">{timeSlot.timeSlot}</p>
	                                <span className="text-lg font-bold tabular-nums">{timeSlot.totalQuantity}</span>
	                              </div>
	                              <div className="space-y-2 pl-7">
	                                {timeSlot.items.map((item) => (
	                                  <div key={`${location.location}-${timeSlot.timeSlot}-${item.item}`} className="relative">
	                                    <span className="absolute -left-5 top-1/2 z-0 h-1 w-4 -translate-y-1/2" style={{ background: "var(--color-text)" }} />
	                                    <div className="relative z-10 flex min-h-10 items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "var(--color-cream)", border: "2px solid var(--color-text)", color: "var(--color-text)" }}>
	                                      <span className="truncate text-sm font-bold">{item.item}</span>
	                                      <span className="shrink-0 rounded-lg px-2 py-1 text-lg font-bold tabular-nums" style={{ background: "white", color: "var(--color-forest)" }}>{item.quantity}</span>
	                                    </div>
	                                  </div>
	                                ))}
	                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--color-border)" }}>
                <h3 className="mb-4 text-xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                  Customer Handoff
                </h3>
                <div className="overflow-x-auto">
                  {customerHandoffRows.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>No handoff rows.</p>
                  ) : (
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead>
                        <tr style={{ background: "var(--color-cream)", color: "var(--color-forest)" }}>
                          <th className="px-3 py-2 font-bold">Location</th>
                          <th className="px-3 py-2 font-bold">Time</th>
                          <th className="px-3 py-2 font-bold">Person</th>
                          <th className="px-3 py-2 font-bold">Status</th>
                          <th className="px-3 py-2 font-bold">Complete order</th>
                          <th className="px-3 py-2 font-bold">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                        {customerHandoffRows.map((row) => (
                          <tr key={`${row.location}-${row.timeSlot}-${row.customer}-${row.items.join(",")}`}>
                            <td className="px-3 py-2 font-semibold" style={{ color: "var(--color-text)" }}>{row.location}</td>
                            <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{row.timeSlot}</td>
                            <td className="px-3 py-2 font-semibold" style={{ color: "var(--color-text)" }}>{row.customer}</td>
                            <td className="px-3 py-2"><Pill tone={statusTone(row.status)}>{formatStatusLabel(row.status)}</Pill></td>
                            <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.items.join(", ")}</td>
                            <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{row.notes.join("; ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-[1.5rem] border p-4" style={{ background: "white", borderColor: "var(--color-border)" }}>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                  <WarningCircle size={19} weight="bold" />
                  Issues
                </h3>
                <IssueList issues={issues} emptyText="No blocking issues." tone="error" />
              </section>
              <section className="rounded-[1.5rem] border p-4" style={{ background: "white", borderColor: "var(--color-border)" }}>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                  <FunnelSimple size={19} weight="bold" />
                  Warnings
                </h3>
                <IssueList issues={warnings} emptyText="No warnings." tone="warning" />
              </section>
              <section className="rounded-[1.5rem] border p-4" style={{ background: "white", borderColor: "var(--color-border)" }}>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                  <Rows size={19} weight="bold" />
                  Status
                </h3>
                <div className="space-y-2">
                  {Object.entries(snapshot.status_breakdown).map(([status, value]) => (
                    <div key={status} className="flex items-center justify-between rounded-2xl border px-3 py-2" style={{ borderColor: "var(--color-border)", background: "var(--color-cream)" }}>
                      <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{formatStatusLabel(status)}</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-forest)" }}>{value.orders} / {value.quantity}</span>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>

      <Modal
        isOpen={Boolean(confirmDialog)}
        onClose={() => setConfirmDialog(null)}
        title={confirmDialog?.title ?? ""}
        variant={confirmDialog?.variant ?? "default"}
        zIndex={180}
        actions={
          <>
            <button
              type="button"
              onClick={() => setConfirmDialog(null)}
              className="rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "white" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDialog}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]"
              style={{
                background: confirmDialog?.variant === "danger" ? "var(--color-error-text)" : "var(--color-forest)",
                color: "var(--color-cream)",
              }}
            >
              {confirmDialog?.confirmLabel ?? "Confirm"}
            </button>
          </>
        }
      >
        {confirmDialog?.body}
      </Modal>
    </div>
  );
}

function IssueList({ issues, emptyText, tone }: { issues: EventPlanIssue[]; emptyText: string; tone: "error" | "warning" }) {
  if (issues.length === 0) {
    return <p className="text-sm" style={{ color: "var(--color-muted)" }}>{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {issues.map((issue, index) => (
        <div
          key={`${issue.code}-${issue.row_id ?? issue.source_order_id ?? index}`}
          className="rounded-2xl border p-3 text-sm"
          style={{
            background: tone === "error" ? "var(--color-error-bg)" : "var(--color-warning-bg)",
            borderColor: tone === "error" ? "var(--color-error-border)" : "var(--color-warning-border)",
            color: tone === "error" ? "var(--color-error-text)" : "var(--color-warning-text)",
          }}
        >
          <p className="font-semibold">{issue.code.replace(/_/g, " ")}</p>
          <p className="mt-1 text-xs">{issue.message}</p>
        </div>
      ))}
    </div>
  );
}
