from html import escape

import resend
from config import settings
from event_config import CURRENCY

resend.api_key = settings.resend_api_key


def _html_text(value) -> str:
    return escape(str(value or ""))


def _subject_text(value) -> str:
    return " ".join(str(value or "").replace("\r", " ").replace("\n", " ").split())[:200]


def _send_html_email(*, to_email: str, subject: str, html_body: str) -> None:
    message_payload = {
        "from": f"Loku Caters <{settings.from_email}>",
        "to": [to_email],
        "subject": _subject_text(subject),
        "html": html_body,
    }

    if settings.reply_to_email:
        message_payload["reply_to"] = settings.reply_to_email

    resend.Emails.send(message_payload)


def _normalize_order_lines(order_data: dict) -> list[dict]:
    raw_lines = order_data.get("items")
    if isinstance(raw_lines, list) and raw_lines:
        normalized = []
        for raw_line in raw_lines:
            if not isinstance(raw_line, dict):
                continue
            normalized.append(
                {
                    "item_name": raw_line.get("item_name", ""),
                    "quantity": int(raw_line.get("quantity", 0) or 0),
                    "base_total": float(raw_line.get("base_total", raw_line.get("total_price", 0)) or 0),
                    "discount_total": float(raw_line.get("discount_total", 0) or 0),
                    "total_price": float(raw_line.get("total_price", 0) or 0),
                }
            )
        if normalized:
            return normalized

    quantity = int(order_data.get("quantity", 0) or 0)
    total_price = float(order_data.get("total_price", 0) or 0)
    return [
        {
            "item_name": order_data.get("item_name", ""),
            "quantity": quantity,
            "base_total": total_price,
            "discount_total": 0.0,
            "total_price": total_price,
        }
    ]


def _build_order_summary_html(order_data: dict) -> str:
    currency = _html_text(order_data.get("currency") or CURRENCY)
    lines = _normalize_order_lines(order_data)
    subtotal = float(order_data.get("subtotal", sum(line["base_total"] for line in lines)) or 0)
    discount_total = float(order_data.get("discount_total", sum(line["discount_total"] for line in lines)) or 0)
    grand_total = float(order_data.get("total_price", sum(line["total_price"] for line in lines)) or 0)
    has_combo_discounts = bool(order_data.get("has_combo_discounts"))
    has_manual_pricing = bool(order_data.get("has_manual_pricing"))
    event_date = _html_text(order_data.get("event_date", ""))
    pickup_location = _html_text(order_data.get("pickup_location", ""))
    pickup_time_slot = _html_text(order_data.get("pickup_time_slot", ""))
    address = _html_text(order_data.get("address", ""))

    location_display = pickup_location
    if address:
        location_display = f"{pickup_location} - {address}"

    item_rows_html = "".join(
        f"""
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">{_html_text(line['item_name'])} x {line['quantity']}</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{currency} ${line['total_price']:.2f}</td>
                      </tr>
"""
        for line in lines
    )

    savings_row_html = ""
    if discount_total > 0:
        if has_combo_discounts:
            discount_label = "Combo savings"
        elif has_manual_pricing:
            discount_label = "Adjusted pricing"
        else:
            discount_label = "Discount"
        savings_row_html = f"""
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">{discount_label}</td>
                        <td style="font-size:14px;color:#2d6a2d;font-weight:600;text-align:right;padding:6px 0;">-{currency} ${discount_total:.2f}</td>
                      </tr>
"""

    pickup_date_row_html = ""
    if event_date:
        pickup_date_row_html = f"""
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Pickup Date</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{event_date}</td>
                      </tr>
"""

    return f"""
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #e8e4dc;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#729152;font-weight:600;">Order Summary</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
{item_rows_html}
                      <tr>
                        <td style="font-size:14px;color:#4a4a4a;padding:6px 0;">Subtotal</td>
                        <td style="font-size:14px;color:#1C1C1A;font-weight:600;text-align:right;padding:6px 0;">{currency} ${subtotal:.2f}</td>
                      </tr>
{savings_row_html}
{pickup_date_row_html}
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
                        <td style="font-size:16px;color:#12270F;font-weight:700;text-align:right;padding:4px 0;">{currency} ${grand_total:.2f}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
"""


def _build_etransfer_section_html(order_data: dict, *, reminder: bool = False) -> str:
    etransfer_enabled = bool(order_data.get("etransfer_enabled"))
    etransfer_email = _html_text(str(order_data.get("etransfer_email") or "").strip())
    pickup_completed = bool(order_data.get("pickup_completed"))
    if not etransfer_enabled or not etransfer_email:
        return ""

    if reminder:
        if pickup_completed:
            payment_copy_html = (
                "If you have not yet sent your e-Transfer payment, you are welcome to send it to "
                f"<strong>{etransfer_email}</strong> at your convenience. If you have already sent your payment, "
                "please disregard this notice."
            )
        else:
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


