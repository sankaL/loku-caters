"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import {
  Archive,
  ArrowsClockwise,
  CalendarCheck,
  CaretDown,
  Check,
  Copy,
  FunnelSimple,
  MagnifyingGlass,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { loadAdminResource } from "@/lib/adminCrud";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";
import Modal from "@/components/ui/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  AdminEventSummary,
  EventPlan,
  formatDateTime,
  PLAN_STATUS_LABELS,
  PlanStatus,
} from "@/lib/eventPlanning";

function StatusPill({ status }: { status: string }) {
  const label = PLAN_STATUS_LABELS[status] ?? status;
  const tone =
    status === "ready"
      ? "success"
      : status === "archived"
        ? "muted"
        : "warning";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        background:
          tone === "success"
            ? "var(--color-success-bg)"
            : tone === "warning"
              ? "var(--color-warning-bg)"
              : "var(--color-cream)",
        color:
          tone === "success"
            ? "var(--color-success-text)"
            : tone === "warning"
              ? "var(--color-warning-text)"
              : "var(--color-muted)",
        border: `1px solid ${
          tone === "success"
            ? "var(--color-success-border)"
            : tone === "warning"
              ? "var(--color-warning-border)"
              : "var(--color-border)"
        }`,
      }}
    >
      {label}
    </span>
  );
}

const statusFilterOptions: Array<{ value: "all" | PlanStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "archived", label: "Archived" },
];

interface PlanningPageState {
  plans: EventPlan[];
  events: AdminEventSummary[];
  loading: boolean;
  creating: boolean;
  modalOpen: boolean;
  selectedEventId: string;
  planName: string;
  search: string;
  statusFilter: "all" | PlanStatus;
  includeArchived: boolean;
}

const INITIAL_STATE: PlanningPageState = {
  plans: [],
  events: [],
  loading: true,
  creating: false,
  modalOpen: false,
  selectedEventId: "",
  planName: "",
  search: "",
  statusFilter: "all",
  includeArchived: false,
};

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl"
          style={{
            background: "linear-gradient(90deg, var(--color-cream-dark), white, var(--color-cream-dark))",
            backgroundSize: "220% 100%",
            animationDelay: `${index * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

function PlanRow({
  plan,
  index,
  onOpen,
  onDuplicate,
  onArchive,
}: {
  plan: EventPlan;
  index: number;
  onOpen: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer transition-colors hover:bg-[color:var(--color-cream)]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--color-sage)]"
      style={{ animation: "planning-row-in 260ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${index * 35}ms` }}
    >
      <td className="px-5 py-4">
        <span className="font-semibold" style={{ color: "var(--color-forest)" }}>{plan.name}</span>
        {plan.is_out_of_date && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--color-warning-text)" }}>
            <ArrowsClockwise size={13} weight="bold" />
            Refresh available
          </div>
        )}
      </td>
      <td className="px-5 py-4" style={{ color: "var(--color-text)" }}>
        {plan.source_event?.name ?? `Event ${plan.source_event_id}`}
      </td>
      <td className="px-5 py-4"><StatusPill status={plan.status} /></td>
      <td className="px-5 py-4" style={{ color: "var(--color-muted)" }}>{plan.source_event?.event_date ?? "-"}</td>
      <td className="px-5 py-4 font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{plan.included_order_count}</td>
      <td className="px-5 py-4 tabular-nums" style={{ color: "var(--color-text)" }}>
        {plan.ordered_quantity} ordered / {plan.planned_quantity} planned
      </td>
      <td className="px-5 py-4">
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            background: plan.issue_count > 0 ? "var(--color-error-bg)" : "var(--color-cream)",
            color: plan.issue_count > 0 ? "var(--color-error-text)" : "var(--color-muted)",
            border: `1px solid ${plan.issue_count > 0 ? "var(--color-error-border)" : "var(--color-border)"}`,
          }}
        >
          <WarningCircle size={14} weight="bold" />
          {plan.issue_count} issues / {plan.warning_count} warnings
        </span>
      </td>
      <td className="px-5 py-4" style={{ color: "var(--color-muted)" }}>{formatDateTime(plan.updated_at)}</td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onOpen(); }}
            className="rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-[0.98]"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)", background: "white" }}
          >
            Open
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDuplicate(); }}
            className="rounded-xl border p-2 transition-all active:scale-[0.98]"
            title="Duplicate"
            style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "white" }}
          >
            <Copy size={16} />
          </button>
          {plan.status !== "archived" && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onArchive(); }}
              className="rounded-xl border p-2 transition-all active:scale-[0.98]"
              title="Archive"
              style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "white" }}
            >
              <Archive size={16} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function PlansTable({ plans, onOpen }: { plans: EventPlan[]; onOpen: (plan: EventPlan, action?: "duplicate" | "archive") => void }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border" style={{ background: "white", borderColor: "var(--color-border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead style={{ background: "var(--color-cream)" }}>
            <tr style={{ color: "var(--color-muted)" }}>
              <th className="px-5 py-4 font-semibold">Plan Name</th>
              <th className="px-5 py-4 font-semibold">Source</th>
              <th className="px-5 py-4 font-semibold">Status</th>
              <th className="px-5 py-4 font-semibold">Event Date</th>
              <th className="px-5 py-4 font-semibold">Orders</th>
              <th className="px-5 py-4 font-semibold">Qty</th>
              <th className="px-5 py-4 font-semibold">Issues</th>
              <th className="px-5 py-4 font-semibold">Updated</th>
              <th className="px-5 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {plans.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                  No plans match the current filters.
                </td>
              </tr>
            ) : plans.map((plan, index) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                index={index}
                onOpen={() => onOpen(plan)}
                onDuplicate={() => onOpen(plan, "duplicate")}
                onArchive={() => onOpen(plan, "archive")}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanningBody({ loading, hasPlans, onCreate, children }: { loading: boolean; hasPlans: boolean; onCreate: () => void; children: ReactNode }) {
  if (loading) return <SkeletonRows />;
  if (hasPlans) return <div className="space-y-4">{children}</div>;
  return (
    <div className="grid min-h-[58vh] place-items-center">
      <div
        className="w-full max-w-xl rounded-[2rem] border p-8 text-left shadow-[0_24px_60px_-42px_rgba(18,39,15,0.45)] md:p-10"
        style={{ background: "white", borderColor: "var(--color-border)" }}
      >
        <div className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--color-cream)", color: "var(--color-forest)", border: "1px solid var(--color-border)" }}>
          <CalendarCheck size={28} weight="duotone" />
        </div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>No plans yet</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-muted)" }}>
          Create the first saved snapshot from an event or Random Requests.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-7 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98]"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
        >
          <Plus size={18} weight="bold" />
          Plan Event
        </button>
      </div>
    </div>
  );
}

