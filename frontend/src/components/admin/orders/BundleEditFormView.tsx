import type { CSSProperties, FormEventHandler } from "react";

import ItemQuantityPicker from "@/components/admin/orders/ItemQuantityPicker";
import CustomSelect from "@/components/ui/CustomSelect";
import { CURRENCY, type EventConfig } from "@/config/event";
import type { BundleEditForm } from "@/lib/bundleEditUtils";
import type { OrderLineItem } from "@/lib/orderLineUtils";

interface SelectOption {
  value: string;
  label: string;
}

interface CatalogLocation {
  id: string;
  name: string;
}

interface BundleEditFormViewProps {
  form: BundleEditForm;
  lineCount: number;
  pickerItems: OrderLineItem[];
  quantities: Record<string, number>;
  linePrices: Record<string, number>;
  isRandomOrder: boolean;
  eventConfig: EventConfig | null;
  configUsesFallback: boolean;
  catalogLocations: CatalogLocation[];
  locationOptions: SelectOption[];
  timeSlots: string[];
  timeSlotOptions: SelectOption[];
  itemsError: string;
  saving: boolean;
  onFormChange: (patch: Partial<BundleEditForm>) => void;
  onQuantitiesChange: (quantities: Record<string, number>) => void;
  onLinePricesChange: (prices: Record<string, number>) => void;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid var(--color-border)",
  background: "white",
  color: "var(--color-text)",
  fontSize: "14px",
  outline: "none",
};

function CustomerFields({
  form,
  onChange,
}: {
  form: BundleEditForm;
  onChange: BundleEditFormViewProps["onFormChange"];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Name</label>
        <input required type="text" value={form.name} onChange={(event) => onChange({ name: event.target.value })} style={INPUT_STYLE} />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Email</label>
        <input required={!form.exclude_email} type="email" value={form.email} onChange={(event) => onChange({ email: event.target.value })} style={INPUT_STYLE} />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone (Optional)</label>
        <input type="tel" value={form.phone_number} onChange={(event) => onChange({ phone_number: event.target.value })} style={INPUT_STYLE} />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
          <input
            type="checkbox"
            checked={form.exclude_email}
            onChange={(event) => onChange({ exclude_email: event.target.checked })}
            style={{ accentColor: "var(--color-forest)", width: "15px", height: "15px" }}
          />
          Exclude Email (no confirmation or reminder emails)
        </label>
        <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>When enabled, Email is optional.</p>
      </div>
    </div>
  );
}

type BundleItemsFieldProps = Pick<
  BundleEditFormViewProps,
  | "lineCount"
  | "pickerItems"
  | "quantities"
  | "linePrices"
  | "isRandomOrder"
  | "eventConfig"
  | "configUsesFallback"
  | "itemsError"
  | "onQuantitiesChange"
  | "onLinePricesChange"
>;

function BundleItemsField(props: BundleItemsFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>
        Bundle Items
        <span className="ml-1 text-[11px] font-normal">({props.lineCount} item{props.lineCount === 1 ? "" : "s"} in scope)</span>
      </label>
      <ItemQuantityPicker
        items={props.pickerItems}
        quantities={props.quantities}
        onChange={props.onQuantitiesChange}
        linePrices={props.isRandomOrder ? props.linePrices : undefined}
        onLinePricesChange={props.isRandomOrder ? props.onLinePricesChange : undefined}
        allowBelowMinimumOrder={props.isRandomOrder}
        allowPriceEdit={props.isRandomOrder}
        currency={props.eventConfig?.currency ?? CURRENCY}
        disabled={props.pickerItems.length === 0}
        error={props.itemsError}
      />
      {props.configUsesFallback && !props.isRandomOrder && (
        <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Using active event catalog as a fallback.</p>
      )}
    </div>
  );
}

