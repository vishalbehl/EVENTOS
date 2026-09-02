"""Add form categories and form templates tables and seed default templates

Revision ID: 20260830_1200
Revises: 20260829_1845
Create Date: 2026-08-30 12:00:00.000000

"""
import json
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '20260830_1200'
down_revision = '20260829_1845'
branch_labels = None
depends_on = None


DEFAULT_CATEGORIES = [
    {
        "id": "11111111-1111-1111-1111-111111111101",
        "name": "Registration Form",
        "slug": "registration",
        "description": "Attendee checkout and badge profiles",
        "icon": "ClipboardList",
        "is_system": True,
        "sort_order": 0,
    },
    {
        "id": "11111111-1111-1111-1111-111111111102",
        "name": "Abstract Form",
        "slug": "abstract",
        "description": "Scientific call for papers and peer review intake",
        "icon": "FileText",
        "is_system": True,
        "sort_order": 1,
    },
    {
        "id": "11111111-1111-1111-1111-111111111103",
        "name": "Survey Form",
        "slug": "survey",
        "description": "Post-event CSAT and feedback evaluation",
        "icon": "Star",
        "is_system": True,
        "sort_order": 2,
    },
    {
        "id": "11111111-1111-1111-1111-111111111104",
        "name": "Speaker Intake Form",
        "slug": "speaker_intake",
        "description": "Speaker bio, headshot, and presentation deck uploads",
        "icon": "UserCheck",
        "is_system": True,
        "sort_order": 3,
    },
    {
        "id": "11111111-1111-1111-1111-111111111105",
        "name": "Sponsor Application",
        "slug": "sponsor_application",
        "description": "Exhibitor booth and sponsorship tier applications",
        "icon": "Tag",
        "is_system": True,
        "sort_order": 4,
    },
]

DEFAULT_REGISTRATION_FIELDS = [
    {
        "id": "title",
        "name": "title",
        "label": "Title / Prefix",
        "type": "select",
        "is_default": True,
        "is_required": False,
        "is_active": True,
        "sort_order": 0,
        "placeholder": "Select title",
        "options": ["Dr.", "Prof.", "Mr.", "Ms.", "Mrs."],
        "grid_width": "third",
        "category": "identity",
    },
    {
        "id": "first_name",
        "name": "first_name",
        "label": "First Name",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 1,
        "placeholder": "Enter your first name",
        "grid_width": "half",
        "category": "basic",
    },
    {
        "id": "last_name",
        "name": "last_name",
        "label": "Last Name",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 2,
        "placeholder": "Enter your last name",
        "grid_width": "half",
        "category": "basic",
    },
    {
        "id": "email",
        "name": "email",
        "label": "Email Address",
        "type": "email",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 3,
        "placeholder": "attendee@example.com",
        "grid_width": "half",
        "category": "basic",
    },
    {
        "id": "phone",
        "name": "phone",
        "label": "Phone Number",
        "type": "phone",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 4,
        "placeholder": "Enter mobile number",
        "grid_width": "half",
        "category": "basic",
    },
    {
        "id": "company",
        "name": "company",
        "label": "Institution / Organization",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 5,
        "placeholder": "Enter institution, university, or organization",
        "grid_width": "half",
        "category": "basic",
    },
    {
        "id": "designation",
        "name": "designation",
        "label": "Job Title / Designation",
        "type": "text",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 6,
        "placeholder": "e.g. Senior Consultant / Resident / Lead Engineer",
        "grid_width": "half",
        "category": "basic",
    },
    {
        "id": "country",
        "name": "country",
        "label": "Country & State",
        "type": "country",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 7,
        "placeholder": "Select your country",
        "options": [],
        "grid_width": "full",
        "category": "identity",
    },
    {
        "id": "role",
        "name": "role",
        "label": "Registration Role / Category",
        "type": "select",
        "is_default": True,
        "is_required": True,
        "is_active": True,
        "sort_order": 8,
        "placeholder": "Select your role category",
        "options": ["Delegate", "Postgraduate Student", "Faculty / Speaker", "Corporate Sponsor"],
        "grid_width": "half",
        "category": "identity",
    },
]

