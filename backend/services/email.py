import resend
from config import settings

resend.api_key = settings.resend_api_key


def send_confirmation(order_data: dict) -> None:
    if not settings.email_enabled:
        print("[email] Email delivery disabled by EMAIL_ENABLED=false")
        return

    name = order_data["name"]
    item_name = order_data["item_name"]
    quantity = order_data["quantity"]
    pickup_location = order_data["pickup_location"]
    pickup_time_slot = order_data["pickup_time_slot"]
    total_price = order_data["total_price"]
    price_per_item = order_data["price_per_item"]
    currency = order_data.get("currency", "CAD")
    email = order_data["email"]
    address = order_data.get("address", "")

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

              <!-- Order Summary -->
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

    message_payload = {
        "from": f"Loku Caters <{settings.from_email}>",
        "to": [email],
        "subject": f"Your {item_name} Pre-Order is Confirmed",
        "html": html_body,
    }

    if settings.reply_to_email:
        message_payload["reply_to"] = settings.reply_to_email

    resend.Emails.send(message_payload)
