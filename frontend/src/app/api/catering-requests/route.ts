import { NextResponse, type NextRequest } from "next/server";
import { getCateringBudgetRangeLabel, getCateringEventTypeLabel } from "@/lib/cateringRequestOptions";
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

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, RATE_LIMITS.cateringRequest);
  if (limited) return limited;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  let fields;
  try {
    const email = requiredText(body, "email", 320);
    if (!isEmail(email)) throw new ValidationError("Please enter a valid email address");
    const guestCount = Number(body.guest_count);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100_000) {
      throw new ValidationError("Guest count must be at least 1");
    }
    fields = {
      firstName: requiredText(body, "first_name", 100),
      lastName: requiredText(body, "last_name", 100),
      email,
      phoneNumber: optionalText(body, "phone_number", 50),
      eventDate: requiredText(body, "event_date", 50),
      guestCount,
      eventType: requiredText(body, "event_type", 100),
      budgetRange: optionalText(body, "budget_range", 100),
      specialRequests: optionalText(body, "special_requests", 5000),
    };
  } catch (error) {
    if (error instanceof ValidationError) return errorResponse(422, error.message);
    throw error;
  }

  const name = `${fields.firstName} ${fields.lastName}`;
  try {
    await sendSubmissionNotification({
      title: "New Catering Request",
      eyebrow: "Catering Notification",
      intro: "A new catering inquiry has arrived. Reply to this email to reach the customer.",
      details: [
        ["Customer", name],
        ["Email", fields.email],
        ["Phone", fields.phoneNumber],
        ["Event date", fields.eventDate],
        ["Event type", getCateringEventTypeLabel(fields.eventType)],
        ["Guest count", fields.guestCount],
        ["Budget", fields.budgetRange ? getCateringBudgetRangeLabel(fields.budgetRange) : null],
      ],
      messageLabel: "Special requests",
      message: fields.specialRequests,
      subject: `New catering request from ${name}`,
      replyTo: fields.email,
    });
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    console.error("Catering request notification failed:", error.message);
    return errorResponse(502, "We could not send your request right now. Please try again or contact us directly.");
  }

  return NextResponse.json({ success: true, request_id: crypto.randomUUID() }, { status: 201 });
}
