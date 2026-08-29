"""
Speaker Theme Setting compatibility module.
Consolidated into design.portal_theme_settings.
"""
from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
from app.services.template_defaults import get_default_speaker_terms, get_default_speaker_faqs

# Consolidated Model Alias
SpeakerThemeSetting = PortalThemeSetting

DEFAULT_SPEAKER_TERMS = get_default_speaker_terms()
DEFAULT_SPEAKER_FAQS = get_default_speaker_faqs()

__all__ = ["SpeakerThemeSetting", "DEFAULT_SPEAKER_TERMS", "DEFAULT_SPEAKER_FAQS"]