DEFAULT_TEMPLATES = [
    {
        "id": "22222222-2222-2222-2222-222222222201",
        "category_id": "11111111-1111-1111-1111-111111111101",
        "name": "Standard Event Registration Form",
        "slug": "standard-event-registration",
        "description": "The complete enterprise conference attendee registration questionnaire with identity verification, institutional profile, country selector, and registration category.",
        "category_key": "registration",
        "scope_type": "GLOBAL",
        "is_default": True,
        "is_system": True,
        "fields": DEFAULT_REGISTRATION_FIELDS,
        "settings": {
            "submit_button_label": "Complete Registration",
            "success_title": "Registration Confirmed!",
            "success_message": "Your registration has been successfully processed. Check your email for badge credentials and schedule details.",
            "terms_and_conditions": "By submitting this form, you acknowledge and agree to the Conference Code of Conduct, Privacy Policy, and on-site badge scanning terms.",
            "include_default_faqs": True,
        },
    },
    {
        "id": "22222222-2222-2222-2222-222222222202",
        "category_id": "11111111-1111-1111-1111-111111111102",
        "name": "Scientific & Academic Abstract Submission",
        "slug": "scientific-abstract-submission",
        "description": "Standard academic call-for-papers intake with author affiliations, presentation preference, structured abstract text, keywords, and manuscript upload.",
        "category_key": "abstract",
        "scope_type": "GLOBAL",
        "is_default": False,
        "is_system": True,
        "fields": [
            {
                "id": "abstract_title",
                "name": "abstract_title",
                "label": "Abstract / Paper Title",
                "type": "text",
                "is_default": False,
                "is_required": True,
                "is_active": True,
                "sort_order": 0,
                "placeholder": "Enter full title of your research paper",
                "grid_width": "full",
                "category": "basic",
            },
            {
                "id": "presentation_format",
                "name": "presentation_format",
                "label": "Preferred Presentation Format",
                "type": "radio",
                "is_default": False,
                "is_required": True,
                "is_active": True,
                "sort_order": 1,
                "options": ["Oral Podium Presentation", "ePoster Display", "Workshop Demo"],
                "grid_width": "full",
                "category": "choice",
            },
            {
                "id": "scientific_track",
                "name": "scientific_track",
                "label": "Conference Topic / Track",
                "type": "select",
                "is_default": False,
                "is_required": True,
                "is_active": True,
                "sort_order": 2,
                "options": ["Cardiology", "Diagnostics & AI", "Genomics", "Medical Policy"],
                "grid_width": "half",
                "category": "choice",
            },
            {
                "id": "abstract_body",
                "name": "abstract_body",
                "label": "Structured Abstract Text",
                "type": "textarea",
                "is_default": False,
                "is_required": True,
                "is_active": True,
                "sort_order": 3,
                "placeholder": "Background, Methods, Results, Conclusion...",
                "grid_width": "full",
                "category": "basic",
            },
            {
                "id": "manuscript_file",
                "name": "manuscript_file",
                "label": "Upload Full Paper / Draft (PDF/DOCX)",
                "type": "file",
                "is_default": False,
                "is_required": False,
                "is_active": True,
                "sort_order": 4,
                "grid_width": "full",
                "category": "media",
            },
        ],
        "settings": {
            "submit_button_label": "Submit Abstract for Review",
            "success_title": "Abstract Submitted Successfully!",
            "success_message": "Your submission has been queued for peer review.",
        },
    },
    {
        "id": "22222222-2222-2222-2222-222222222203",
        "category_id": "11111111-1111-1111-1111-111111111103",
        "name": "Post-Event Attendee Feedback & CSAT Survey",
        "slug": "post-event-attendee-survey",
        "description": "Measure delegate satisfaction, evaluate keynote lectures, gather venue facilities feedback, and calculate Net Promoter Score (NPS).",
        "category_key": "survey",
        "scope_type": "GLOBAL",
        "is_default": False,
        "is_system": True,
        "fields": [
            {
                "id": "overall_rating",
                "name": "overall_rating",
                "label": "Overall Conference Experience",
                "type": "rating",
                "is_default": False,
                "is_required": True,
                "is_active": True,
                "sort_order": 0,
                "grid_width": "full",
                "category": "media",
            },
            {
                "id": "nps_score",
                "name": "nps_score",
                "label": "How likely are you to recommend this conference to a peer?",
                "type": "nps",
                "is_default": False,
                "is_required": True,
                "is_active": True,
                "sort_order": 1,
                "grid_width": "full",
                "category": "media",
            },
            {
                "id": "improvements",
                "name": "improvements",
                "label": "Suggestions for Future Conferences",
                "type": "textarea",
                "is_default": False,
                "is_required": False,
                "is_active": True,
                "sort_order": 2,
                "grid_width": "full",
                "category": "basic",
            },
        ],
        "settings": {
            "submit_button_label": "Submit Feedback",
            "success_title": "Thank You for Your Feedback!",
            "success_message": "Your responses help us improve future conferences.",
        },
    },
]


