import { toast as sonnerToast, type ExternalToast } from "sonner";
import React from "react";

/**
 * Deduplicated Toast Helper for Event Portal
 * Automatically hashes or uses the message string as a toast id to prevent duplicate toasts
 * from displaying simultaneously (e.g. React StrictMode effects, double clicks, or multiple components).
 */

type ToastMessage = string | React.ReactNode;

function getToastId(message: ToastMessage, options?: ExternalToast): string | number {
  if (options?.id) return options.id;
  if (typeof message === "string") {
    return "toast_" + message.trim().toLowerCase().slice(0, 64);
  }
  return String(Date.now());
}

export const toast = {
  success: (message: ToastMessage, options?: ExternalToast) => {
    return sonnerToast.success(message, {
      id: getToastId(message, options),
      ...options,
    });
  },
  error: (message: ToastMessage, options?: ExternalToast) => {
    return sonnerToast.error(message, {
      id: getToastId(message, options),
      ...options,
    });
  },
  info: (message: ToastMessage, options?: ExternalToast) => {
    return sonnerToast.info(message, {
      id: getToastId(message, options),
      ...options,
    });
  },
  warning: (message: ToastMessage, options?: ExternalToast) => {
    return sonnerToast.warning(message, {
      id: getToastId(message, options),
      ...options,
    });
  },
  message: (message: ToastMessage, options?: ExternalToast) => {
    return sonnerToast(message, {
      id: getToastId(message, options),
      ...options,
    });
  },
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
  loading: (message: ToastMessage, options?: ExternalToast) => sonnerToast.loading(message, options),
  promise: sonnerToast.promise,
  custom: sonnerToast.custom,
};

export default toast;
