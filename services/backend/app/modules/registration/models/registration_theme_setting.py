"""
Backward-compatibility alias module for PortalThemeSetting.
"""
from app.modules.registration.models.portal_theme_setting import (
    PortalThemeSetting,
    RegistrationThemeSetting,
)

__all__ = ["PortalThemeSetting", "RegistrationThemeSetting"]
