"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, HandCoins, X, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { approveDiscount, rejectDiscount } from "@/app/dashboard/invoices/[id]/actions";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { btnPrimary, btnSecondary, cardClass } from "@/lib/ui";

const POLL_INTERVAL_MS = 30000;

type DiscountRequestData = {
  product_name: string;
  unit_price: number;
  line_discount: number;
  discount_note: string | null;
  requested_by_name: string;
  invoice_number: string;
};

type DiscountDecisionData = {
  product_name: string;
  unit_price: number;
  line_discount: number;
  decided_by_name: string;
  invoice_number: string;
};

type NotificationRow = {
  id: string;
  type: "discount_request" | "discount_approved" | "discount_rejected";
  invoice_id: string | null;
  invoice_item_id: string | null;
  data: DiscountRequestData | DiscountDecisionData;
  is_read: boolean;
  created_at: string;
};

function formatMoney(value: number) {
  return Number(value ?? 0).toFixed(2);
}

function buildNotificationText(
  notification: NotificationRow,
  t: (key: keyof Dictionary) => string
) {
  const data = notification.data;

  if (notification.type === "discount_request") {
    const requestData = data as DiscountRequestData;
    return t("notifications.requestText")
      .replace("{name}", requestData.requested_by_name)
      .replace("{amount}", formatMoney(requestData.line_discount))
      .replace("{product}", requestData.product_name)
      .replace("{invoice}", requestData.invoice_number);
  }

  const decisionData = data as DiscountDecisionData;
  const key =
    notification.type === "discount_approved"
      ? "notifications.approvedText"
      : "notifications.rejectedText";
  return t(key)
    .replace("{name}", decisionData.decided_by_name)
    .replace("{amount}", formatMoney(decisionData.line_discount))
    .replace("{product}", decisionData.product_name)
    .replace("{invoice}", decisionData.invoice_number);
}

function NotificationIcon({ type }: { type: NotificationRow["type"] }) {
  if (type === "discount_request") {
    return <HandCoins className="h-4 w-4 shrink-0 text-amber-600" />;
  }

  if (type === "discount_approved") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  }

  return <XCircle className="h-4 w-4 shrink-0 text-red-600" />;
}

export function NotificationsBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<NotificationRow | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    const supabase = createClient();
    // RLS already scopes this to the signed-in user's own notifications.
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);

    setUnreadCount(count ?? 0);
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  async function loadNotifications() {
    setIsLoadingList(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, invoice_id, invoice_item_id, data, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    setNotifications((data ?? []) as NotificationRow[]);
    setIsLoadingList(false);
  }

  async function handleToggleOpen() {
    const next = !isOpen;
    setIsOpen(next);

    if (next) {
      await loadNotifications();
    }
  }

  async function markRead(notificationId: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
    setNotifications((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
    );
    refreshUnreadCount();
  }

  async function handleMarkAllRead() {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
  }

  async function handleNotificationClick(notification: NotificationRow) {
    if (!notification.is_read) {
      await markRead(notification.id);
    }

    if (notification.type === "discount_request") {
      setIsOpen(false);
      setSelectedRequest(notification);
      return;
    }

    setIsOpen(false);
    if (notification.invoice_id) {
      router.push(`/dashboard/invoices/${notification.invoice_id}`);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label={t("notifications.title")}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close the dropdown on outside click. */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className={`absolute end-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] ${cardClass} max-h-[28rem] overflow-y-auto shadow-lg`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">{t("notifications.title")}</span>
              {notifications.some((item) => !item.is_read) && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>

            {isLoadingList ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">{t("common.loading")}</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">{t("notifications.empty")}</p>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-3 text-start last:border-0 hover:bg-slate-50 ${
                        notification.is_read ? "bg-white" : "bg-blue-50/60"
                      }`}
                    >
                      <NotificationIcon type={notification.type} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">{buildNotificationText(notification, t)}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatRelativeTime(notification.created_at, locale)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {selectedRequest && (
        <DiscountRequestModal
          notification={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onDecided={() => {
            setSelectedRequest(null);
            refreshUnreadCount();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DiscountRequestModal({
  notification,
  onClose,
  onDecided,
}: {
  notification: NotificationRow;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { t } = useLocale();
  const data = notification.data as DiscountRequestData;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecision(decision: "approve" | "reject") {
    if (!notification.invoice_item_id) {
      setError(t("notifications.missingItemRef"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result =
      decision === "approve"
        ? await approveDiscount(notification.invoice_item_id)
        : await rejectDiscount(notification.invoice_item_id);

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    onDecided();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full max-w-md ${cardClass} p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("notifications.discountRequestTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("invoiceDetail.colProduct")}</span>
            <span className="font-medium text-slate-900">{data.product_name}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("invoiceDetail.colUnitPrice")}</span>
            <span className="font-medium text-slate-900" dir="ltr">
              {formatMoney(data.unit_price)}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("invoiceDetail.colDiscount")}</span>
            <span className="font-medium text-slate-900" dir="ltr">
              {formatMoney(data.line_discount)}
            </span>
          </div>
          {data.discount_note && (
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">{t("sales.colDiscountNote")}</span>
              <span className="font-medium text-slate-900">{data.discount_note}</span>
            </div>
          )}
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("notifications.requestedBy")}</span>
            <span className="font-medium text-slate-900">{data.requested_by_name}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-500">{t("invoices.colInvoice")}</span>
            <span className="font-medium text-slate-900" dir="ltr">
              {data.invoice_number}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => handleDecision("reject")}
            disabled={isSubmitting}
            className={`${btnSecondary} flex-1 border-red-300 text-red-600 hover:bg-red-50`}
          >
            {isSubmitting ? t("invoiceDetail.rejecting") : t("invoiceDetail.reject")}
          </button>
          <button
            type="button"
            onClick={() => handleDecision("approve")}
            disabled={isSubmitting}
            className={`${btnPrimary} flex-1`}
          >
            {isSubmitting ? t("invoiceDetail.approving") : t("invoiceDetail.approve")}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
