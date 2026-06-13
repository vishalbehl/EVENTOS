# Walkthrough - Revert Allowed Features to Popup Modal & Layout Refactoring

This walkthrough provides a detailed description of the changes made to the subscription plans management interface in [page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx).

## Overview of Changes

### 1. Left Comparison Table Card Reverted to Display-Only
- Reverted the left **Plan Feature Comparison** card to display-only. The inline features checklist and editor state hooks are no longer shown in this card.
- Removed the height restriction wrapper (`h-[680px]` and `flex flex-col` styles) from the column `div`.
- Removed the inner scrollbar container wrapper (`overflow-auto`, `custom-scrollbar`, and `flex-1`) from the table wrapper element.
- The comparison table now grows to its full natural height without inner scrollbars.

### 2. Right Details Card Cleaned Up & Scrollbars Removed
- Removed the height restriction (`h-[680px]` and `flex flex-col`) from the right Details column `div` so that both columns in the CSS grid stretch naturally to match each other's height.
- Removed `overflow-y-auto`, `pr-1`, `flex-1`, and `custom-scrollbar` classes from the tab contents (Limits and Pricing tabs) and edit mode containers.
- The details card now displays its contents fully without inner scrollbar boxes.

### 3. "Configure Features" Button Placed under "Edit Limits"
- Added the **Configure Features** button in the **Limits** tab of the right Details card, positioned directly below the **Edit Limits** button.
- Both buttons now span the full width (`w-full`) of their tab wrapper.
- The **Configure Features** button was removed from all other locations (such as the left table header or the bottom of the card) to ensure clean and focused navigation.

### 4. Popup Dialog Modal Restored for Feature Configuration
- Added the `<Dialog>` modal markup at the bottom of the file for the Allowed Features configuration.
- When the **Configure Features** button is clicked, it opens this modal dialog showing categories (switches) and allowed features catalog items.
- Configured the modal layout to be spacious with a scrollable features catalog table container (`min-h-[300px]` and `max-h-[85vh]` dialog wrapper), ensuring that the features checklist is extremely easy to navigate.

---

## Verification & Type Checks
- Executed Next.js TypeScript compiler checks:
  ```bash
  npm run type-check
  ```
  **Result**: Successfully passed with zero compilation or syntax errors!
