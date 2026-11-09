"""Compatibility names for authoritative, bounded platform permission admission.

Global customer role labels and legacy boolean flags confer no platform authority.
Individual routes still require their operation-specific resource checks; this
module admission is not a customer-resource wildcard.
"""
from app.modules.rbac.services.platform_permissions import require_platform_permission

require_platform_staff = require_platform_permission("platform:staff:view")
require_crm_read = require_platform_permission("platform:crm:view")
require_billing_read = require_platform_permission("platform:billing:view")
require_super_admin = require_platform_permission("platform:administration:manage")