export default function EventPlanningPage() {
  const router = useRouter();
  const [state, setState] = useState<PlanningPageState>(INITIAL_STATE);
  const {
    plans,
    events,
    loading,
    creating,
    modalOpen,
    selectedEventId,
    planName,
    search,
    statusFilter,
    includeArchived,
  } = state;
  const { toast, showToast } = useAdminToast(4200);
  const updateState = useCallback((patch: Partial<PlanningPageState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const loadPlans = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/admin/event-plans?include_archived=${includeArchived ? "true" : "false"}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to load plans"));
    updateState({ plans: (await res.json()) as EventPlan[] });
  }, [includeArchived, updateState]);

  useEffect(() => {
    updateState({ loading: true });
    Promise.all([
      loadPlans(),
      loadAdminResource<AdminEventSummary[]>("/api/admin/events", "Failed to load events", (events) => updateState({ events })),
    ])
      .catch((error) => showToast(error instanceof Error ? error.message : "Failed to load planning data", "error"))
      .finally(() => updateState({ loading: false }));
  }, [loadPlans, showToast, updateState]);

  const selectedEvent = useMemo(
    () => events.find((event) => String(event.id) === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    if (!selectedEvent || planName.trim()) return;
    const now = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date());
    updateState({ planName: `${selectedEvent.name} Plan - ${now}` });
  }, [planName, selectedEvent, updateState]);

  const eventOptions = useMemo(
    () =>
      events.map((event) => ({
        value: String(event.id),
        label: `${event.name} - ${event.kind === "random_requests" ? "Random Requests" : event.event_date}${event.is_active ? " - Active" : ""}`,
      })),
    [events]
  );

  const filteredPlans = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plans.filter((plan) => {
      if (statusFilter !== "all" && plan.status !== statusFilter) return false;
      if (!query) return true;
      const sourceName = plan.source_event?.name ?? "";
      return `${plan.name} ${sourceName}`.toLowerCase().includes(query);
    });
  }, [plans, search, statusFilter]);

  async function handleCreatePlan() {
    if (!selectedEventId) {
      showToast("Select an event first.", "error");
      return;
    }
    updateState({ creating: true });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/event-plans`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_event_id: Number(selectedEventId),
          name: planName.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to create event plan"));
      const plan = (await res.json()) as EventPlan;
      router.push(`/admin/planning/${plan.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create event plan", "error");
    } finally {
      updateState({ creating: false });
    }
  }

  function openCreateModal() {
    updateState({ selectedEventId: "", planName: "", modalOpen: true });
  }

  const hasPlans = plans.length > 0;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />

      <div className="w-full">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-1 text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Event Planning
            </h1>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Saved snapshots for cooking counts, pickup routing, handoff notes, and report prep.
            </p>
          </div>
          {hasPlans && (
            <div className="flex justify-start lg:justify-end">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98]"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
              >
                <Plus size={18} weight="bold" />
                Add Plan Event
              </button>
            </div>
          )}
        </div>

        <PlanningBody loading={loading} hasPlans={hasPlans} onCreate={openCreateModal}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <label className="relative w-full sm:flex-1 sm:min-w-48">
                <span className="sr-only">Search plans</span>
                <MagnifyingGlass
                  size={14}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}
                />
                <input
                  value={search}
                  onChange={(event) => updateState({ search: event.target.value })}
                  className="w-full rounded-xl border bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-[color:var(--color-sage)] focus:ring-2 focus:ring-[color:var(--color-sage)]"
                  placeholder="Search by plan or event"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                />
              </label>
              <div className="relative w-full sm:w-auto">
                <span className="sr-only">Filter by status</span>
                <Listbox value={statusFilter} onChange={(value) => updateState({ statusFilter: value })}>
                  <ListboxButton
                    className="dropdown-trigger interactive-secondary relative flex w-full items-center gap-3 rounded-xl border bg-white py-2 pl-9 pr-9 text-left text-sm outline-none data-[focus]:border-[color:var(--color-sage)] data-[focus]:ring-2 data-[focus]:ring-[color:var(--color-sage)] sm:w-48"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                  >
                    <FunnelSimple
                      size={14}
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {statusFilterOptions.find((option) => option.value === statusFilter)?.label ?? "All statuses"}
                    </span>
                    <CaretDown
                      size={14}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}
                    />
                  </ListboxButton>
                  <ListboxOptions
                    anchor="bottom"
                    className="dropdown-surface z-50 mt-2 w-48 rounded-xl border bg-white p-1 shadow-[0_18px_40px_-24px_rgba(28,28,26,0.35)] outline-none"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {statusFilterOptions.map((option) => (
                      <ListboxOption
                        key={option.value}
                        value={option.value}
                        className="dropdown-option-soft flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium data-[focus]:bg-[color:var(--color-cream)]"
                        style={{ color: "var(--color-text)" }}
                      >
                        <span>{option.label}</span>
                        {statusFilter === option.value && <Check size={15} weight="bold" style={{ color: "var(--color-sage)" }} />}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </Listbox>
              </div>
              <label
                className="flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium sm:w-auto"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
              >
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(event) => updateState({ includeArchived: event.target.checked })}
                  className="h-4 w-4 accent-[var(--color-forest)]"
                />
                Show archived
              </label>
            </div>

            <PlansTable
              plans={filteredPlans}
              onOpen={(plan, action) => router.push(`/admin/planning/${plan.id}${action ? `?action=${action}` : ""}`)}
            />
        </PlanningBody>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !creating && updateState({ modalOpen: false })}
        title="Plan Event"
        size="lg"
        actions={
          <>
            <button
              type="button"
              onClick={() => updateState({ modalOpen: false })}
              disabled={creating}
              className="interactive-secondary rounded-2xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreatePlan}
              disabled={creating || !selectedEventId}
              aria-busy={creating}
              className="interactive-primary inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              <Plus size={17} weight="bold" />
              {creating ? "Creating..." : "Create Plan"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-2">
            <label className="text-sm font-semibold" style={{ color: "var(--color-text)" }} htmlFor="planning-source-event">
              Source event
            </label>
            <SearchableSelect
              id="planning-source-event"
              options={eventOptions}
              value={selectedEventId}
              onChange={(value) => {
                updateState({ selectedEventId: value, planName: "" });
              }}
              placeholder="Select an active, inactive, or random event"
              searchPlaceholder="Search events"
            />
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              The snapshot includes every non-cancelled order at the time it is created.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-semibold" style={{ color: "var(--color-text)" }} htmlFor="planning-plan-name">
              Plan name
            </label>
            <input
              id="planning-plan-name"
              value={planName}
              onChange={(event) => updateState({ planName: event.target.value })}
              className="rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
              placeholder="Auto-filled after selecting an event"
            />
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              You can rename this later from the plan editor.
            </p>
          </div>
        </div>
      </Modal>

      <style jsx>{`
        @keyframes planning-row-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