def upgrade() -> None:
    # 1. Create registration.form_categories table
    op.execute("""
        CREATE TABLE IF NOT EXISTS registration.form_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            slug VARCHAR(100) NOT NULL,
            description VARCHAR(255),
            icon VARCHAR(50) DEFAULT 'ClipboardList',
            is_system BOOLEAN NOT NULL DEFAULT false,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            deleted_at TIMESTAMPTZ,
            deleted_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_form_categories_org_id ON registration.form_categories(organization_id);
        CREATE INDEX IF NOT EXISTS ix_form_categories_slug ON registration.form_categories(slug);
    """)

    # 2. Create registration.form_templates table
    op.execute("""
        CREATE TABLE IF NOT EXISTS registration.form_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            category_id UUID REFERENCES registration.form_categories(id) ON DELETE SET NULL,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
            created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            name VARCHAR(150) NOT NULL,
            slug VARCHAR(150) NOT NULL,
            description TEXT,
            category_key VARCHAR(50) NOT NULL DEFAULT 'registration',
            scope_type VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
            is_default BOOLEAN NOT NULL DEFAULT false,
            is_system BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            version INTEGER NOT NULL DEFAULT 1,
            fields JSONB NOT NULL DEFAULT '[]'::jsonb,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            preview_image_url VARCHAR(500),
            deleted_at TIMESTAMPTZ,
            deleted_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_form_templates_cat_id ON registration.form_templates(category_id);
        CREATE INDEX IF NOT EXISTS ix_form_templates_org_id ON registration.form_templates(organization_id);
        CREATE INDEX IF NOT EXISTS ix_form_templates_cat_key ON registration.form_templates(category_key);
        CREATE INDEX IF NOT EXISTS ix_form_templates_scope ON registration.form_templates(scope_type);
        CREATE INDEX IF NOT EXISTS ix_form_templates_slug ON registration.form_templates(slug);
    """)

    # 3. Add columns to registration.registration_forms if missing
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'registration' AND table_name = 'registration_forms' AND column_name = 'template_id'
            ) THEN
                ALTER TABLE registration.registration_forms 
                ADD COLUMN template_id UUID REFERENCES registration.form_templates(id) ON DELETE SET NULL;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'registration' AND table_name = 'registration_forms' AND column_name = 'category_id'
            ) THEN
                ALTER TABLE registration.registration_forms 
                ADD COLUMN category_id UUID REFERENCES registration.form_categories(id) ON DELETE SET NULL;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'registration' AND table_name = 'registration_forms' AND column_name = 'settings'
            ) THEN
                ALTER TABLE registration.registration_forms 
                ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'registration' AND table_name = 'registration_forms' AND column_name = 'schema_version'
            ) THEN
                ALTER TABLE registration.registration_forms 
                ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
            END IF;
        END $$;
    """)

    # 4. Seed system categories
    for cat in DEFAULT_CATEGORIES:
        op.execute(f"""
            INSERT INTO registration.form_categories (id, name, slug, description, icon, is_system, sort_order, is_active, created_at, updated_at)
            VALUES (
                '{cat["id"]}',
                '{cat["name"]}',
                '{cat["slug"]}',
                '{cat["description"]}',
                '{cat["icon"]}',
                {cat["is_system"]},
                {cat["sort_order"]},
                true,
                now(),
                now()
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                icon = EXCLUDED.icon,
                is_system = EXCLUDED.is_system;
        """)

    # 5. Seed default templates
    for tpl in DEFAULT_TEMPLATES:
        fields_json = json.dumps(tpl["fields"]).replace("'", "''")
        settings_json = json.dumps(tpl["settings"]).replace("'", "''")
        op.execute(f"""
            INSERT INTO registration.form_templates (
                id, category_id, name, slug, description, category_key, scope_type, is_default, is_system, is_active, version, fields, settings, created_at, updated_at
            )
            VALUES (
                '{tpl["id"]}',
                '{tpl["category_id"]}',
                '{tpl["name"]}',
                '{tpl["slug"]}',
                '{tpl["description"]}',
                '{tpl["category_key"]}',
                '{tpl["scope_type"]}',
                {tpl["is_default"]},
                {tpl["is_system"]},
                true,
                1,
                '{fields_json}'::jsonb,
                '{settings_json}'::jsonb,
                now(),
                now()
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category_key = EXCLUDED.category_key,
                is_default = EXCLUDED.is_default,
                is_system = EXCLUDED.is_system,
                fields = EXCLUDED.fields,
                settings = EXCLUDED.settings;
        """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE registration.registration_forms DROP COLUMN IF EXISTS template_id;
        ALTER TABLE registration.registration_forms DROP COLUMN IF EXISTS category_id;
        ALTER TABLE registration.registration_forms DROP COLUMN IF EXISTS settings;
        ALTER TABLE registration.registration_forms DROP COLUMN IF EXISTS schema_version;
        DROP TABLE IF EXISTS registration.form_templates;
        DROP TABLE IF EXISTS registration.form_categories;
    """)