function RandomPickupFields({
  form,
  locations,
  timeSlots,
  onChange,
}: {
  form: BundleEditForm;
  locations: CatalogLocation[];
  timeSlots: string[];
  onChange: BundleEditFormViewProps["onFormChange"];
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
          <input
            list="random-edit-location-options"
            required
            type="text"
            value={form.pickup_location}
            onChange={(event) => onChange({ pickup_location: event.target.value, pickup_time_slot: "" })}
            placeholder="Any pickup location"
            style={INPUT_STYLE}
          />
          <datalist id="random-edit-location-options">
            {locations.map((location) => <option key={location.id} value={location.name} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
          <input
            list="random-edit-time-slot-options"
            required
            type="text"
            value={form.pickup_time_slot}
            onChange={(event) => onChange({ pickup_time_slot: event.target.value })}
            placeholder="Any pickup time slot"
            style={INPUT_STYLE}
          />
          <datalist id="random-edit-time-slot-options">
            {timeSlots.map((slot) => <option key={slot} value={slot} />)}
          </datalist>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Date</label>
        <input type="date" value={form.pickup_date} onChange={(event) => onChange({ pickup_date: event.target.value })} style={INPUT_STYLE} />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Address</label>
        <textarea
          value={form.pickup_address}
          onChange={(event) => onChange({ pickup_address: event.target.value })}
          rows={3}
          placeholder="Freeform pickup address or special instructions"
          style={{ ...INPUT_STYLE, resize: "vertical", minHeight: "88px" }}
        />
      </div>
    </>
  );
}

function EventPickupFields({
  form,
  eventConfig,
  locationOptions,
  timeSlotOptions,
  onChange,
}: Pick<BundleEditFormViewProps, "form" | "eventConfig" | "locationOptions" | "timeSlotOptions"> & {
  onChange: BundleEditFormViewProps["onFormChange"];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
        <CustomSelect
          options={locationOptions}
          value={form.pickup_location}
          onChange={(value) => onChange({ pickup_location: value, pickup_time_slot: "" })}
          disabled={!eventConfig}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
        <CustomSelect
          options={timeSlotOptions}
          value={form.pickup_time_slot}
          onChange={(value) => onChange({ pickup_time_slot: value })}
          disabled={!eventConfig || !form.pickup_location}
          placeholder={form.pickup_location ? "Select a time slot" : "Select a location first"}
        />
      </div>
    </div>
  );
}

function ModalActions({ saving, onClose }: Pick<BundleEditFormViewProps, "saving" | "onClose">) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="interactive-secondary px-4 py-2 rounded-xl text-sm font-medium"
        style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        aria-busy={saving}
        className="interactive-primary px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
        style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

export default function BundleEditFormView(props: BundleEditFormViewProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.saving) props.onClose();
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "24px",
          border: "1px solid var(--color-border)",
          maxWidth: "720px",
          width: "100%",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-5" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
          Edit Bundle
        </h2>
        <form onSubmit={props.onSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <CustomerFields form={props.form} onChange={props.onFormChange} />
          <BundleItemsField {...props} />
          {props.isRandomOrder ? (
            <RandomPickupFields
              form={props.form}
              locations={props.catalogLocations}
              timeSlots={props.timeSlots}
              onChange={props.onFormChange}
            />
          ) : (
            <EventPickupFields
              form={props.form}
              eventConfig={props.eventConfig}
              locationOptions={props.locationOptions}
              timeSlotOptions={props.timeSlotOptions}
              onChange={props.onFormChange}
            />
          )}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Notes (admin only)</label>
            <textarea
              value={props.form.notes}
              onChange={(event) => props.onFormChange({ notes: event.target.value })}
              rows={4}
              style={{ ...INPUT_STYLE, resize: "vertical", minHeight: "110px" }}
            />
          </div>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {props.isRandomOrder ? "Manual prices are stored on each item." : "Price will be computed server-side."}
          </p>
          <ModalActions saving={props.saving} onClose={props.onClose} />
        </form>
      </div>
    </div>
  );
}
