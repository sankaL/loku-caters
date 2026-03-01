from __future__ import annotations

from typing import TypedDict, NotRequired

from event_config import CURRENCY


class RenderedEmail(TypedDict):
    subject: str
    html: str


class OrderEmailContext(TypedDict):
    name: str
    item_name: str
    quantity: int
    pickup_location: str
    pickup_time_slot: str
    total_price: float
    price_per_item: float
    currency: NotRequired[str]
    email: str
    address: NotRequired[str]
    event_date: NotRequired[str]
    etransfer_enabled: NotRequired[bool]
    etransfer_email: NotRequired[str | None]


def _build_etransfer_section_html(context: OrderEmailContext, *, reminder: bool = False) -> str:
    etransfer_enabled = bool(context.get("etransfer_enabled"))
    etransfer_email = str(context.get("etransfer_email") or "").strip()
    if not etransfer_enabled or not etransfer_email:
        return ""

    if reminder:
        payment_copy_html = (
            "If you have not yet sent your e-Transfer payment, you are welcome to do so at any time "
            "before your pickup by sending to "
            f"<strong>{etransfer_email}</strong>. If you have already sent your payment, "
            "please disregard this notice."
        )
    else:
        payment_copy_html = (
            "If you would like to pay by e-Transfer, you are welcome to send your payment to "
            f"<strong>{etransfer_email}</strong> at your convenience - any time before your scheduled pickup."
        )

    return f"""
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;border:1px solid #e8d9b8;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#7a5a1a;">Payment by e-Transfer</p>
                    <p style="margin:0;font-size:14px;color:#8a6a2a;line-height:1.6;">
                      {payment_copy_html}
                    </p>
                  </td>
                </tr>
              </table>
"""


def render_order_confirmation_email(context: OrderEmailContext) -> RenderedEmail:
    name = context["name"]
    item_name = context["item_name"]
    quantity = context["quantity"]
    pickup_location = context["pickup_location"]
    pickup_time_slot = context["pickup_time_slot"]
    total_price = context["total_price"]
    price_per_item = context["price_per_item"]
    currency = context.get("currency") or CURRENCY
    address = context.get("address", "") or ""
    event_date = context.get("event_date", "") or ""
    etransfer_section_html = _build_etransfer_section_html(context)

    location_display = pickup_location
    if address:
        location_display = f"{pickup_location} - {address}"

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Confirmation - Loku Caters</title>
</head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(18,39,15,0.08);">

          <tr>
            <td style="background:#12270F;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:600;">Loku Caters</p>
              <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">Order Confirmed!</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1C1C1A;">Hi <strong>{name}</strong>,</p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a4a4a;line-height:1.6;">
                Great news! Your Lamprais pre-order has been confirmed. We are so excited to cook this up for you.
                Please see your order details and pickup information below.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #e8e4dc;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#729152;font-weight:600;">Order Summary</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Item</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{item_name} x {quantity}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Price per item</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{currency} ${price_per_item:.2f}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Pickup Date</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{event_date}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Pickup Location</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{location_display}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Time Slot</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{pickup_time_slot}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:12px 0 0;border-top:1px solid #d8d4cc;"></td>
                      </tr>
                      <tr>
                        <td style="font-size:16px;color:#12270F;font-weight:700;padding:4px 0;">Total</td>
                        <td style="font-size:16px;color:#12270F;font-weight:700;text-align:right;padding:4px 0;">{currency} ${total_price:.2f}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

{etransfer_section_html}

              <p style="margin:0;font-size:15px;color:#4a4a4a;line-height:1.6;">
                We look forward to serving you! If you have any questions, simply reply to this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#12270F;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#729152;">2026 Loku Caters - Authentic Sri Lankan Cuisine</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    return {
        "subject": f"Your {item_name} Pre-Order is Confirmed",
        "html": html_body,
    }


def render_pickup_reminder_email(context: OrderEmailContext) -> RenderedEmail:
    name = context["name"]
    item_name = context["item_name"]
    quantity = context["quantity"]
    pickup_location = context["pickup_location"]
    pickup_time_slot = context["pickup_time_slot"]
    total_price = context["total_price"]
    price_per_item = context["price_per_item"]
    currency = context.get("currency") or CURRENCY
    address = context.get("address", "") or ""
    event_date = context.get("event_date", "") or ""
    etransfer_section_html = _build_etransfer_section_html(context, reminder=True)

    location_display = pickup_location
    if address:
        location_display = f"{pickup_location} - {address}"

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pickup Reminder - Loku Caters</title>
</head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(18,39,15,0.08);">

          <tr>
            <td style="background:#12270F;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:600;">Loku Caters</p>
              <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">Pickup Reminder!</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1C1C1A;">Hi <strong>{name}</strong>,</p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a4a4a;line-height:1.6;">
                Just a friendly reminder that your Lamprais order will be ready for pickup on <strong>{event_date}</strong>
                at <strong>{location_display}</strong> during your selected time slot. We look forward to seeing you soon!
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #e8e4dc;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#729152;font-weight:600;">Your Order</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Item</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{item_name} x {quantity}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Price per item</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{currency} ${price_per_item:.2f}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Pickup Date</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{event_date}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Pickup Location</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{location_display}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Time Slot</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{pickup_time_slot}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:12px 0 0;border-top:1px solid #d8d4cc;"></td>
                      </tr>
                      <tr>
                        <td style="font-size:16px;color:#12270F;font-weight:700;padding:4px 0;">Total</td>
                        <td style="font-size:16px;color:#12270F;font-weight:700;text-align:right;padding:4px 0;">{currency} ${total_price:.2f}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

{etransfer_section_html}

              <p style="margin:0;font-size:15px;color:#4a4a4a;line-height:1.6;">
                If you have any questions, simply reply to this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#12270F;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#729152;">2026 Loku Caters - Authentic Sri Lankan Cuisine</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    return {
        "subject": f"Pickup Reminder - Your {item_name} Order",
        "html": html_body,
    }

