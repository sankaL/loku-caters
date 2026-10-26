import { NextResponse, type NextRequest } from "next/server";
import { PRE_ORDER_REASON_OPTIONS } from "@/lib/feedbackOptions";
import { EmailDeliveryError, isEmail, sendSubmissionNotification } from "@/lib/server/email";
import { RATE_LIMITS, ValidationError, errorResponse, optionalText, rateLimit, readJsonObject } from "@/lib/server/http";

const ORIGIN_LABELS: Record<string, string> = {
  contact_us: "Contact Us",
  events_page_non_customer: "Events Page (Non-customer)",
  events_page_customer: "Events Page (Customer)",
  event_reminder_email: "Event Reminder Email",
  reviews_page: "Reviews Page",
};

const TYPE_LABELS: Record<string, string> = {
  general_question: "General Question",
  feedback: "Feedback",
  collaboration: "Collaboration",
  other: "Other",
};

const REASON_ORIGINS = new Set(["events_page_non_customer", "event_reminder_email"]);
const RATING_ORIGINS = new Set(["reviews_page", "events_page_customer", "contact_us"]);

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, RATE_LIMITS.feedback);
  if (limited) return limited;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  let origin: string;
  let feedbackType: string;
  let name: string | null;
  let contact: string | null;
  let orderId: string | null;
  let reason: string | null = null;
  let otherDetails: string | null = null;
  let message: string | null;
  let rating: number | null = null;
  try {
    origin = (optionalText(body, "origin", 50) ?? "").toLowerCase();
    if (!ORIGIN_LABELS[origin]) throw new ValidationError("Invalid feedback origin");
    feedbackType = (optionalText(body, "feedback_type", 50) ?? "").toLowerCase();
    if (!feedbackType) feedbackType = origin.startsWith("events_page") ? "feedback" : "other";
    if (!TYPE_LABELS[feedbackType]) throw new ValidationError("Invalid feedback type");
    if ((REASON_ORIGINS.has(origin) || origin === "events_page_customer") && feedbackType !== "feedback") {
      throw new ValidationError("Event feedback must use type 'feedback'");
    }

    name = optionalText(body, "name", 200);
    contact = optionalText(body, "contact", 320);
    orderId = optionalText(body, "order_id", 100);
    message = optionalText(body, "message", 5000);

    if (REASON_ORIGINS.has(origin)) {
      reason = optionalText(body, "reason", 100);
      if (reason && !PRE_ORDER_REASON_OPTIONS.some((option) => option.value === reason)) {
        throw new ValidationError("Invalid feedback reason");
      }
      otherDetails = optionalText(body, "other_details", 2000);
    }

    if (feedbackType === "feedback" && RATING_ORIGINS.has(origin) && body.rating !== null && body.rating !== undefined) {
      rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError("Rating must be between 1 and 5");
    }
  } catch (error) {
    if (error instanceof ValidationError) return errorResponse(422, error.message);
    throw error;
  }

  const sender = name ?? "Anonymous visitor";
  try {
    await sendSubmissionNotification({
      title: origin === "reviews_page" ? "New Review Received" : "New Feedback Received",
      eyebrow: "Feedback Notification",
      intro:
        origin === "reviews_page"
          ? "A new review was submitted. To show it on the site, add it to config/reviews.json."
          : "New feedback has been submitted.",
      details: [
        ["From", sender],
        ["Contact", contact],
        ["Type", TYPE_LABELS[feedbackType]],
        ["Source", ORIGIN_LABELS[origin]],
        ["Reason", PRE_ORDER_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? null],
        ["Rating", rating ? `${rating} / 5` : null],
        ["Order reference", orderId],
      ],
      messageLabel: "Feedback",
      message: message ?? otherDetails,
      subject: `New ${origin === "reviews_page" ? "review" : "feedback"} from ${sender}`,
      replyTo: isEmail(contact) ? contact : null,
    });
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    console.error("Feedback notification failed:", error.message);
    return errorResponse(502, "We could not send your message right now. Please try again later.");
  }

  return NextResponse.json({ success: true, feedback_id: crypto.randomUUID() }, { status: 201 });
}
