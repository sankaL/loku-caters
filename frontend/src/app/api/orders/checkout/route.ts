import { NextResponse, type NextRequest } from "next/server";
import { getActiveEventConfig, type Location } from "@/config/event";
import { PricingError, priceEventCart, type CartLineInput } from "@/lib/pricing";
import { EmailDeliveryError, isEmail, sendSubmissionNotification } from "@/lib/server/email";
import {
  RATE_LIMITS,
  ValidationError,
  errorResponse,
  optionalText,
  rateLimit,
  readJsonObject,
  requiredText,
} from "@/lib/server/http";

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, RATE_LIMITS.orderCheckout);
  if (limited) return limited;

  const event = getActiveEventConfig();
  if (!event) return errorResponse(404, "no_active_event");

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  let name: string;
  let email: string;
  let phoneNumber: string | null;
  let location: Location;
  let pickupTimeSlot: string;
  let lines: CartLineInput[];
  try {
    name = requiredText(body, "name", 200);
    email = requiredText(body, "email", 320);
    if (!isEmail(email)) throw new ValidationError("Please enter a valid email address");
    phoneNumber = optionalText(body, "phone_number", 50);

    const pickupLocation = requiredText(body, "pickup_location", 200);
    pickupTimeSlot = requiredText(body, "pickup_time_slot", 100);
    const matchedLocation = event.locations.find(
      (candidate) => candidate.name === pickupLocation || candidate.id === pickupLocation
    );
    if (!matchedLocation) throw new ValidationError("Invalid pickup_location");
    if (!matchedLocation.timeSlots.includes(pickupTimeSlot)) {
      throw new ValidationError("Invalid pickup_time_slot for location");
    }
    location = matchedLocation;

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw new ValidationError("At least one cart line is required");
    }
    lines = body.lines.map((line) => ({
      item_id: String((line as CartLineInput)?.item_id ?? "").trim(),
      quantity: Number((line as CartLineInput)?.quantity),
    }));
  } catch (error) {
    if (error instanceof ValidationError) return errorResponse(422, error.message);
    throw error;
  }

  // Price on the server from config; the client total is never trusted.
  let pricing;
  try {
    pricing = priceEventCart(event, lines);
  } catch (error) {
    if (error instanceof PricingError) return errorResponse(400, error.message);
    throw error;
  }

  const groupId = crypto.randomUUID();
  const currency = event.currency;
  const order = {
    group_id: groupId,
    name,
    email,
    phone_number: phoneNumber,
    pickup_location: location.name,
    pickup_time_slot: pickupTimeSlot,
    currency,
    event_date: event.event.date,
    etransfer_enabled: Boolean(event.etransfer_enabled),
    etransfer_email: event.etransfer_email,
    location_address: location.address ?? "",
    subtotal: pricing.subtotal,
    discount_total: pricing.discount_total,
    total_price: pricing.grand_total,
    applied_combos: pricing.applied_combos,
    lines: pricing.lines.map((line) => ({
      order_id: crypto.randomUUID(),
      item_id: line.item_id,
      item_name: line.item_name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      base_total: line.base_total,
      discount_total: line.discount_total,
      total_price: line.total_price,
    })),
  };

  const itemLines = order.lines
    .map((line) => {
      const discount = line.discount_total > 0 ? ` (less ${formatMoney(currency, line.discount_total)})` : "";
      return `${line.quantity} x ${line.item_name} @ ${formatMoney(currency, line.unit_price)} = ${formatMoney(currency, line.total_price)}${discount}`;
    })
    .join("\n");

  try {
    await sendSubmissionNotification({
      title: "New Order Received",
      eyebrow: "Order Notification",
      intro: `A new pre-order has been submitted for ${event.event.date}. Reply to this email to reach the customer.`,
      details: [
        ["Customer", name],
        ["Email", email],
        ["Phone", phoneNumber],
        ["Items", itemLines],
        ["Subtotal", formatMoney(currency, order.subtotal)],
        [
          "Combo savings",
          order.discount_total > 0
            ? `${formatMoney(currency, order.discount_total)} (${order.applied_combos.map((combo) => combo.name).join(", ")})`
            : null,
        ],
        ["Total", formatMoney(currency, order.total_price)],
        ["Payment", order.etransfer_enabled ? `E-transfer to ${order.etransfer_email}` : "Pay at pickup"],
        ["Event", event.event.date],
        ["Pickup location", [location.name, location.address].filter(Boolean).join(", ")],
        ["Pickup time", pickupTimeSlot],
        ["Order reference", groupId.slice(0, 8).toUpperCase()],
      ],
      subject: `New order from ${name}`,
      replyTo: email,
    });
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    // The email is the only record of the order, so tell the customer it failed.
    console.error(`Order ${groupId} notification failed:`, error.message, JSON.stringify(order));
    return errorResponse(
      502,
      "We could not place your order right now. Please try again, or contact us directly."
    );
  }

  return NextResponse.json(
    {
      success: true,
      group_id: groupId,
      message: "Your pre-order has been placed! We will send a confirmation email once we verify your order.",
      order,
    },
    { status: 201 }
  );
}
