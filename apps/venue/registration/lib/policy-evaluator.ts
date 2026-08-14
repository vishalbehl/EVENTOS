export interface VenueOperationalPolicy {
  id?: string;
  allowed_payment_statuses_for_checkin: string[];
  allowed_payment_statuses_for_print: string[];
  allowed_payment_statuses_for_self_checkin: string[];
  available_payment_statuses?: string[];
  require_paid_for_checkin: boolean;
  require_paid_for_print: boolean;
  require_paid_for_self_checkin: boolean;
  require_checkin_for_print: boolean;
  require_checkin_for_kit: boolean;
  require_primary_checkin_for_companions: boolean;
  max_badge_reprints: number;
  allow_self_checkin_reprints: boolean;
  max_self_checkin_reprints: number;
  allow_self_checkin_profile_edit: boolean;
  limit_single_kit_per_delegate: boolean;
  max_companions_per_delegate: number;
  allow_admin_override: boolean;
  custom_rules?: Record<string, any>;
  updated_at?: string | null;
  updated_by?: string;
}

export const DEFAULT_VENUE_POLICY: VenueOperationalPolicy = {
  allowed_payment_statuses_for_checkin: ["All"],
  allowed_payment_statuses_for_print: ["All"],
  allowed_payment_statuses_for_self_checkin: ["All"],
  available_payment_statuses: ["All", "Paid", "Unpaid", "Complimentary", "Free", "Waived", "Sponsored"],
  require_paid_for_checkin: false,
  require_paid_for_print: false,
  require_paid_for_self_checkin: false,
  require_checkin_for_print: true,
  require_checkin_for_kit: true,
  require_primary_checkin_for_companions: true,
  max_badge_reprints: 1,
  allow_self_checkin_reprints: true,
  max_self_checkin_reprints: 1,
  allow_self_checkin_profile_edit: true,
  limit_single_kit_per_delegate: true,
  max_companions_per_delegate: 2,
  allow_admin_override: true,
};

export type PolicyAction =
  | "checkin"
  | "print"
  | "reprint"
  | "issue_kit"
  | "add_companion"
  | "self_checkin_lookup"
  | "self_checkin_edit";

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
  badgeText?: string;
  requiresAdminOverride?: boolean;
  redirectToDesk?: boolean;
}

function isPaymentStatusAllowed(status: string | undefined, allowedStatuses: string[] | undefined) {
  const allowed = (allowedStatuses?.length ? allowedStatuses : ["All"])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length || allowed.includes("all") || allowed.includes("*")) return true;
  return allowed.includes((status || "Unpaid").trim().toLowerCase());
}

export function evaluatePolicyAction(
  participant: {
    id?: string;
    name?: string;
    paid_status?: string;
    is_checked_in?: boolean;
    checked_in?: boolean;
    is_companion?: boolean;
    primary_delegate_checked_in?: boolean;
  } | null,
  action: PolicyAction,
  policy: VenueOperationalPolicy = DEFAULT_VENUE_POLICY,
  stats?: {
    print_count?: number;
    reprint_count?: number;
    kit_issued?: boolean;
    companions_count?: number;
  }
): PolicyEvaluationResult {
  if (!participant) {
    return { allowed: false, reason: "No participant selected." };
  }

  const isCheckedIn = Boolean(participant.checked_in || participant.is_checked_in);

  switch (action) {
    case "checkin": {
      if (!isPaymentStatusAllowed(participant.paid_status, policy.allowed_payment_statuses_for_checkin)) {
        return {
          allowed: false,
          reason: `Payment Status Not Allowed: Delegate '${participant.name || ""}' is marked as ${participant.paid_status || "Unpaid"}.`,
          badgeText: "Payment Status Blocked",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      if (participant.is_companion && policy.require_primary_checkin_for_companions && !participant.primary_delegate_checked_in) {
        return {
          allowed: false,
          reason: "Primary Check-In Required: Primary delegate must check in before companion can check in.",
          badgeText: "Primary Unchecked",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      return { allowed: true };
    }

    case "print": {
      if (!isPaymentStatusAllowed(participant.paid_status, policy.allowed_payment_statuses_for_print)) {
        return {
          allowed: false,
          reason: `Payment Status Not Allowed: Cannot print badge for participant marked as ${participant.paid_status || "Unpaid"}.`,
          badgeText: "Payment Status Blocked",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      if (policy.require_checkin_for_print && !isCheckedIn) {
        return {
          allowed: false,
          reason: "Check-In Required: Delegate must complete check-in before printing badge.",
          badgeText: "Check-In Required",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      return { allowed: true };
    }

    case "reprint": {
      if (!isPaymentStatusAllowed(participant.paid_status, policy.allowed_payment_statuses_for_print)) {
        return {
          allowed: false,
          reason: `Payment Status Not Allowed: Cannot reprint badge for participant marked as ${participant.paid_status || "Unpaid"}.`,
          badgeText: "Payment Status Blocked",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      if (policy.require_checkin_for_print && !isCheckedIn) {
        return {
          allowed: false,
          reason: "Check-In Required: Delegate must complete check-in before reprinting badge.",
          badgeText: "Check-In Required",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      const reprints = stats?.reprint_count ?? 0;
      if (policy.max_badge_reprints > 0 && reprints >= policy.max_badge_reprints) {
        return {
          allowed: false,
          reason: `Reprint Limit Reached: Maximum allowed reprints (${policy.max_badge_reprints}) exceeded.`,
          badgeText: "Reprint Limit Reached",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      return { allowed: true };
    }

    case "issue_kit": {
      if (policy.require_checkin_for_kit && !isCheckedIn) {
        return {
          allowed: false,
          reason: "Check-In Required: Delegate must complete check-in before receiving event kit.",
          badgeText: "Check-In Required",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      if (policy.limit_single_kit_per_delegate && stats?.kit_issued) {
        return {
          allowed: false,
          reason: "Kit Already Issued: Delegate has already received an event kit.",
          badgeText: "Already Claimed",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      return { allowed: true };
    }

    case "add_companion": {
      if (policy.require_primary_checkin_for_companions && !isCheckedIn) {
        return {
          allowed: false,
          reason: "Primary Check-In Required: Primary delegate must check in before registering companions.",
          badgeText: "Check-In Required",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      const companionsCount = stats?.companions_count ?? 0;
      if (policy.max_companions_per_delegate > 0 && companionsCount >= policy.max_companions_per_delegate) {
        return {
          allowed: false,
          reason: `Companion Limit Reached: Maximum allowed companions (${policy.max_companions_per_delegate}) reached.`,
          badgeText: "Limit Exceeded",
          requiresAdminOverride: policy.allow_admin_override,
        };
      }
      return { allowed: true };
    }

    case "self_checkin_lookup": {
      if (!isPaymentStatusAllowed(participant.paid_status, policy.allowed_payment_statuses_for_self_checkin)) {
        return {
          allowed: false,
          reason: "Payment status not allowed for kiosk check-in. Please visit the Registration Desk.",
          badgeText: "Visit Registration Desk",
          redirectToDesk: true,
        };
      }
      return { allowed: true };
    }

    case "self_checkin_edit": {
      if (!policy.allow_self_checkin_profile_edit) {
        return {
          allowed: false,
          reason: "Kiosk editing disabled: Changes must be made at the Registration Desk.",
          badgeText: "Editing Locked",
          redirectToDesk: true,
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}
