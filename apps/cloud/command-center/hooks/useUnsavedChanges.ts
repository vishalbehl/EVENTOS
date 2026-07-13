"use client";

import { useEffect } from "react";

const DEFAULT_MESSAGE = "You have unsaved changes. Leave without saving?";

export function useUnsavedChanges(isDirty: boolean, message = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, message]);

  return function confirmNavigation(action: () => void) {
    if (!isDirty || window.confirm(message)) action();
  };
}
