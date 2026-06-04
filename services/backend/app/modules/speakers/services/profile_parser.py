import docx
import io
import uuid
import pdfplumber
from pptx import Presentation
from pptx.util import Inches, Pt
from typing import Optional, Dict, Any, Tuple


def generate_profile_docx_template(
    speaker_name: str,
    talk_title: str,
    session_code: str,
    date_time: str
) -> bytes:
    """
    Generates a pre-filled DOCX profile template.
    Speakers fill in fields and paste their image inside the cells.
    """
    doc = docx.Document()
    
    # Branded Header
    doc.add_heading("EventOS — Speaker Profile Template", level=1)
    
    # Instruction
    p = doc.add_paragraph()
    p.add_run("INSTRUCTIONS: ").bold = True
    p.add_run(
        "Please fill in your profile details in the table cells below. "
        "Do not edit the labels in the left column. Place your profile picture "
        "inside the cell next to 'Profile Photo'. Save and upload this file back to your Speaker Portal."
    )
    
    # Table Structure
    table = doc.add_table(rows=8, cols=2)
    table.style = 'Light Shading Accent 1'
    
    # Pre-filled event reference details
    data = [
        ("Speaker Name", speaker_name),
        ("Talk Title", talk_title),
        ("Session Code", session_code),
        ("Date & Time", date_time),
        ("Designation", "Enter your designation / job title here"),
        ("Organization / Affiliation", "Enter your university / company affiliation here"),
        ("Country", "Enter your country here"),
        ("Biography", "Enter your short biography here (up to 400 words)"),
    ]
    
    for i, (label, val) in enumerate(data):
        row = table.rows[i]
        row.cells[0].text = label
        row.cells[0].paragraphs[0].runs[0].bold = True
        row.cells[1].text = val
        
    # Append photo row
    row = table.add_row()
    row.cells[0].text = "Profile Photo"
    row.cells[0].paragraphs[0].runs[0].bold = True
    row.cells[1].text = "[Insert or Paste Profile Picture Here]"
    
    # Save to bytes
    file_stream = io.BytesIO()
    doc.save(file_stream)
    return file_stream.getvalue()


def parse_profile_docx_template(docx_bytes: bytes) -> Tuple[Dict[str, Any], Optional[bytes]]:
    """
    Parses an uploaded DOCX profile template.
    Extracts fields from the tables and attempts to retrieve the first embedded image.
    """
    doc = docx.Document(io.BytesIO(docx_bytes))
    profile_data: Dict[str, Any] = {}
    photo_bytes: Optional[bytes] = None
    
    # Parse tables
    for table in doc.tables:
        for row in table.rows:
            if len(row.cells) >= 2:
                key = row.cells[0].text.strip().lower()
                val = row.cells[1].text.strip()
                
                if "designation" in key:
                    profile_data["designation"] = val
                elif "organization" in key or "affiliation" in key:
                    profile_data["affiliation"] = val
                elif "country" in key:
                    profile_data["country"] = val
                elif "biography" in key or "bio" in key:
                    profile_data["bio"] = val
                    
    # Parse inline shapes / media relationships to find the first image
    for rel_id, part in doc.part.related_parts.items():
        if "image" in part.content_type:
            photo_bytes = part.blob
            break
            
    return profile_data, photo_bytes


def generate_profile_pptx_template(
    speaker_name: str,
    talk_title: str,
    session_code: str,
    date_time: str
) -> bytes:
    """
    Generates a pre-filled PPTX profile template slide.
    """
    prs = Presentation()
    # Set to widescreen layout (16:9)
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)
    
    # Add a blank slide
    blank_layout = prs.slide_layouts[6]
    slide = prs.slides.add_slide(blank_layout)
    
    # Title
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(12.33), Inches(0.8))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    p.text = "EventOS Speaker Profile Form"
    p.font.size = Pt(28)
    p.font.bold = True
    
    # Instructions Box
    instrBox = slide.shapes.add_textbox(Inches(0.5), Inches(1.3), Inches(12.33), Inches(0.5))
    instrBox.text_frame.text = "Instructions: Replace the bracketed text with your details and insert a photo inside the photo box. Do not delete the text boxes."
    instrBox.text_frame.paragraphs[0].font.size = Pt(11)
    instrBox.text_frame.paragraphs[0].font.italic = True
    
    # Left column: details
    leftBox = slide.shapes.add_textbox(Inches(0.5), Inches(2.0), Inches(6.0), Inches(5.0))
    tf_left = leftBox.text_frame
    tf_left.word_wrap = True
    
    details = [
        ("Speaker Name", speaker_name),
        ("Talk Title", talk_title),
        ("Session Code", session_code),
        ("Date & Time", date_time),
        ("Designation", "[Enter Designation Here]"),
        ("Organization", "[Enter Organization Here]"),
        ("Country", "[Enter Country Here]"),
    ]
    
    for i, (label, val) in enumerate(details):
        p_item = tf_left.add_paragraph() if i > 0 else tf_left.paragraphs[0]
        p_item.text = f"{label}: {val}"
        p_item.font.size = Pt(13)
        p_item.space_after = Pt(8)
        
    # Right column: Biography
    rightBox = slide.shapes.add_textbox(Inches(6.8), Inches(2.0), Inches(5.8), Inches(2.8))
    tf_right = rightBox.text_frame
    tf_right.word_wrap = True
    p_bio_lbl = tf_right.paragraphs[0]
    p_bio_lbl.text = "Biography:"
    p_bio_lbl.font.bold = True
    p_bio_lbl.font.size = Pt(13)
    p_bio_lbl.space_after = Pt(4)
    
    p_bio_val = tf_right.add_paragraph()
    p_bio_val.text = "[Type your biography here... (max 400 words)]"
    p_bio_val.font.size = Pt(12)
    
    # Photo box area indicator
    photoBox = slide.shapes.add_textbox(Inches(6.8), Inches(5.0), Inches(3.0), Inches(2.0))
    photoBox.text_frame.text = "[Insert Profile Photo Here]"
    photoBox.text_frame.paragraphs[0].font.size = Pt(11)
    photoBox.text_frame.paragraphs[0].font.bold = True
    
    file_stream = io.BytesIO()
    prs.save(file_stream)
    return file_stream.getvalue()