def send_confirmation(order_data: dict) -> None:
    if not settings.email_enabled:
        print("[email] Email delivery disabled by EMAIL_ENABLED=false")
        return

    name = _html_text(order_data["name"])
    email = order_data["email"]
    etransfer_section_html = _build_etransfer_section_html(order_data)
    summary_html = _build_order_summary_html(order_data)
    order_lines = _normalize_order_lines(order_data)
    subject_line_name = _subject_text(order_lines[0]["item_name"]) if len(order_lines) == 1 else "Loku Caters Pre-Order"

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

          <!-- Header -->
          <tr>
            <td style="background:#12270F;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:600;">Loku Caters</p>
              <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">Order Confirmed!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1C1C1A;">Hi <strong>{name}</strong>,</p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a4a4a;line-height:1.6;">
                Great news! Your Lamprais pre-order has been confirmed. We are so excited to cook this up for you.
                Please see your order details and pickup information below.
              </p>
{summary_html}

{etransfer_section_html}

              <p style="margin:0;font-size:15px;color:#4a4a4a;line-height:1.6;">
                We look forward to serving you! If you have any questions, simply reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
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

    _send_html_email(
        to_email=email,
        subject=f"Your {subject_line_name} is Confirmed",
        html_body=html_body,
    )


def send_reminder(order_data: dict) -> None:
    if not settings.email_enabled:
        print("[email] Email delivery disabled by EMAIL_ENABLED=false")
        return

    name = _html_text(order_data["name"])
    email = order_data["email"]
    event_date = _html_text(order_data.get("event_date", ""))
    etransfer_section_html = _build_etransfer_section_html(order_data, reminder=True)
    summary_html = _build_order_summary_html(order_data)
    pickup_location = _html_text(order_data.get("pickup_location", ""))
    address = _html_text(order_data.get("address", ""))
    location_display = pickup_location
    if address:
        location_display = f"{pickup_location} - {address}"
    if event_date:
        pickup_sentence_html = (
            f"Just a friendly reminder that your Lamprais order will be ready for pickup on "
            f"<strong>{event_date}</strong> at <strong>{location_display}</strong> during your selected time slot. "
            "We look forward to seeing you soon!"
        )
    else:
        pickup_sentence_html = (
            f"Just a friendly reminder that your Lamprais order will be ready for pickup at "
            f"<strong>{location_display}</strong> during your selected time slot. "
            "We look forward to seeing you soon!"
        )
    order_lines = _normalize_order_lines(order_data)
    subject_line_name = _subject_text(order_lines[0]["item_name"]) if len(order_lines) == 1 else "Loku Caters Order"

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

          <!-- Header -->
          <tr>
            <td style="background:#12270F;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:600;">Loku Caters</p>
              <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">Pickup Reminder!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1C1C1A;">Hi <strong>{name}</strong>,</p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a4a4a;line-height:1.6;">
                {pickup_sentence_html}
              </p>
{summary_html}

{etransfer_section_html}

              <p style="margin:0;font-size:15px;color:#4a4a4a;line-height:1.6;">
                If you have any questions, simply reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
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

    _send_html_email(
        to_email=email,
        subject=f"Pickup Reminder - Your {subject_line_name}",
        html_body=html_body,
    )


