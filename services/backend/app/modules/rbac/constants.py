from enum import Enum

class PlanTier(str, Enum):
    REGISTRATION = "REGISTRATION"
    CONFERENCE_PROFESSIONAL = "CONFERENCE_PROFESSIONAL"
    ENTERPRISE = "ENTERPRISE"
    LEGACY_UNLIMITED = "LEGACY_UNLIMITED"

class FeatureEntitlement(str, Enum):
    # Core Registration Features (Included in all plans)
    CORE_EVENTS = "CORE:EVENTS"
    CORE_SESSIONS = "CORE:SESSIONS"
    CORE_SPEAKERS = "CORE:SPEAKERS"
    CORE_REGISTRATION = "CORE:REGISTRATION"
    CORE_CHECKIN = "CORE:CHECKIN"
    CORE_CAMPAIGNS = "CORE:CAMPAIGNS"
    
    # Advanced Conference Features (Professional + Enterprise)
    ADV_REG_APPROVALS = "ADV:REG_APPROVALS"
    ADV_BADGE_PRINTING = "ADV:BADGE_PRINTING"
    ADV_PRESENTATION_WORKFLOW = "ADV:PRESENTATION_WORKFLOW"
    ADV_FILE_MONITORING = "ADV:FILE_MONITORING"
    ADV_POSTERS = "ADV:POSTERS"
    ADV_SCIENTIFIC_PROGRAM = "ADV:SCIENTIFIC_PROGRAM"
    ADV_CUSTOM_DOMAINS = "ADV:CUSTOM_DOMAINS"
    ADV_REPORTING = "ADV:REPORTING"
    
    # Enterprise Features (Enterprise only)
    ENT_API_ACCESS = "ENT:API_ACCESS"
    ENT_SSO = "ENT:SSO"
    ENT_WHITE_LABEL = "ENT:WHITE_LABEL"
    ENT_SPONSOR_MGMT = "ENT:SPONSOR_MGMT"
    ENT_INCIDENT_MGMT = "ENT:INCIDENT_MGMT"
    ENT_AI_TOOLS = "ENT:AI_TOOLS"
    
    # Add-Ons (Decoupled)
    ADDON_VENUE_OPERATIONS = "ADDON:VENUE_OPERATIONS"

# Mapping of Plan to included Feature Entitlements
PLAN_FEATURES = {
    PlanTier.REGISTRATION: [
        FeatureEntitlement.CORE_EVENTS,
        FeatureEntitlement.CORE_SESSIONS,
        FeatureEntitlement.CORE_SPEAKERS,
        FeatureEntitlement.CORE_REGISTRATION,
        FeatureEntitlement.CORE_CHECKIN,
        FeatureEntitlement.CORE_CAMPAIGNS,
    ],
    PlanTier.CONFERENCE_PROFESSIONAL: [
        FeatureEntitlement.CORE_EVENTS,
        FeatureEntitlement.CORE_SESSIONS,
        FeatureEntitlement.CORE_SPEAKERS,
        FeatureEntitlement.CORE_REGISTRATION,
        FeatureEntitlement.CORE_CHECKIN,
        FeatureEntitlement.CORE_CAMPAIGNS,
        FeatureEntitlement.ADV_REG_APPROVALS,
        FeatureEntitlement.ADV_BADGE_PRINTING,
        FeatureEntitlement.ADV_PRESENTATION_WORKFLOW,
        FeatureEntitlement.ADV_FILE_MONITORING,
        FeatureEntitlement.ADV_POSTERS,
        FeatureEntitlement.ADV_SCIENTIFIC_PROGRAM,
        FeatureEntitlement.ADV_CUSTOM_DOMAINS,
        FeatureEntitlement.ADV_REPORTING,
    ],
    PlanTier.ENTERPRISE: [
        FeatureEntitlement.CORE_EVENTS,
        FeatureEntitlement.CORE_SESSIONS,
        FeatureEntitlement.CORE_SPEAKERS,
        FeatureEntitlement.CORE_REGISTRATION,
        FeatureEntitlement.CORE_CHECKIN,
        FeatureEntitlement.CORE_CAMPAIGNS,
        FeatureEntitlement.ADV_REG_APPROVALS,
        FeatureEntitlement.ADV_BADGE_PRINTING,
        FeatureEntitlement.ADV_PRESENTATION_WORKFLOW,
        FeatureEntitlement.ADV_FILE_MONITORING,
        FeatureEntitlement.ADV_POSTERS,
        FeatureEntitlement.ADV_SCIENTIFIC_PROGRAM,
        FeatureEntitlement.ADV_CUSTOM_DOMAINS,
        FeatureEntitlement.ADV_REPORTING,
        FeatureEntitlement.ENT_API_ACCESS,
        FeatureEntitlement.ENT_SSO,
        FeatureEntitlement.ENT_WHITE_LABEL,
        FeatureEntitlement.ENT_SPONSOR_MGMT,
        FeatureEntitlement.ENT_INCIDENT_MGMT,
        FeatureEntitlement.ENT_AI_TOOLS,
    ],
    PlanTier.LEGACY_UNLIMITED: [e for e in FeatureEntitlement]
}
