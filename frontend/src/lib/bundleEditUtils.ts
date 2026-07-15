import { getMinimumOrderQuantity, type OrderLineItem, type QuantityLine } from "./orderLineUtils";

export interface EditableOrderLine {
  id: string;
  event_id: number;
  group_id: string | null;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_id: string;
  item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address?: string | null;
  pickup_date?: string | null;
  total_price: number;
  status: string;
  notes?: string | null;
  exclude_email?: boolean;
}

export interface BundleEditForm {
  name: string;
  email: string;
  phone_number: string;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address: string;
  pickup_date: string;
  notes: string;
  exclude_email: boolean;
}

export type DesiredBundleLine = QuantityLine<OrderLineItem>;

export interface BundleLineAssignment {
  row: EditableOrderLine;
  line: DesiredBundleLine;
}

export interface BundleLinePlan {
  assignments: BundleLineAssignment[];
  createLines: DesiredBundleLine[];
  deleteRows: EditableOrderLine[];
  lockedRows: EditableOrderLine[];
}

export interface BundleEditInitialState {
  form: BundleEditForm;
  quantities: Record<string, number>;
  linePrices: Record<string, number>;
}

export function bundleEditInitialState(
  primaryLine: EditableOrderLine,
  lines: EditableOrderLine[],
): BundleEditInitialState {
  const quantities: Record<string, number> = {};
  const linePrices: Record<string, number> = {};
  for (const line of lines) addExistingLine(line, quantities, linePrices);

  return {
    form: {
      name: primaryLine.name ?? "",
      email: primaryLine.email ?? "",
      phone_number: primaryLine.phone_number ?? "",
      pickup_location: primaryLine.pickup_location ?? "",
      pickup_time_slot: primaryLine.pickup_time_slot ?? "",
      pickup_address: primaryLine.pickup_address ?? "",
      pickup_date: primaryLine.pickup_date ?? "",
      notes: primaryLine.notes ?? "",
      exclude_email: Boolean(primaryLine.exclude_email),
    },
    quantities,
    linePrices,
  };
}

function addExistingLine(
  line: EditableOrderLine,
  quantities: Record<string, number>,
  linePrices: Record<string, number>,
): void {
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  quantities[line.item_id] = (quantities[line.item_id] ?? 0) + quantity;
  if (linePrices[line.item_id] === undefined) {
    linePrices[line.item_id] = Math.max(0, existingLineUnitPrice(line));
  }
}

export function bundleLineValidationError(
  desiredLines: DesiredBundleLine[],
  randomOrder: boolean,
  linePrices: Record<string, number>,
): string | null {
  if (desiredLines.length === 0) return "Please add at least one item.";
  return randomOrder
    ? randomLinePriceError(desiredLines, linePrices)
    : minimumQuantityError(desiredLines);
}

function minimumQuantityError(desiredLines: DesiredBundleLine[]): string | null {
  for (const { item, qty } of desiredLines) {
    const minimum = getMinimumOrderQuantity(item);
    if (qty < minimum) return `${item.name} requires a minimum order of ${minimum}.`;
  }
  return null;
}

function randomLinePriceError(
  desiredLines: DesiredBundleLine[],
  linePrices: Record<string, number>,
): string | null {
  for (const { item } of desiredLines) {
    const price = linePrices[item.id] ?? item.price;
    if (!Number.isFinite(price) || price < 0) return `Set a valid unit price for ${item.name}.`;
  }
  return null;
}

function assignEditableLines(
  existingRows: EditableOrderLine[],
  desiredLines: DesiredBundleLine[],
): Pick<BundleLinePlan, "assignments" | "createLines" | "deleteRows"> {
  const assignments: BundleLineAssignment[] = [];
  const createLines: DesiredBundleLine[] = [];
  const unusedRows = [...existingRows];

  for (const line of desiredLines) {
    const matchingIndex = unusedRows.findIndex((row) => row.item_id === line.item.id);
    const reusableRow = matchingIndex >= 0
      ? unusedRows.splice(matchingIndex, 1)[0]
      : unusedRows.shift();
    if (reusableRow) assignments.push({ row: reusableRow, line });
    else createLines.push(line);
  }

  return { assignments, createLines, deleteRows: unusedRows };
}

export function planBundleLineChanges(
  existingRows: EditableOrderLine[],
  desiredLines: DesiredBundleLine[],
  lockedItemIds: Set<string>,
): BundleLinePlan {
  const lockedRows = existingRows.filter((row) => lockedItemIds.has(row.item_id));
  const editableRows = existingRows.filter((row) => !lockedItemIds.has(row.item_id));
  const desiredEditableLines = desiredLines.filter((line) => !line.item.is_locked);
  return {
    ...assignEditableLines(editableRows, desiredEditableLines),
    lockedRows,
  };
}

export function bundleBasePayload(form: BundleEditForm, randomOrder: boolean) {
  return {
    name: form.name,
    email: form.email,
    phone_number: form.phone_number,
    pickup_location: form.pickup_location,
    pickup_time_slot: form.pickup_time_slot,
    pickup_address: randomOrder ? form.pickup_address : undefined,
    pickup_date: randomOrder ? form.pickup_date : undefined,
    notes: form.notes,
    exclude_email: form.exclude_email,
  };
}

export function bundleLineUnitPrice(
  line: DesiredBundleLine,
  linePrices: Record<string, number>,
): number {
  return linePrices[line.item.id] ?? line.item.price;
}

export function existingLineUnitPrice(line: EditableOrderLine): number {
  if (line.quantity <= 0) return 0;
  return Number((Number(line.total_price) / line.quantity).toFixed(2));
}
