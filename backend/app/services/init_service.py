import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.organization import Organization
from app.services.auth_service import hash_password

from app.models.rbac import Role, Permission, RolePermission

async def ensure_rbac_defaults():
    """Seed the database with standard roles and permissions."""
    async with AsyncSessionLocal() as db:
        try:
            # 1. Define Standard Permissions
            modules = ["EVENTS", "SESSIONS", "SPEAKERS", "FILES", "ROOMS", "QUEUE", "DEVICES", "USERS", "REPORTS", "POSTERS"]
            actions = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "OVERRIDE", "EXPORT"]
            
            existing_perms_res = await db.execute(select(Permission.code))
            existing_perms = set(existing_perms_res.scalars().all())
            
            for mod in modules:
                for act in actions:
                    code = f"{mod}:{act}"
                    if code not in existing_perms:
                        perm = Permission(code=code, name=f"{act.capitalize()} {mod.capitalize()}", module=mod)
                        db.add(perm)
            
            await db.flush()
            
            # 2. Define Standard Roles
            roles_data = [
                ("Super Admin", "Full system access.", True),
                ("Event Organizer", "Manages events and teams.", False),
                ("Admin", "General administrative access.", False),
                ("Session Manager", "Manage sessions and speakers.", False),
                ("Technician", "Technical room operations.", False),
                ("Moderator", "Session flow control.", False),
                ("Speaker", "Own presentation management.", False),
                ("Viewer", "Read-only access.", False),
            ]
            
            existing_roles_res = await db.execute(select(Role.name))
            existing_roles = set(existing_roles_res.scalars().all())
            
            for name, desc, is_sys in roles_data:
                if name not in existing_roles:
                    role = Role(name=name, description=desc, is_system_role=is_sys)
                    db.add(role)
            
            # 3. Assign Permissions to Roles
            res = await db.execute(select(Role))
            all_roles = {r.name: r for r in res.scalars().all()}
            
            res = await db.execute(select(Permission))
            all_perms = {p.code: p for p in res.scalars().all()}
            
            # Helper to assign
            async def assign_batch(role_name, codes):
                role = all_roles.get(role_name)
                if not role: return
                for c in codes:
                    p = all_perms.get(c)
                    if p:
                        # Check if already assigned
                        check = await db.execute(select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == p.id))
                        if not check.scalar_one_or_none():
                            db.add(RolePermission(role_id=role.id, permission_id=p.id))

            # Super Admin -> All
            if "Super Admin" in all_roles:
                await assign_batch("Super Admin", list(all_perms.keys()))
                
            # Viewer -> All VIEW
            if "Viewer" in all_roles:
                await assign_batch("Viewer", [c for c in all_perms.keys() if c.endswith(":VIEW")])

            # Event Organizer -> All except USERS:
            if "Event Organizer" in all_roles:
                eo_perms = [c for c in all_perms.keys() if not c.startswith("USERS:")]
                # Explicitly add base VIEW permissions
                eo_perms.extend(["EVENTS:VIEW", "USERS:VIEW"])
                await assign_batch("Event Organizer", eo_perms)

            # Admin -> All except USERS:DELETE and global billing
            if "Admin" in all_roles:
                admin_perms = [c for c in all_perms.keys() if c != "USERS:DELETE"]
                await assign_batch("Admin", admin_perms)

            # Session Manager -> Sessions, Speakers, Files, Posters
            if "Session Manager" in all_roles:
                sm_perms = [c for c in all_perms.keys() if c.startswith(("SESSIONS:", "SPEAKERS:", "FILES:", "POSTERS:"))]
                # Essential base VIEW permissions for navigation
                sm_perms.extend(["ROOMS:VIEW", "EVENTS:VIEW"])
                await assign_batch("Session Manager", sm_perms)

            # Technician -> Devices, Queue, Rooms, Files, Speakers, Sessions, Posters
            if "Technician" in all_roles:
                tech_perms = [c for c in all_perms.keys() if c.startswith(("DEVICES:", "QUEUE:", "ROOMS:", "FILES:", "SPEAKERS:", "SESSIONS:", "POSTERS:"))]
                tech_perms.append("EVENTS:VIEW")
                await assign_batch("Technician", tech_perms)
            
            await db.commit()
            logger.info("RBAC defaults and assignments seeded.")
        except Exception as e:
            logger.error(f"Failed to seed RBAC defaults: {e}")
            await db.rollback()

async def ensure_admin_user():
    """
    Ensures that at least one organization and one admin user exist in the database.
    Default Admin: admin@eventos.com / admin123
    """
    # Seed RBAC first
    await ensure_rbac_defaults()
    
    async with AsyncSessionLocal() as db:
        try:
            # 1. Check if any organization exists
            result = await db.execute(select(Organization))
            org = result.scalar_one_or_none()

            if not org:
                logger.info("No organization found. Creating default organization...")
                org = Organization(
                    id=uuid.uuid4(),
                    name="Default Organization",
                    slug="default-org"
                )
                db.add(org)
                await db.flush()

            # 2. Check if any Super Admin exists
            result = await db.execute(select(User).where(User.role == "super_admin"))
            super_admin = result.first()

            if not super_admin:
                admin_email = "admin@eventos.com"
                logger.info(f"No Super Admin found. Creating default admin {admin_email}...")
                admin = User(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    email=admin_email,
                    password_hash=hash_password("admin123"),
                    first_name="Default",
                    last_name="Admin",
                    role="super_admin",
                    is_active=True
                )
                db.add(admin)
                await db.commit()
                logger.info(f"Created default admin: {admin_email} / admin123")
            else:
                logger.debug("At least one Super Admin already exists. Skipping default admin creation.")

        except Exception as e:
            logger.error(f"Failed to ensure admin user: {e}")
            await db.rollback()