def send_payment_reminder(order_data: dict) -> None:
    if not settings.email_enabled:
        print("[email] Email delivery disabled by EMAIL_ENABLED=false")
        return

    name = _html_text(order_data["name"])
    email = order_data["email"]
    event_date = _html_text(order_data.get("event_date", ""))
    pickup_completed = bool(order_data.get("pickup_completed"))
    etransfer_section_html = _build_etransfer_section_html(order_data, reminder=True)
    summary_html = _build_order_summary_html(order_data)
    order_lines = _normalize_order_lines(order_data)
    subject_line_name = _subject_text(order_lines[0]["item_name"]) if len(order_lines) == 1 else "Loku Caters Order"
    pickup_sentence_html = ""
    if event_date:
        pickup_sentence_html = (
            f"{f' This order was scheduled for pickup on <strong>{event_date}</strong>.' if pickup_completed else ''}"
            f"{f' Your scheduled pickup is on <strong>{event_date}</strong>.' if not pickup_completed else ''}"
        )

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Reminder - Loku Caters</title>
</head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(18,39,15,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#12270F;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:600;">Loku Caters</p>
              <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">Payment Reminder</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1C1C1A;">Hello <strong>{name}</strong>,</p>
              <p style="margin:0 0 14px;font-size:15px;color:#4a4a4a;line-height:1.6;">
                This is an automated reminder that we have a Loku Caters order on file that is currently marked as unpaid.
                Please review the order details below.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#4a4a4a;line-height:1.6;">
                If you have already sent payment or otherwise resolved this order, please disregard this message.
                {pickup_sentence_html}
              </p>
{summary_html}

{etransfer_section_html}

              <p style="margin:0;font-size:15px;color:#4a4a4a;line-height:1.6;">
                If you have any questions, simply reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
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

    _send_html_email(
        to_email=email,
        subject=f"Payment Reminder - Your {subject_line_name}",
        html_body=html_body,
    )


def _build_event_reminder_list_html(title: str, items: list[str]) -> str:
    rows_html = "".join(
        f"""
                      <tr>
                        <td style="font-size:14px;color:#1C1C1A;padding:4px 0 4px 18px;line-height:1.35;">&bull; {escape(item)}</td>
                      </tr>
"""
        for item in items
    )
    return f"""
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td style="padding:18px 24px 8px;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#729152;font-weight:600;">{escape(title)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 24px 18px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
{rows_html}
                    </table>
                  </td>
                </tr>
              </table>
"""


def _build_event_reminder_button_html(label: str, url: str, *, secondary: bool = False) -> str:
    background = "#ffffff" if secondary else "#F2AF29"
    color = "#12270F" if secondary else "#ffffff"
    border = "1px solid #12270F" if secondary else "1px solid #F2AF29"
    return (
        f'<a href="{escape(url, quote=True)}" '
        f'style="display:inline-block;padding:12px 22px;border-radius:999px;'
        f'background:{background};color:{color};border:{border};font-size:14px;'
        f'font-weight:700;text-decoration:none;">{escape(label)}</a>'
    )


def send_event_reminder_email(email_data: dict) -> None:
    if not settings.email_enabled:
        print("[email] Email delivery disabled by EMAIL_ENABLED=false")
        return

    email = str(email_data.get("email") or "").strip()
    if not email:
        raise ValueError("email is required")

    name = escape(str(email_data.get("name") or "there"))
    event_date = escape(str(email_data.get("event_date") or ""))
    order_url = str(email_data.get("order_url") or "").strip()
    feedback_url = str(email_data.get("feedback_url") or "").strip()
    location_names = [str(value).strip() for value in email_data.get("pickup_locations") or [] if str(value).strip()]
    item_names = [str(value).strip() for value in email_data.get("items") or [] if str(value).strip()]

    if not order_url:
        raise ValueError("order_url is required")
    if not feedback_url:
        raise ValueError("feedback_url is required")
    if not location_names:
        raise ValueError("pickup_locations must contain at least one location")
    if not item_names:
        raise ValueError("items must contain at least one item")

    locations_html = _build_event_reminder_list_html("Pickup Locations", location_names)
    items_html = _build_event_reminder_list_html("Featured Items", item_names)
    order_button_html = _build_event_reminder_button_html("Order This Batch", order_url)
    feedback_button_html = _build_event_reminder_button_html("Cannot Make This Batch?", feedback_url, secondary=True)

    html_body = f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Event Reminder - Loku Caters</title>
</head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(18,39,15,0.08);">
          <tr>
            <td style="background:#12270F;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:600;">Loku Caters</p>
              <h1 style="margin:8px 0 0;font-size:26px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">Event Reminder</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1C1C1A;">Hi <strong>{name}</strong>,</p>
              <p style="margin:0 0 18px;font-size:15px;color:#4a4a4a;line-height:1.7;">
                We wanted to let you know that our next Loku Caters batch is coming up on <strong>{event_date}</strong>.
                We would love to serve you again, so here is a quick look at the pickup options and featured items for this batch.
              </p>

{locations_html}

{items_html}

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;">
                <tr>
                  <td align="left" style="padding-right:10px;padding-bottom:10px;">
                    {order_button_html}
                  </td>
                </tr>
                <tr>
                  <td align="left">
                    {feedback_button_html}
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:15px;color:#4a4a4a;line-height:1.7;">
                If this batch does not work for you, you can share quick feedback from the link above.
                We use that feedback to plan better dates, menus, and pickup options for future events.
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

    _send_html_email(
        to_email=email,
        subject=f"Loku Caters Event Reminder - {event_date}",
        html_body=html_body,
    )
