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

STATIC_REGISTRATION_TERMS = """# Official Event Portal Terms & Conditions

Welcome to the official event portal. By accessing the portal, registering for this conference, attending sessions, or uploading materials as faculty, you agree to comply with these terms and policies.

---

# 1. Event Admission & Delegate Passes
* Registration confirmation and official digital entry passes are valid only for the registered individual and are non-transferable without prior written authorization from the organizing committee.
* Attendees must present their official digital pass QR code along with a valid government-issued photo ID at the venue registration desks or self-service kiosks to collect their delegate kit and physical badge.
* Providing fraudulent or misleading attendee information may result in immediate revocation of access without compensation.

---

# 2. Scientific Sessions & Conference Code of Conduct
* All participants, delegates, and faculty are required to treat fellow attendees, staff, and speakers with professional courtesy and respect.
* Disruptive behavior, harassment, unauthorized solicitation, or commercial promotion outside designated exhibition booths is strictly prohibited.
* Seating in session halls is available on a first-come basis up to room safety capacities.

---

# 3. Speaker Guidelines & Presentation Submissions
* Invited speakers and oral presenters must upload slide decks (.pptx or .pdf) via the Speaker Workspace before the designated upload deadline.
* Presenters are responsible for ensuring that all slide content, clinical data, and images comply with ethical guidelines, copyright laws, and patient privacy standards.
* Presentation files checked in at the Speaker Ready Room are synchronized directly to podium AV systems.

---

# 4. Photography, Recording & Content Release
* Official conference media teams may take photographs, video recordings, and live streams of sessions and public areas for academic, archival, and event promotional documentation.
* Unauthorized commercial recording, full-length rebroadcasting, or distribution of session presentations is prohibited.

---

# 5. Payment, Invoices & Cancellation Policy
* All registration fees must be settled in full through the official secure payment gateway prior to pass issuance.
* Official GST / VAT tax invoices and receipts are downloadable directly within your attendee dashboard.
* Refund requests and cancellation terms are governed strictly by the organizer's published fee schedule. Transaction fees and banking surcharges are non-refundable.

---

# 6. Certificates of Attendance & CME Credits
* Official Certificates of Attendance and accredited Continuing Medical Education (CME/CPD) credit certificates are generated electronically.
* Eligible delegates can download their personalized certificates directly from the Certificates tab in the portal upon session completion.

---

# 7. Safety, Security & Venue Regulations
* Physical badges must be worn visibly at all times within conference halls, exhibition zones, and dining areas.
* Delegates must comply with all venue security protocols, fire safety instructions, and health advisories.
"""

STATIC_REGISTRATION_FAQS = [
    {
        "q": "How do I collect my conference badge and delegate kit on-site?",
        "a": "Present your Digital Pass QR Code found in your Attendee Portal at the Self-Service Kiosks or Registration Desk at the venue reception to instantly print your official conference badge.",
        "is_default": True
    },
    {
        "q": "How do invited speakers upload and manage presentation slides?",
        "a": "Invited faculty and speakers can access the Speaker Workspace via the portal header to upload .pptx or .pdf presentation decks and review session timings before the upload deadline.",
        "is_default": True
    },
    {
        "q": "How do I access the multi-track scientific program and session room locations?",
        "a": "Click 'View Program' on the portal homepage or dashboard to explore specialized scientific tracks, hall allocations, keynote timings, and speaker abstracts in real time.",
        "is_default": True
    },
    {
        "q": "Where can I download my payment invoice, receipt, and tax summary?",
        "a": "Navigate to the 'My Registration & Invoice' section on your dashboard to instantly download official PDF tax invoices and payment receipts with GST/VAT details.",
        "is_default": True
    },
    {
        "q": "When and where will my Certificate of Attendance and CME credits be available?",
        "a": "Certificates of Attendance and accredited CME/CPD credit certificates are automatically generated and available for 1-click download in your portal immediately following event completion.",
        "is_default": True
    },
    {
        "q": "What should I do if I need on-site technical support or have accessibility requirements?",
        "a": "Click 'Need help?' or 'Contact Support' in the portal header to view dedicated helpline phone numbers, email assistance, or visit the Help Desk located in the main venue lobby.",
        "is_default": True
    }
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
