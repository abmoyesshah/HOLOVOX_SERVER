// lib/stripe-order-confirm-mail.js
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendAdminOrderEmail(order) {
  console.log("📧 sendAdminOrderEmail called for order:", order._id);

  const htmlContent = buildOrderEmailHtml(order);

  // 🔥 Parse admin emails – support both single and multiple
  const adminEmailsRaw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  const adminEmails = adminEmailsRaw.split(",").map(email => email.trim()).filter(Boolean);

  if (adminEmails.length === 0) {
    console.warn("⚠️ No admin emails configured – skipping email.");
    return;
  }

  const to = adminEmails.map(email => ({ email }));

  const payload = {
    sender: {
      email: process.env.EMAIL_FROM || "no-reply@holovox.io",
      name: "Holovox Store",
    },
    to,  // ✅ now sends to all admins
    replyTo: {
      email: order.shipping.email,
      name: `${order.shipping.firstName} ${order.shipping.lastName}`,
    },
    subject: `🛒 New Order #${order._id}`,
    htmlContent,
  };

  console.log("📦 Payload:", JSON.stringify(payload, null, 2));
  console.log("🔑 BREVO_API_KEY present?", !!process.env.BREVO_API_KEY);

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log("📨 Status:", response.status);
  console.log("📨 Body:", responseText);

  if (!response.ok) {
    throw new Error(`Brevo error (${response.status}): ${responseText}`);
  }

  const data = JSON.parse(responseText);
  console.log(`✅ Email sent to ${adminEmails.length} admin(s), messageId:`, data.messageId);
  return data;
}

// ---------- HTML builder (unchanged) ----------
function buildOrderEmailHtml(order) {
  const orderDate = new Date(order.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHtml = order.items
    .map(
      (item) => `
        <tr style="border-bottom:1px solid #f0f2f6;">
          <td style="padding:14px 16px;color:#1a1a2e;font-weight:500;">${item.name}</td>
          <td style="padding:14px 16px;text-align:center;color:#4b5563;">${item.quantity}</td>
          <td style="padding:14px 16px;text-align:right;color:#4b5563;">$${item.price.toFixed(2)}</td>
          <td style="padding:14px 16px;text-align:right;color:#1a1a2e;font-weight:500;">$${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Order Notification</title>
  <style>
    @media only screen and (max-width: 480px) {
      .responsive-table { width: 100% !important; }
      .responsive-cell { display: block !important; width: 100% !important; text-align: left !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fc;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background-color:#ffffff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.05);margin:0 auto;border:1px solid #eaedf2;">
          <tr>
            <td style="padding:32px 40px 20px 40px;border-bottom:1px solid #eaedf2;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:22px;font-weight:700;color:#1a1a2e;letter-spacing:-0.5px;">
                    holovox
                    <span style="font-weight:400;color:#6b7280;font-size:14px;margin-left:8px;">|</span>
                    <span style="font-weight:400;color:#6b7280;font-size:14px;margin-left:8px;">order</span>
                  </td>
                  <td align="right" style="font-size:12px;color:#6b7280;font-weight:500;letter-spacing:0.3px;text-transform:uppercase;">
                    #<span style="color:#1a1a2e;font-weight:600;">${order._id.toString().slice(-8)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px 40px 40px;">

              <h1 style="font-size:24px;font-weight:700;color:#1a1a2e;margin:0 0 8px 0;letter-spacing:-0.3px;">
                New order received 🎉
              </h1>
              <p style="font-size:15px;color:#4b5563;margin:0 0 28px 0;line-height:1.6;">
                A new order has been placed on your store. Details are below.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding-bottom:16px;vertical-align:top;width:50%;padding-right:16px;">
                    <div style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Customer</div>
                    <div style="font-size:16px;font-weight:600;color:#1a1a2e;">${order.shipping.firstName} ${order.shipping.lastName}</div>
                    <div style="font-size:14px;color:#4b5563;margin-top:2px;">${order.shipping.email}</div>
                    <div style="font-size:14px;color:#4b5563;">${order.shipping.phone || '—'}</div>
                  </td>
                  <td style="padding-bottom:16px;vertical-align:top;width:50%;">
                    <div style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Order date</div>
                    <div style="font-size:16px;color:#1a1a2e;font-weight:500;">${orderDate}</div>
                    <div style="font-size:13px;color:#6b7280;margin-top:4px;">
                      Status: <span style="background:#e6f7e6;color:#0b7e3d;padding:2px 10px;border-radius:20px;font-weight:600;font-size:12px;">Paid</span>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="border:1px solid #eaedf2;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;border-bottom:1px solid #eaedf2;">
                      <th style="padding:14px 16px;text-align:left;font-weight:600;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;">Product</th>
                      <th style="padding:14px 16px;text-align:center;font-weight:600;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;">Qty</th>
                      <th style="padding:14px 16px;text-align:right;font-weight:600;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;">Price</th>
                      <th style="padding:14px 16px;text-align:right;font-weight:600;color:#4b5563;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                </table>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="right" style="padding:4px 0;">
                    <table cellpadding="0" cellspacing="0" border="0" style="min-width:160px;">
                      <tr>
                        <td style="padding:4px 0;font-size:14px;color:#4b5563;">Subtotal</td>
                        <td style="padding:4px 0 4px 24px;font-size:14px;color:#1a1a2e;font-weight:500;text-align:right;">$${order.subtotal.toFixed(2)}</td>
                      </tr>
                     
                      <tr style="border-top:2px solid #e51a54;">
                        <td style="padding:10px 0 4px 0;font-size:16px;font-weight:700;color:#1a1a2e;">Total</td>
                        <td style="padding:10px 0 4px 24px;font-size:18px;font-weight:700;color:#e51a54;text-align:right;">$${order.total.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <div style="background:#f9fafb;border-radius:12px;padding:18px 20px;margin-bottom:28px;border:1px solid #eaedf2;">
                <div style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px;">Shipping Address</div>
                <div style="font-size:15px;color:#1a1a2e;line-height:1.6;">
                  ${order.shipping.address}<br>
                  ${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}<br>
                  ${order.shipping.country}
                </div>
              </div>

              ${order.notes ? `
                <div style="background:#fff8e7;border-left:3px solid #f59e0b;padding:12px 16px;margin-bottom:28px;border-radius:6px;">
                  <div style="font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px;">Notes</div>
                  <div style="font-size:14px;color:#1a1a2e;">${order.notes}</div>
                </div>
              ` : ''}

            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #eaedf2;padding:24px 40px;background:#f9fafb;border-radius:0 0 16px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:12px;color:#6b7280;text-align:center;line-height:1.8;">
                    &copy; ${new Date().getFullYear()} Holovox. All rights reserved.<br>
                    <span style="color:#9ca3af;font-size:11px;">
                      <a href="#" style="color:#6b7280;text-decoration:none;margin:0 6px;">Privacy</a> ·
                      <a href="#" style="color:#6b7280;text-decoration:none;margin:0 6px;">Terms</a> ·
                      <a href="#" style="color:#6b7280;text-decoration:none;margin:0 6px;">Support</a>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
}
