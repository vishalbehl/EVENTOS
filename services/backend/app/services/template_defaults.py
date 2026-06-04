import os
import logging
from typing import List, Dict, Any

logger = logging.getLogger("template_defaults")

def get_file_content_with_fallback(filename: str, static_fallback: str = "") -> str:
    """
    Read file from workspace 'md files' or packaged templates/defaults directory.
    Falls back to static_fallback if both lookups fail.
    """
    current_dir = os.path.dirname(os.path.abspath(__file__)) # app/services
    app_dir = os.path.dirname(current_dir) # app
    
    # 1. Try workspace root / md files
    # app_dir is at SERVICES/BACKEND/APP
    # SERVICES/BACKEND is parent of app
    # SERVICES is parent of backend
    # Workspace root is parent of services
    workspace_root = os.path.dirname(os.path.dirname(app_dir)) 
    workspace_path = os.path.join(workspace_root, "md files", filename)
    
    # 2. Try packaged templates/defaults
    packaged_path = os.path.join(app_dir, "templates", "defaults", filename)
    
    for path in [workspace_path, packaged_path]:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if content.strip():
                        return content
            except Exception as e:
                logger.error(f"Failed to read template file {path}: {e}")
                
    return static_fallback

def parse_faq_markdown(content: str, static_fallback: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Parse FAQ markdown content into a list of dicts: [{'q': ..., 'a': ..., 'is_default': True}].
    Falls back to static_fallback if content is empty.
    """
    if not content or not content.strip():
        return static_fallback or []
    
    faqs = []
    current_q = None
    current_a_lines = []
    
    for line in content.splitlines():
        line_strip = line.strip()
        if line_strip.startswith("## "):
            if current_q:
                faqs.append({
                    "q": current_q,
                    "a": "\n".join(current_a_lines).strip(),
                    "is_default": True
                })
            current_q = line_strip[3:].strip()
            current_a_lines = []
        elif line_strip == "---":
            continue
        elif current_q is not None:
            current_a_lines.append(line)
            
    if current_q:
        faqs.append({
            "q": current_q,
            "a": "\n".join(current_a_lines).strip(),
            "is_default": True
        })
    return faqs

# Static fallbacks (historical defaults)

STATIC_REGISTRATION_TERMS = """# Terms & Conditions

Welcome to our event! Please read these terms carefully before registering.

## 1. Registration & Payment
- All registrations are subject to approval by the organizers.
- Tickets are non-refundable unless specified otherwise by the event policy.

## 2. Event Code of Conduct
- We are committed to providing a safe, inclusive, and harassment-free experience for everyone.

## 3. Privacy Policy & Media Release
- By registering, you agree that photos or videos taken during the event may be used for promotional purposes.
- Your personal details will be stored securely and will not be shared with third parties.
"""

STATIC_REGISTRATION_FAQS = [
    { "q": "What should I bring to the event?", "a": "Please bring a copy of your entry pass QR code (on your phone or printed) along with a valid photo ID for quick check-in.", "is_default": True },
    { "q": "Is there parking available?", "a": "Yes, there is complimentary attendee parking available on-site at the main venue deck. Follow event signage.", "is_default": True },
    { "q": "Can I transfer my ticket?", "a": "Tickets are non-transferable after registration approval. Please contact support if you have an exceptional request.", "is_default": True }
]

STATIC_SPEAKER_TERMS = """# Speaker Terms & Conditions

Welcome! As a speaker, please read these terms carefully before submitting files.

## 1. Presentation Submissions
- All presentation files must be uploaded before the specified deadline.
- Speakers are responsible for ensuring that all content is original and does not violate third-party copyrights.

## 2. Recording & Intellectual Property
- By selecting recording rights, you permit organizers to record and stream your presentation.
- Presentation slides may be compiled and distributed to attendees unless explicitly opted out.

## 3. Speaker Code of Conduct
- Speakers must adhere to the highest standards of professional conduct, ensuring presentations are safe, respectful, and harassment-free.
"""

STATIC_SPEAKER_FAQS = [
    {
        "q": "When is the deadline to upload my presentation?",
        "a": "Please check the countdown banner on your dashboard. Typically, presentations must be uploaded at least 24 hours before your scheduled session.",
        "is_default": True
    },
    {
        "q": "What presentation formats are accepted?",
        "a": "We support PowerPoint (.pptx), PDF, and MP4 video files. Please ensure your files do not exceed the size limit shown on the dashboard.",
        "is_default": True
    },
    {
        "q": "Can I edit my slides after uploading?",
        "a": "Yes, you can upload new versions of your slides anytime before the deadline. Once the deadline passes or the slide is checked in at the Speaker Ready Room, it will be locked.",
        "is_default": True
    },
    {
        "q": "How do I check in at the venue?",
        "a": "Please visit the Speaker Ready Room (SRR) at the venue. Present your digital badge QR code (either Registration or Access code) for check-in and slide verification.",
        "is_default": True
    }
]

def get_default_registration_terms() -> str:
    return get_file_content_with_fallback("registration_tnc.md", STATIC_REGISTRATION_TERMS)

def get_default_registration_faqs() -> List[Dict[str, Any]]:
    content = get_file_content_with_fallback("registration_faq.md")
    return parse_faq_markdown(content, STATIC_REGISTRATION_FAQS)

def get_default_speaker_terms() -> str:
    return get_file_content_with_fallback("speaker_tnc.md", STATIC_SPEAKER_TERMS)

def get_default_speaker_faqs() -> List[Dict[str, Any]]:
    content = get_file_content_with_fallback("speaker_faq.md")
    return parse_faq_markdown(content, STATIC_SPEAKER_FAQS)
