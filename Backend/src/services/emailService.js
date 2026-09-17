import nodemailer from 'nodemailer';

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const isDevelopment = process.env.NODE_ENV === 'development';
  const hasSMTPCredentials = process.env.SMTP_USER && process.env.SMTP_PASS &&
      !process.env.SMTP_USER.includes('your_') && !process.env.SMTP_PASS.includes('your_');

  if (isDevelopment || !hasSMTPCredentials) {
    // Fallback: log to console in dev mode
    transporter = {
      sendMail: async (options) => {
        console.log(`[DEV EMAIL] To: ${options.to} | Subject: ${options.subject}`);
        return { messageId: 'dev-message-id' };
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
};

const TEMPLATES = {
  PENDING: (order) => ({
    subject: `Order Received - #${order.trackingId}`,
    html: `<h3>Your delivery order is created!</h3><p>Tracking ID: <b>${order.trackingId}</b></p><p>We are searching for a nearby rider.</p>`,
  }),
  CONFIRMED: (order) => ({
    subject: `Order Confirmed - #${order.trackingId}`,
    html: `<h3>Your order has been confirmed!</h3><p>Tracking ID: <b>${order.trackingId}</b></p>`,
  }),
  RIDER_ASSIGNED: (order) => ({
    subject: `Rider Assigned to Order #${order.trackingId}`,
    html: `<h3>A rider is on the way for pickup!</h3><p>Rider ID: ${order.rider}</p>`,
  }),
  PICKED_UP: (order) => ({
    subject: `Parcel Picked Up - #${order.trackingId}`,
    html: `<h3>Your package has been picked up from the merchant.</h3>`,
  }),
  IN_TRANSIT: (order) => ({
    subject: `Parcel In Transit - #${order.trackingId}`,
    html: `<h3>Your parcel is moving through our sorting hub.</h3>`,
  }),
  OUT_FOR_DELIVERY: (order) => ({
    subject: `Out for Delivery - #${order.trackingId}`,
    html: `<h3>Your package will be delivered today!</h3>`,
  }),
  DELIVERED: (order) => ({
    subject: `Order Delivered - #${order.trackingId}`,
    html: `<h3>Package successfully delivered.</h3><p>Thank you for using our courier service!</p>`,
  }),
  DELIVERY_FAILED: (order, extra) => ({
    subject: `Delivery Failed - #${order.trackingId}`,
    html: `<h3>Delivery attempt unsuccessful.</h3><p>Reason: ${extra.reason || 'Customer unreachable'}</p>`,
  }),
  CANCELLED: (order, extra) => ({
    subject: `Order Cancelled - #${order.trackingId}`,
    html: `<h3>Your order has been cancelled.</h3><p>Reason: ${extra.reason || 'Cancelled by user'}</p>`,
  }),
};

export class EmailService {
  /**
   * Dispatch lifecycle email notification (Fails gracefully without crashing main execution)
   */
  static async sendOrderStatusEmail(toEmail, status, order, extraData = {}) {
    try {
      const template = TEMPLATES[status];
      if (!template) return;

      const { subject, html } = template(order, extraData);
      const transport = getTransporter();

      await transport.sendMail({
        from: `"Courier Service" <${process.env.SMTP_FROM || 'no-reply@courier.com'}>`,
        to: toEmail,
        subject,
        html,
      });
    } catch (error) {
      console.error(`[Email Error] Failed to send ${status} email to ${toEmail}:`, error.message);
    }
  }
}

export const sendOTPEmail = async (toEmail, otp) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const hasSMTPCredentials = process.env.SMTP_USER && process.env.SMTP_PASS &&
      !process.env.SMTP_USER.includes('your_') && !process.env.SMTP_PASS.includes('your_');

  if (isDevelopment || !hasSMTPCredentials) {
    console.log(`[DEV EMAIL] To: ${toEmail} | OTP: ${otp}`);
    return;
  }

  const transport = getTransporter();
  await transport.sendMail({
    from: `"Courier Express" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Your Verification Code',
    html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; max-width: 500px; margin: auto;">
            <h2 style="color: #333;">Verification Code</h2>
            <p>Your OTP code for account verification is:</p>
            <h1 style="color: #007bff; letter-spacing: 5px; font-size: 36px;">${otp}</h1>
            <p>This code will expire in <strong>5 minutes</strong>.</p>
            <p style="color: #777; font-size: 12px;">If you did not request this, please ignore this email.</p>
        </div>
    `,
  });
};

export default EmailService;