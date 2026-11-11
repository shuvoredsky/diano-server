import { escapeHtml, generateUnsubscribeToken } from '../notifications.utils';
import type {
  NotificationTemplateName,
  RenderedTemplate,
  SupportedLocale,
} from '../notifications.types';

export function renderTemplate(
  templateName: NotificationTemplateName | string,
  data: Record<string, unknown>,
  locale: SupportedLocale = 'en',
  userId?: string | null,
): RenderedTemplate {
  const isBn = locale === 'bn';

  switch (templateName) {
    case 'order_placed': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const totalAmount = escapeHtml(data.totalAmount ?? '0');
      const itemsCount = escapeHtml(data.itemsCount ?? '1');
      const orderLink = `https://diano.com/account/orders/${orderNumber}`;

      if (isBn) {
        return {
          subject: `আপনার ডিয়ানো অর্ডার #${orderNumber} সফলভাবে গ্রহণ করা হয়েছে`,
          html: `<p>প্রিয় গ্রাহক,</p><p>আপনার অর্ডার <strong>#${orderNumber}</strong> (${itemsCount}টি পণ্য, মোট ৳${totalAmount}) সফলভাবে গ্রহণ করা হয়েছে।</p><p><a href="${orderLink}">অর্ডার বিস্তারিত দেখুন</a></p>`,
          text: `প্রিয় গ্রাহক, আপনার অর্ডার #${orderNumber} (${itemsCount}টি পণ্য, মোট ৳${totalAmount}) সফলভাবে গ্রহণ করা হয়েছে। বিস্তারিত: ${orderLink}`,
        };
      }
      return {
        subject: `Your Diano Order #${orderNumber} has been placed`,
        html: `<p>Dear Customer,</p><p>Thank you for shopping with us! Your order <strong>#${orderNumber}</strong> (${itemsCount} item(s), Total: ৳${totalAmount}) has been placed.</p><p><a href="${orderLink}">View Order Details</a></p>`,
        text: `Dear Customer, thank you for shopping with us! Your order #${orderNumber} (${itemsCount} item(s), Total: ৳${totalAmount}) has been placed. View details: ${orderLink}`,
      };
    }

    case 'order_confirmed': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      if (isBn) {
        return {
          subject: `অর্ডার নিশ্চিতকরণ: #${orderNumber}`,
          html: `<p>আপনার অর্ডার <strong>#${orderNumber}</strong> নিশ্চিত করা হয়েছে এবং প্রস্তুত করা হচ্ছে।</p>`,
          text: `আপনার অর্ডার #${orderNumber} নিশ্চিত করা হয়েছে এবং প্রস্তুত করা হচ্ছে।`,
        };
      }
      return {
        subject: `Order Confirmed: #${orderNumber}`,
        html: `<p>Your order <strong>#${orderNumber}</strong> has been confirmed and is being processed.</p>`,
        text: `Your order #${orderNumber} has been confirmed and is being processed.`,
      };
    }

    case 'order_shipped': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const trackingNumber = escapeHtml(data.trackingNumber ?? 'N/A');
      const carrier = escapeHtml(data.carrier ?? 'Delivery Partner');

      if (isBn) {
        return {
          subject: `আপনার অর্ডার #${orderNumber} পাঠানো হয়েছে`,
          html: `<p>আপনার অর্ডার <strong>#${orderNumber}</strong> কুরিয়ার <strong>${carrier}</strong> (ট্র্যাকিং: ${trackingNumber})-এর মাধ্যমে পাঠানো হয়েছে।</p>`,
          text: `আপনার অর্ডার #${orderNumber} কুরিয়ার ${carrier} (ট্র্যাকিং: ${trackingNumber})-এর মাধ্যমে পাঠানো হয়েছে।`,
        };
      }
      return {
        subject: `Your Order #${orderNumber} has been shipped`,
        html: `<p>Your order <strong>#${orderNumber}</strong> is on the way via <strong>${carrier}</strong> (Tracking #${trackingNumber}).</p>`,
        text: `Your order #${orderNumber} is on the way via ${carrier} (Tracking #${trackingNumber}).`,
      };
    }

    case 'order_delivered': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      if (isBn) {
        return {
          subject: `অর্ডার #${orderNumber} পৌঁছে গেছে`,
          html: `<p>আপনার অর্ডার <strong>#${orderNumber}</strong> সফলভাবে ডেলিভারি করা হয়েছে। ডিয়ানোর সাথে থাকার জন্য ধন্যবাদ!</p>`,
          text: `আপনার অর্ডার #${orderNumber} সফলভাবে ডেলিভারি করা হয়েছে। ডিয়ানোর সাথে থাকার জন্য ধন্যবাদ!`,
        };
      }
      return {
        subject: `Order #${orderNumber} Delivered`,
        html: `<p>Your order <strong>#${orderNumber}</strong> has been delivered. Thank you for choosing Diano!</p>`,
        text: `Your order #${orderNumber} has been delivered. Thank you for choosing Diano!`,
      };
    }

    case 'order_cancelled': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const reason = escapeHtml(data.reason ?? 'Cancelled by request');
      if (isBn) {
        return {
          subject: `অর্ডার বাতিল করা হয়েছে: #${orderNumber}`,
          html: `<p>আপনার অর্ডার <strong>#${orderNumber}</strong> বাতিল করা হয়েছে। কারণ: ${reason}</p>`,
          text: `আপনার অর্ডার #${orderNumber} বাতিল করা হয়েছে। কারণ: ${reason}`,
        };
      }
      return {
        subject: `Order Cancelled: #${orderNumber}`,
        html: `<p>Your order <strong>#${orderNumber}</strong> has been cancelled. Reason: ${reason}</p>`,
        text: `Your order #${orderNumber} has been cancelled. Reason: ${reason}`,
      };
    }

    case 'payment_success': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const amount = escapeHtml(data.amount ?? '0');
      const transactionId = escapeHtml(data.transactionId ?? 'N/A');

      if (isBn) {
        return {
          subject: `পেমেন্ট সফল: অর্ডার #${orderNumber}`,
          html: `<p>অর্ডার <strong>#${orderNumber}</strong>-এর জন্য ৳${amount} পেমেন্ট সফল হয়েছে (লেনদেন আইডি: ${transactionId})।</p>`,
          text: `অর্ডার #${orderNumber}-এর জন্য ৳${amount} পেমেন্ট সফল হয়েছে (লেনদেন আইডি: ${transactionId})।`,
        };
      }
      return {
        subject: `Payment Successful: Order #${orderNumber}`,
        html: `<p>We received payment of ৳${amount} for order <strong>#${orderNumber}</strong> (Transaction ID: ${transactionId}).</p>`,
        text: `We received payment of ৳${amount} for order #${orderNumber} (Transaction ID: ${transactionId}).`,
      };
    }

    case 'payment_failed': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const reason = escapeHtml(data.reason ?? 'Transaction failed or was cancelled');
      if (isBn) {
        return {
          subject: `পেমেন্ট ব্যর্থ: অর্ডার #${orderNumber}`,
          html: `<p>অর্ডার <strong>#${orderNumber}</strong>-এর পেমেন্ট সম্পন্ন হয়নি। কারণ: ${reason}। অনুগ্রহ করে পুনরায় চেষ্টা করুন।</p>`,
          text: `অর্ডার #${orderNumber}-এর পেমেন্ট সম্পন্ন হয়নি। কারণ: ${reason}।`,
        };
      }
      return {
        subject: `Payment Failed: Order #${orderNumber}`,
        html: `<p>Payment for order <strong>#${orderNumber}</strong> could not be processed. Reason: ${reason}. Please try again.</p>`,
        text: `Payment for order #${orderNumber} could not be processed. Reason: ${reason}.`,
      };
    }

    case 'refund_completed': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const amount = escapeHtml(data.amount ?? '0');
      if (isBn) {
        return {
          subject: `রিফান্ড সম্পন্ন হয়েছে: #${orderNumber}`,
          html: `<p>অর্ডার <strong>#${orderNumber}</strong>-এর জন্য ৳${amount} রিফান্ড সফলভাবে সম্পন্ন করা হয়েছে।</p>`,
          text: `অর্ডার #${orderNumber}-এর জন্য ৳${amount} রিফান্ড সফলভাবে সম্পন্ন করা হয়েছে।`,
        };
      }
      return {
        subject: `Refund Completed: #${orderNumber}`,
        html: `<p>A refund of ৳${amount} for order <strong>#${orderNumber}</strong> has been successfully processed.</p>`,
        text: `A refund of ৳${amount} for order #${orderNumber} has been successfully processed.`,
      };
    }

    case 'return_status_updated': {
      const returnNumber = escapeHtml(data.returnNumber ?? 'N/A');
      const status = escapeHtml(data.status ?? 'UPDATED');
      if (isBn) {
        return {
          subject: `রিটার্ন স্ট্যাটাস আপডেট: #${returnNumber}`,
          html: `<p>আপনার রিটার্ন অনুরোধ <strong>#${returnNumber}</strong>-এর বর্তমান স্ট্যাটাস: <strong>${status}</strong>।</p>`,
          text: `আপনার রিটার্ন অনুরোধ #${returnNumber}-এর বর্তমান স্ট্যাটাস: ${status}।`,
        };
      }
      return {
        subject: `Return Status Update: #${returnNumber}`,
        html: `<p>Your return request <strong>#${returnNumber}</strong> status is now: <strong>${status}</strong>.</p>`,
        text: `Your return request #${returnNumber} status is now: ${status}.`,
      };
    }

    case 'email_verification': {
      const token = encodeURIComponent(String(data.token ?? ''));
      const verifyUrl = `https://diano.com/verify-email?token=${token}`;
      if (isBn) {
        return {
          subject: 'আপনার ডিয়ানো ইমেইল ঠিকানা যাচাই করুন',
          html: `<p>দয়া করে নিচের লিংকে ক্লিক করে আপনার ইমেইল যাচাই করুন:</p><p><a href="${verifyUrl}">ইমেইল যাচাই করুন</a></p><p>লিংকটি ২৪ ঘণ্টার জন্য কার্যকর।</p>`,
          text: `দয়া করে আপনার ইমেইল যাচাই করতে এই লিংকটিতে যান: ${verifyUrl}`,
        };
      }
      return {
        subject: 'Verify your Diano email address',
        html: `<p>Please click the link below to verify your email address:</p><p><a href="${verifyUrl}">Verify Email</a></p><p>This link is valid for 24 hours.</p>`,
        text: `Please verify your email address by visiting this link: ${verifyUrl}`,
      };
    }

    case 'password_reset': {
      const token = encodeURIComponent(String(data.token ?? ''));
      const resetUrl = `https://diano.com/reset-password?token=${token}`;
      if (isBn) {
        return {
          subject: 'পাসওয়ার্ড রিসেট অনুরোধ',
          html: `<p>আপনার ডিয়ানো অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার অনুরোধ পাওয়া গেছে।</p><p><a href="${resetUrl}">পাসওয়ার্ড রিসেট করুন</a></p><p>আপনি অনুরোধ না করে থাকলে এই বার্তাটি উপেক্ষা করুন।</p>`,
          text: `আপনার পাসওয়ার্ড রিসেট করতে নিচের লিংকে যান: ${resetUrl}`,
        };
      }
      return {
        subject: 'Reset your Diano password',
        html: `<p>We received a request to reset your Diano account password.</p><p><a href="${resetUrl}">Reset Password</a></p><p>If you did not make this request, you can safely ignore this email.</p>`,
        text: `Reset your password by following this link: ${resetUrl}`,
      };
    }

    case 'otp_code': {
      const otp = escapeHtml(data.otp ?? '000000');
      const purpose = escapeHtml(data.purpose ?? 'verification');
      if (isBn) {
        return {
          subject: `আপনার নিরাপত্তা কোড: ${otp}`,
          html: `<p>${purpose}-এর জন্য আপনার ওটিপি কোড হলো: <strong style="font-size: 20px;">${otp}</strong>। কোডটি কাউকে শেয়ার করবেন না।</p>`,
          text: `${purpose}-এর জন্য আপনার ওটিপি কোড: ${otp}। এটি গোপন রাখুন।`,
        };
      }
      return {
        subject: `Your Security Code: ${otp}`,
        html: `<p>Your one-time code for ${purpose} is: <strong style="font-size: 20px;">${otp}</strong>. Do not share this code with anyone.</p>`,
        text: `Your one-time code for ${purpose} is: ${otp}. Do not share this code.`,
      };
    }

    case 'abandoned_checkout_recovery': {
      const customerName = escapeHtml(data.customerName ?? 'Shopper');
      const recoveryUrl = escapeHtml(data.recoveryUrl ?? 'https://diano.com/cart');
      const unsubToken = userId ? generateUnsubscribeToken(userId, 'recovery') : '';
      const unsubUrl = unsubToken ? `https://diano.com/notifications/unsubscribe?token=${unsubToken}` : '';

      const unsubFooter = unsubUrl
        ? `<br><hr><p style="font-size:12px;color:#888;">Don't want recovery emails? <a href="${unsubUrl}">Unsubscribe</a></p>`
        : '';

      if (isBn) {
        return {
          subject: `${customerName}, আপনার কার্টে পণ্য বাকি রয়েছে!`,
          html: `<p>প্রিয় ${customerName},</p><p>আপনার কার্টে কিছু চমৎকার পণ্য অপেক্ষা করছে। এখনই আপনার অর্ডারটি সম্পন্ন করুন:</p><p><a href="${recoveryUrl}">অর্ডার সম্পন্ন করুন</a></p>${unsubFooter}`,
          text: `প্রিয় ${customerName}, আপনার কার্টে পণ্য বাকি রয়েছে! সম্পন্ন করুন: ${recoveryUrl}`,
        };
      }
      return {
        subject: `${customerName}, you left items in your cart!`,
        html: `<p>Hi ${customerName},</p><p>We saved the items you left in your cart. Complete your purchase now before stock runs out:</p><p><a href="${recoveryUrl}">Complete My Order</a></p>${unsubFooter}`,
        text: `Hi ${customerName}, you left items in your cart! Complete your order: ${recoveryUrl}`,
      };
    }

    // Admin Alerts
    case 'low_stock_alert': {
      const variantId = escapeHtml(data.variantId ?? 'N/A');
      const available = escapeHtml(data.available ?? 0);
      const threshold = escapeHtml(data.threshold ?? 5);
      return {
        subject: `[Admin Alert] Low Stock Warning: Variant ${variantId}`,
        html: `<h3>Low Stock Alert</h3><p>Variant <strong>${variantId}</strong> has reached low stock level.</p><p>Available: <strong>${available}</strong> | Threshold: <strong>${threshold}</strong></p>`,
        text: `[Admin Alert] Low Stock: Variant ${variantId} has available stock ${available} (threshold: ${threshold})`,
      };
    }

    case 'out_of_stock_alert': {
      const variantId = escapeHtml(data.variantId ?? 'N/A');
      return {
        subject: `[Admin Alert] Out of Stock: Variant ${variantId}`,
        html: `<h3>Out of Stock Alert</h3><p>Variant <strong>${variantId}</strong> is completely out of stock!</p>`,
        text: `[Admin Alert] Out of Stock: Variant ${variantId} is out of stock.`,
      };
    }

    case 'fraud_review_alert': {
      const orderId = escapeHtml(data.orderId ?? 'N/A');
      const score = escapeHtml(data.score ?? 'N/A');
      const rules = escapeHtml(Array.isArray(data.rules) ? data.rules.join(', ') : 'Suspicious patterns');
      return {
        subject: `[Admin Alert] High Risk Order Flagged: #${orderId}`,
        html: `<h3>Fraud Review Alert</h3><p>Order <strong>#${orderId}</strong> was held with high risk score: <strong>${score}</strong>.</p><p>Triggered Rules: ${rules}</p>`,
        text: `[Admin Alert] High Risk Order #${orderId} held with score ${score}. Rules: ${rules}`,
      };
    }

    case 'new_order_admin_alert': {
      const orderNumber = escapeHtml(data.orderNumber ?? 'N/A');
      const totalAmount = escapeHtml(data.totalAmount ?? '0');
      const customerEmail = escapeHtml(data.customerEmail ?? 'N/A');
      return {
        subject: `[Admin Alert] New Order Placed: #${orderNumber}`,
        html: `<h3>New Order Received</h3><p>Order <strong>#${orderNumber}</strong> for ৳${totalAmount} placed by ${customerEmail}.</p>`,
        text: `[Admin Alert] New Order #${orderNumber} for ৳${totalAmount} placed by ${customerEmail}.`,
      };
    }

    case 'new_review_admin_alert': {
      const productName = escapeHtml(data.productName ?? 'Product');
      const rating = escapeHtml(data.rating ?? '5');
      return {
        subject: `[Admin Alert] New Product Review Submitted: ${productName}`,
        html: `<h3>New Review Pending Moderation</h3><p>A new <strong>${rating}-star</strong> review was submitted for <strong>${productName}</strong> and awaits moderation.</p>`,
        text: `[Admin Alert] New ${rating}-star review submitted for ${productName} awaiting moderation.`,
      };
    }

    default: {
      const text = String(data.message ?? data.content ?? templateName);
      return {
        subject: String(data.subject ?? `Notification: ${templateName}`),
        html: `<p>${escapeHtml(text)}</p>`,
        text,
      };
    }
  }
}

