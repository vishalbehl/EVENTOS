"""create separate template tables

Revision ID: c0326e6460e2
Revises: a86f7b76a0e1
Create Date: 2026-06-29 11:50:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c0326e6460e2'
down_revision: Union[str, None] = 'a86f7b76a0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 0. Check if templates.templates table exists in PG catalog
    bind = op.get_bind()
    table_exists = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'templates' 
            AND table_name = 'templates'
        );
    """)).scalar()

    templates_data = []
    if table_exists:
        res = bind.execute(sa.text("SELECT id, organization_id, name, slug, description, template_type, status, created_at, updated_at FROM templates.templates;"))
        templates_data = res.fetchall()

    import json
    rooms = []
    registrations = []
    srrs = []
    networks = []
    
    for row in templates_data:
        t_id, org_id, name, slug, desc_json, t_type, status, created_at, updated_at = row
        
        is_default = False
        version = 'v1.0'
        usage_count = 0
        specs = {}
        desc_text = ''
        
        if desc_json and desc_json.strip().startswith('{'):
            try:
                meta = json.loads(desc_json)
                is_default = meta.get('is_default', False)
                version = meta.get('version', 'v1.0')
                usage_count = meta.get('usage_count', 0)
                specs = meta.get('specs', {})
                desc_text = meta.get('description', '')
            except Exception:
                desc_text = desc_json
        else:
            desc_text = desc_json
            
        t_type_lower = t_type.lower()
        if t_type_lower == 'room':
            default_capacity = specs.get('default_capacity', specs.get('max_capacity', specs.get('min_capacity', 150)))
            room_type = specs.get('room_type', 'Conference Room')
            setup_time = float(specs.get('setup_time', 2.0))
            teardown_time = float(specs.get('teardown_time', 1.0))
            
            hardware_alloc = specs.get('hardware_allocation', [
                {"hardware_item_id": hw_id, "quantity": 1}
                for hw_id in specs.get("hardware_reqs", [])
            ])
            staff_alloc = specs.get('staff_allocation', [
                {"staff_role_id": st_id, "quantity": 1}
                for st_id in specs.get("staff_reqs", [])
            ])
            
            rooms.append({
                'id': t_id, 'org_id': org_id, 'name': name, 'slug': slug, 'description': desc_text,
                'status': status, 'is_default': is_default, 'version': version, 'usage_count': usage_count,
                'default_capacity': default_capacity, 'room_type': room_type, 'setup_time': setup_time,
                'teardown_time': teardown_time, 'hardware_allocation': json.dumps(hardware_alloc), 'staff_allocation': json.dumps(staff_alloc),
                'created_at': created_at, 'updated_at': updated_at
            })
            
        elif t_type_lower == 'registration':
            registration_type = specs.get('registration_type', 'Onsite')
            min_attendees = specs.get('min_attendees', 1000)
            max_attendees = specs.get('max_attendees', 3000)
            recommended_reg_type = specs.get('recommended_reg_type', 'Conference')
            reg_counters = specs.get('reg_counters', 8)
            kiosks = specs.get('kiosks', 4)
            badge_stations = specs.get('badge_stations', 4)
            qr_stations = specs.get('qr_stations', 8)
            helpdesk_counters = specs.get('helpdesk_counters', 2)
            checkins_per_hour = specs.get('checkins_per_hour', 600)
            badge_per_piece_cost = float(specs.get('badge_per_piece_cost', 15.0))
            setup_time = float(specs.get('setup_time', 2.0))
            teardown_time = float(specs.get('teardown_time', 1.0))
            
            hardware_alloc = specs.get('hardware_allocation', [
                {"hardware_item_id": hw_id, "quantity": 1}
                for hw_id in specs.get("hardware_reqs", [])
            ])
            staff_alloc = specs.get('staff_allocation', [
                {"staff_role_id": st_id, "quantity": 1}
                for st_id in specs.get("staff_reqs", [])
            ])
            
            registrations.append({
                'id': t_id, 'org_id': org_id, 'name': name, 'slug': slug, 'description': desc_text,
                'status': status, 'is_default': is_default, 'version': version, 'usage_count': usage_count,
                'registration_type': registration_type, 'min_attendees': min_attendees, 'max_attendees': max_attendees,
                'recommended_reg_type': recommended_reg_type, 'reg_counters': reg_counters, 'kiosks': kiosks,
                'badge_stations': badge_stations, 'qr_stations': qr_stations, 'helpdesk_counters': helpdesk_counters,
                'checkins_per_hour': checkins_per_hour, 'badge_per_piece_cost': badge_per_piece_cost,
                'setup_time': setup_time, 'teardown_time': teardown_time,
                'hardware_allocation': json.dumps(hardware_alloc), 'staff_allocation': json.dumps(staff_alloc),
                'created_at': created_at, 'updated_at': updated_at
            })
            
        elif t_type_lower == 'srr':
            srr_type = specs.get('srr_type', 'Large')
            min_speakers = specs.get('min_speakers', 150)
            max_speakers = specs.get('max_speakers', 350)
            recommended_event_size = specs.get('recommended_event_size', 'Large')
            preview_stations = specs.get('preview_stations', 16)
            checkin_counters = specs.get('checkin_counters', 2)
            consultation_desks = specs.get('consultation_desks', 1)
            printer_stations = specs.get('printer_stations', 1)
            speakers_per_hour = specs.get('speakers_per_hour', 60)
            setup_time = float(specs.get('setup_time', 3.0))
            teardown_time = float(specs.get('teardown_time', 2.0))
            
            hardware_alloc = specs.get('hardware_allocation', [
                {"hardware_item_id": hw_id, "quantity": 1}
                for hw_id in specs.get("hardware_reqs", [])
            ])
            staff_alloc = specs.get('staff_allocation', [
                {"staff_role_id": st_id, "quantity": 1}
                for st_id in specs.get("staff_reqs", [])
            ])
            
            srrs.append({
                'id': t_id, 'org_id': org_id, 'name': name, 'slug': slug, 'description': desc_text,
                'status': status, 'is_default': is_default, 'version': version, 'usage_count': usage_count,
                'srr_type': srr_type, 'min_speakers': min_speakers, 'max_speakers': max_speakers,
                'recommended_event_size': recommended_event_size, 'preview_stations': preview_stations,
                'checkin_counters': checkin_counters, 'consultation_desks': consultation_desks, 'printer_stations': printer_stations,
                'speakers_per_hour': speakers_per_hour, 'setup_time': setup_time, 'teardown_time': teardown_time,
                'hardware_allocation': json.dumps(hardware_alloc), 'staff_allocation': json.dumps(staff_alloc),
                'created_at': created_at, 'updated_at': updated_at
            })
            
        elif t_type_lower == 'network':
            venue_capacity = specs.get('venue_capacity', '500-2000')
            internet_links = int(specs.get('internet_links', 2))
            network_capacity = specs.get('network_capacity', '1 Gbps')
            isp_type = specs.get('isp_type', 'Dual Fiber Active-Passive')
            primary_router = specs.get('primary_router', 'Cisco Catalyst 8300')
            backup_router = specs.get('backup_router', 'Cisco Catalyst 8200')
            firewall = specs.get('firewall', 'FortiGate 100F')
            core_switches = int(specs.get('core_switches', 1))
            dist_switches = int(specs.get('dist_switches', 2))
            access_switches = int(specs.get('access_switches', 4))
            access_points = int(specs.get('access_points', 12))
            controllers = specs.get('controllers', 'Cloud Controller')
            reg_vlan = specs.get('reg_vlan', '')
            srr_vlan = specs.get('srr_vlan', '')
            org_vlan = specs.get('org_vlan', '')
            prod_vlan = specs.get('prod_vlan', '')
            guest_wifi = specs.get('guest_wifi', '')
            exhibitor_network = specs.get('exhibitor_network', '')
            streaming_network = specs.get('streaming_network', '')
            monitoring_tool = specs.get('monitoring_tool', 'Zabbix / Grafana')
            alerts = specs.get('alerts', 'Slack + SMS Notifications')
            logging = specs.get('logging', 'Syslog Server')
            redundancy = specs.get('redundancy', 'High (Dual ISP + Dual Router)')
            failover_time = specs.get('failover_time', '< 3 seconds')
            
            networks.append({
                'id': t_id, 'org_id': org_id, 'name': name, 'slug': slug, 'description': desc_text,
                'status': status, 'is_default': is_default, 'version': version, 'usage_count': usage_count,
                'venue_capacity': venue_capacity, 'internet_links': internet_links, 'network_capacity': network_capacity,
                'isp_type': isp_type, 'primary_router': primary_router, 'backup_router': backup_router,
                'firewall': firewall, 'core_switches': core_switches, 'dist_switches': dist_switches,
                'access_switches': access_switches, 'access_points': access_points, 'controllers': controllers,
                'reg_vlan': reg_vlan, 'srr_vlan': srr_vlan, 'org_vlan': org_vlan, 'prod_vlan': prod_vlan,
                'guest_wifi': guest_wifi, 'exhibitor_network': exhibitor_network, 'streaming_network': streaming_network,
                'monitoring_tool': monitoring_tool, 'alerts': alerts, 'logging': logging,
                'redundancy': redundancy, 'failover_time': failover_time,
                'created_at': created_at, 'updated_at': updated_at
            })

    # 1. Drop old tables cascadingly
    op.execute(sa.text("DROP TABLE IF EXISTS templates.marketplace_favorites CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.marketplace_purchases CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.marketplace_listings CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.template_reviews CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.template_usage CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.template_installations CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.template_dependencies CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.template_versions CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.templates CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.template_marketplace_categories CASCADE;"))

    # 2. Create the 4 separate tables under templates schema
    op.execute(sa.text("""
        CREATE TABLE templates.room_templates (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
            usage_count INTEGER NOT NULL DEFAULT 0,
            
            default_capacity INTEGER NOT NULL DEFAULT 150,
            room_type VARCHAR(100) NOT NULL DEFAULT 'Conference Room',
            setup_time NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
            teardown_time NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
            
            hardware_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
            staff_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
            
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """))

    op.execute(sa.text("""
        CREATE TABLE templates.registration_templates (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
            usage_count INTEGER NOT NULL DEFAULT 0,
            
            registration_type VARCHAR(100) NOT NULL DEFAULT 'Onsite',
            min_attendees INTEGER NOT NULL DEFAULT 1000,
            max_attendees INTEGER NOT NULL DEFAULT 3000,
            recommended_reg_type VARCHAR(100) NOT NULL DEFAULT 'Conference',
            reg_counters INTEGER NOT NULL DEFAULT 8,
            kiosks INTEGER NOT NULL DEFAULT 4,
            badge_stations INTEGER NOT NULL DEFAULT 4,
            qr_stations INTEGER NOT NULL DEFAULT 8,
            helpdesk_counters INTEGER NOT NULL DEFAULT 2,
            checkins_per_hour INTEGER NOT NULL DEFAULT 600,
            badge_per_piece_cost NUMERIC(10, 2) NOT NULL DEFAULT 15.00,
            setup_time NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
            teardown_time NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
            
            hardware_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
            staff_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
            
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """))

    op.execute(sa.text("""
        CREATE TABLE templates.srr_templates (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
            usage_count INTEGER NOT NULL DEFAULT 0,
            
            srr_type VARCHAR(100) NOT NULL DEFAULT 'Large',
            min_speakers INTEGER NOT NULL DEFAULT 150,
            max_speakers INTEGER NOT NULL DEFAULT 350,
            recommended_event_size VARCHAR(100) NOT NULL DEFAULT 'Large',
            preview_stations INTEGER NOT NULL DEFAULT 16,
            checkin_counters INTEGER NOT NULL DEFAULT 2,
            consultation_desks INTEGER NOT NULL DEFAULT 1,
            printer_stations INTEGER NOT NULL DEFAULT 1,
            speakers_per_hour INTEGER NOT NULL DEFAULT 60,
            setup_time NUMERIC(10, 2) NOT NULL DEFAULT 3.00,
            teardown_time NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
            
            hardware_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
            staff_allocation JSONB NOT NULL DEFAULT '[]'::jsonb,
            
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """))

    op.execute(sa.text("""
        CREATE TABLE templates.network_templates (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
            usage_count INTEGER NOT NULL DEFAULT 0,
            
            venue_capacity VARCHAR(100) NOT NULL DEFAULT '500-2000',
            internet_links INTEGER NOT NULL DEFAULT 2,
            network_capacity VARCHAR(100) NOT NULL DEFAULT '1 Gbps',
            isp_type VARCHAR(100) NOT NULL DEFAULT 'Dual Fiber Active-Passive',
            primary_router VARCHAR(100) NOT NULL DEFAULT 'Cisco Catalyst 8300',
            backup_router VARCHAR(100) NOT NULL DEFAULT 'Cisco Catalyst 8200',
            firewall VARCHAR(100) NOT NULL DEFAULT 'FortiGate 100F',
            core_switches INTEGER NOT NULL DEFAULT 1,
            dist_switches INTEGER NOT NULL DEFAULT 2,
            access_switches INTEGER NOT NULL DEFAULT 4,
            access_points INTEGER NOT NULL DEFAULT 12,
            controllers VARCHAR(100) NOT NULL DEFAULT 'Cloud Controller',
            reg_vlan VARCHAR(255) NOT NULL DEFAULT '',
            srr_vlan VARCHAR(255) NOT NULL DEFAULT '',
            org_vlan VARCHAR(255) NOT NULL DEFAULT '',
            prod_vlan VARCHAR(255) NOT NULL DEFAULT '',
            guest_wifi VARCHAR(255) NOT NULL DEFAULT '',
            exhibitor_network VARCHAR(255) NOT NULL DEFAULT '',
            streaming_network VARCHAR(255) NOT NULL DEFAULT '',
            monitoring_tool VARCHAR(100) NOT NULL DEFAULT 'Zabbix / Grafana',
            alerts VARCHAR(100) NOT NULL DEFAULT 'Slack + SMS Notifications',
            logging VARCHAR(100) NOT NULL DEFAULT 'Syslog Server',
            redundancy VARCHAR(100) NOT NULL DEFAULT 'High (Dual ISP + Dual Router)',
            failover_time VARCHAR(100) NOT NULL DEFAULT '< 3 seconds',
            
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """))

    # 3. Insert parsed rows into the respective new tables
    for r in rooms:
        bind.execute(sa.text("""
            INSERT INTO templates.room_templates (
                id, organization_id, name, slug, description, status, is_default, version, usage_count,
                default_capacity, room_type, setup_time, teardown_time, hardware_allocation, staff_allocation,
                created_at, updated_at
            ) VALUES (
                :id, :org_id, :name, :slug, :description, :status, :is_default, :version, :usage_count,
                :default_capacity, :room_type, :setup_time, :teardown_time, :hardware_allocation::jsonb, :staff_allocation::jsonb,
                :created_at, :updated_at
            )
        """), r)
        
    for r in registrations:
        bind.execute(sa.text("""
            INSERT INTO templates.registration_templates (
                id, organization_id, name, slug, description, status, is_default, version, usage_count,
                registration_type, min_attendees, max_attendees, recommended_reg_type, reg_counters, kiosks,
                badge_stations, qr_stations, helpdesk_counters, checkins_per_hour, badge_per_piece_cost,
                setup_time, teardown_time, hardware_allocation, staff_allocation,
                created_at, updated_at
            ) VALUES (
                :id, :org_id, :name, :slug, :description, :status, :is_default, :version, :usage_count,
                :registration_type, :min_attendees, :max_attendees, :recommended_reg_type, :reg_counters, :kiosks,
                :badge_stations, :qr_stations, :helpdesk_counters, :checkins_per_hour, :badge_per_piece_cost,
                :setup_time, :teardown_time, :hardware_allocation::jsonb, :staff_allocation::jsonb,
                :created_at, :updated_at
            )
        """), r)
        
    for r in srrs:
        bind.execute(sa.text("""
            INSERT INTO templates.srr_templates (
                id, organization_id, name, slug, description, status, is_default, version, usage_count,
                srr_type, min_speakers, max_speakers, recommended_event_size, preview_stations, checkin_counters,
                consultation_desks, printer_stations, speakers_per_hour, setup_time, teardown_time,
                hardware_allocation, staff_allocation,
                created_at, updated_at
            ) VALUES (
                :id, :org_id, :name, :slug, :description, :status, :is_default, :version, :usage_count,
                :srr_type, :min_speakers, :max_speakers, :recommended_event_size, :preview_stations, :checkin_counters,
                :consultation_desks, :printer_stations, :speakers_per_hour, :setup_time, :teardown_time,
                :hardware_allocation::jsonb, :staff_allocation::jsonb,
                :created_at, :updated_at
            )
        """), r)
        
    for r in networks:
        bind.execute(sa.text("""
            INSERT INTO templates.network_templates (
                id, organization_id, name, slug, description, status, is_default, version, usage_count,
                venue_capacity, internet_links, network_capacity, isp_type, primary_router, backup_router,
                firewall, core_switches, dist_switches, access_switches, access_points, controllers,
                reg_vlan, srr_vlan, org_vlan, prod_vlan, guest_wifi, exhibitor_network, streaming_network,
                monitoring_tool, alerts, logging, redundancy, failover_time,
                created_at, updated_at
            ) VALUES (
                :id, :org_id, :name, :slug, :description, :status, :is_default, :version, :usage_count,
                :venue_capacity, :internet_links, :network_capacity, :isp_type, :primary_router, :backup_router,
                :firewall, :core_switches, :dist_switches, :access_switches, :access_points, :controllers,
                :reg_vlan, :srr_vlan, :org_vlan, :prod_vlan, :guest_wifi, :exhibitor_network, :streaming_network,
                :monitoring_tool, :alerts, :logging, :redundancy, :failover_time,
                :created_at, :updated_at
            )
        """), r)

def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS templates.room_templates CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.registration_templates CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.srr_templates CASCADE;"))
    op.execute(sa.text("DROP TABLE IF EXISTS templates.network_templates CASCADE;"))
