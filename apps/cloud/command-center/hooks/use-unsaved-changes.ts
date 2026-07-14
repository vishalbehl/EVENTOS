"use client";

import { useEffect } from "react";

/**
 * Hook to warning the user when trying to close/refresh the page with unsaved changes.
 * @param isDirty Boolean indicating if there are unsaved changes
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // standard browser prompt message (most modern browsers show their own text)
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);
}