def parse_profile_pptx_template(pptx_bytes: bytes) -> Tuple[Dict[str, Any], Optional[bytes]]:
    """
    Parses an uploaded PPTX profile template slide.
    Iterates through shapes to identify designation, organization, country, and bio.
    Extracts the first image found in the presentation's related parts.
    """
    prs = Presentation(io.BytesIO(pptx_bytes))
    profile_data: Dict[str, Any] = {}
    photo_bytes: Optional[bytes] = None
    
    # Iterate slides and shapes to extract textual values
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                for paragraph in shape.text_frame.paragraphs:
                    text = paragraph.text.strip()
                    if ":" in text:
                        parts = text.split(":", 1)
                        key = parts[0].strip().lower()
                        val = parts[1].strip()
                        
                        if "designation" in key:
                            profile_data["designation"] = val
                        elif "organization" in key or "affiliation" in key:
                            profile_data["affiliation"] = val
                        elif "country" in key:
                            profile_data["country"] = val
                    elif "biography" in text or "bio" in text:
                        # Sometimes bio is a separate paragraph right after biography title
                        pass
                    elif len(text) > 40 and not text.startswith("Instructions:") and "[Insert" not in text:
                        # Guessing it's the bio text
                        profile_data["bio"] = text

    # Extract first image from shapes
    for slide in prs.slides:
        for shape in slide.shapes:
            try:
                if hasattr(shape, "image") and shape.image:
                    photo_bytes = shape.image.blob
                    break
            except Exception:
                pass
        if photo_bytes:
            break
            
    return profile_data, photo_bytes


def extract_text_from_cv_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Extracts text from a CV PDF and uses heuristics to guess:
    - Designation
    - Organization (affiliation)
    - Short biography block
    """
    text = ""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""
            
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    designation = None
    affiliation = None
    bio = None
    
    designation_keywords = [
        "professor", "director", "manager", "engineer", "lead", "scientist", 
        "consultant", "head", "specialist", "researcher", "postdoc", "phd candidate"
    ]
    
    # Search for designation in the first 15 lines
    for i, line in enumerate(lines[:15]):
        lower_line = line.lower()
        if any(kw in lower_line for kw in designation_keywords):
            # Check if this line is relatively short (typical for job title)
            if len(line) < 100:
                designation = line
                # Often the affiliation/company is the line right before or after
                if i + 1 < len(lines) and len(lines[i+1]) < 100:
                    affiliation = lines[i+1]
                elif i - 1 >= 0 and len(lines[i-1]) < 100:
                    affiliation = lines[i-1]
                break
                
    # Search for a biography block
    # Looks for a paragraph starting with or containing key introductory phrases
    paragraphs = text.split("\n\n")
    for p in paragraphs:
        p_clean = p.replace("\n", " ").strip()
        if len(p_clean) > 100:
            lower_p = p_clean.lower()
            if any(kw in lower_p for kw in ["bio", "biography", "currently a", "received his", "received her", "is working as", "research interests include"]):
                bio = p_clean[:800] # Clamp to 800 chars
                break
                
    # Fallback if no specific bio block found
    if not bio and len(lines) > 5:
        # Join lines 3 to 7 as a basic biography placeholder
        bio = " ".join(lines[3:min(7, len(lines))])
        
    return {
        "designation": designation or "Speaker / Presenter",
        "affiliation": affiliation or "Affiliation / Institution",
        "bio": bio or "Biography details."
    }
