"""Read-only query services for the abstract workflow."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import (
    AbstractAssignment,
    AbstractCall,
    AbstractReview,
    AbstractReviewer,
    AbstractSubmission,
)


@dataclass(frozen=True)
class AbstractDashboardRead:
    call: AbstractCall | None
    submission_counts: dict[str, int]
    reviewer_count: int
    assigned_count: int
    completed_review_count: int
    published_count: int
    recent_submissions: list[AbstractSubmission]


@dataclass(frozen=True)
class ReviewerRead:
    reviewer: AbstractReviewer
    assigned_count: int
    completed_count: int
    conflict_count: int


@dataclass(frozen=True)
class AssignmentRead:
    assignment: AbstractAssignment
    submission: AbstractSubmission
    reviewer: AbstractReviewer


class AbstractQueryService:
    """Own bounded event-scoped abstract reads without writes or commits."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def dashboard(self, *, event_id: uuid.UUID) -> AbstractDashboardRead:
        call = await self.db.scalar(
            select(AbstractCall).where(AbstractCall.event_id == event_id)
        )
        status_rows = (
            await self.db.execute(
                select(AbstractSubmission.status, func.count(AbstractSubmission.id))
                .where(AbstractSubmission.event_id == event_id)
                .group_by(AbstractSubmission.status)
            )
        ).all()
        reviewer_count = int(
            await self.db.scalar(
                select(func.count(AbstractReviewer.id)).where(
                    AbstractReviewer.event_id == event_id
                )
            )
            or 0
        )
        assigned_count = int(
            await self.db.scalar(
                select(func.count(AbstractAssignment.id)).where(
                    AbstractAssignment.event_id == event_id
                )
            )
            or 0
        )
        completed_review_count = int(
            await self.db.scalar(
                select(func.count(AbstractReview.id)).where(
                    AbstractReview.event_id == event_id
                )
            )
            or 0
        )
        published_count = int(
            await self.db.scalar(
                select(func.count(AbstractSubmission.id)).where(
                    AbstractSubmission.event_id == event_id,
                    AbstractSubmission.published_at.is_not(None),
                )
            )
            or 0
        )
        recent_submissions = list(
            (
                await self.db.scalars(
                    select(AbstractSubmission)
                    .where(AbstractSubmission.event_id == event_id)
                    .order_by(AbstractSubmission.updated_at.desc())
                    .limit(8)
                )
            ).all()
        )
        return AbstractDashboardRead(
            call=call,
            submission_counts={status: int(count) for status, count in status_rows},
            reviewer_count=reviewer_count,
            assigned_count=assigned_count,
            completed_review_count=completed_review_count,
            published_count=published_count,
            recent_submissions=recent_submissions,
        )

    async def get_call(self, *, event_id: uuid.UUID) -> AbstractCall | None:
        return await self.db.scalar(
            select(AbstractCall).where(AbstractCall.event_id == event_id)
        )

    async def get_active_form(self, *, event_id: uuid.UUID) -> object | None:
        from app.modules.abstracts.models import AbstractForm

        return await self.db.scalar(
            select(AbstractForm)
            .where(AbstractForm.event_id == event_id, AbstractForm.is_active.is_(True))
            .order_by(AbstractForm.version.desc())
        )

    async def list_submissions(
        self,
        *,
        event_id: uuid.UUID,
        status_filter: str | None = None,
        search: str | None = None,
        topic: str | None = None,
        cursor: uuid.UUID | None = None,
        limit: int = 100,
    ) -> tuple[list[AbstractSubmission], bool]:
        """Return one bounded, cursor-ordered submission page without writes."""
        bounded_limit = min(max(limit, 1), 200)
        query = (
            select(AbstractSubmission)
            .where(AbstractSubmission.event_id == event_id)
            .order_by(AbstractSubmission.id)
            .limit(bounded_limit + 1)
        )
        if status_filter:
            query = query.where(AbstractSubmission.status == status_filter.upper())
        if topic:
            query = query.where(AbstractSubmission.topic == topic)
        if search:
            needle = f"%{search.strip()}%"
            query = query.where(
                AbstractSubmission.title.ilike(needle)
                | AbstractSubmission.body.ilike(needle)
                | AbstractSubmission.code.ilike(needle)
                | AbstractSubmission.topic.ilike(needle)
            )
        if cursor:
            query = query.where(AbstractSubmission.id > cursor)
        rows = list((await self.db.scalars(query)).all())
        return rows[:bounded_limit], len(rows) > bounded_limit

    async def get_submission(
        self, *, event_id: uuid.UUID, submission_id: uuid.UUID
    ) -> AbstractSubmission | None:
        return await self.db.scalar(
            select(AbstractSubmission).where(
                AbstractSubmission.id == submission_id,
                AbstractSubmission.event_id == event_id,
            )
        )

    async def list_reviewers(self, *, event_id: uuid.UUID) -> list[ReviewerRead]:
        assigned_counts = (
            select(
                AbstractAssignment.reviewer_id.label("reviewer_id"),
                func.count(AbstractAssignment.id).label("assigned_count"),
                func.count(AbstractAssignment.id)
                .filter(AbstractAssignment.conflict_declared.is_(True))
                .label("conflict_count"),
            )
            .where(AbstractAssignment.event_id == event_id)
            .group_by(AbstractAssignment.reviewer_id)
            .subquery()
        )
        completed_counts = (
            select(
                AbstractReview.reviewer_id.label("reviewer_id"),
                func.count(AbstractReview.id).label("completed_count"),
            )
            .where(AbstractReview.event_id == event_id)
            .group_by(AbstractReview.reviewer_id)
            .subquery()
        )
        rows = (
            await self.db.execute(
                select(
                    AbstractReviewer,
                    func.coalesce(assigned_counts.c.assigned_count, 0),
                    func.coalesce(completed_counts.c.completed_count, 0),
                    func.coalesce(assigned_counts.c.conflict_count, 0),
                )
                .outerjoin(
                    assigned_counts,
                    assigned_counts.c.reviewer_id == AbstractReviewer.id,
                )
                .outerjoin(
                    completed_counts,
                    completed_counts.c.reviewer_id == AbstractReviewer.id,
                )
                .where(AbstractReviewer.event_id == event_id)
                .order_by(AbstractReviewer.full_name)
            )
        ).all()
        return [
            ReviewerRead(
                reviewer=reviewer,
                assigned_count=int(assigned or 0),
                completed_count=int(completed or 0),
                conflict_count=int(conflicts or 0),
            )
            for reviewer, assigned, completed, conflicts in rows
        ]

    async def reviewer_stats(
        self, *, event_id: uuid.UUID, reviewer_id: uuid.UUID
    ) -> tuple[int, int, int]:
        # Scalar subqueries avoid the row multiplication that occurs when
        # assignments and reviews are joined in the same aggregate.
        assigned = (
            select(func.count(AbstractAssignment.id))
            .where(
                AbstractAssignment.reviewer_id == reviewer_id,
                AbstractAssignment.event_id == event_id,
            )
            .scalar_subquery()
        )
        completed = (
            select(func.count(AbstractReview.id))
            .where(
                AbstractReview.reviewer_id == reviewer_id,
                AbstractReview.event_id == event_id,
            )
            .scalar_subquery()
        )
        conflicts = (
            select(func.count(AbstractAssignment.id))
            .where(
                AbstractAssignment.reviewer_id == reviewer_id,
                AbstractAssignment.event_id == event_id,
                AbstractAssignment.conflict_declared.is_(True),
            )
            .scalar_subquery()
        )
        row = (await self.db.execute(select(assigned, completed, conflicts))).one()
        return tuple(int(value or 0) for value in row)

    async def list_assignments(
        self, *, event_id: uuid.UUID
    ) -> list[AssignmentRead]:
        rows = (
            await self.db.execute(
                select(AbstractAssignment, AbstractSubmission, AbstractReviewer)
                .join(
                    AbstractSubmission,
                    AbstractSubmission.id == AbstractAssignment.submission_id,
                )
                .join(
                    AbstractReviewer,
                    AbstractReviewer.id == AbstractAssignment.reviewer_id,
                )
                .where(AbstractAssignment.event_id == event_id)
                .order_by(AbstractAssignment.assigned_at.desc())
            )
        ).all()
        return [
            AssignmentRead(
                assignment=assignment,
                submission=submission,
                reviewer=reviewer,
            )
            for assignment, submission, reviewer in rows
        ]

    async def list_submissions_for_export(
        self, *, event_id: uuid.UUID, accepted_only: bool = False
    ) -> list[AbstractSubmission]:
        """Load the event-scoped source rows used by exports and directories."""
        query = select(AbstractSubmission).where(
            AbstractSubmission.event_id == event_id
        )
        if accepted_only:
            query = query.where(AbstractSubmission.status == "ACCEPTED")
        rows = (
            await self.db.scalars(query.order_by(AbstractSubmission.code))
        ).all()
        return list(rows)

    async def list_accepted_submissions(
        self, *, event_id: uuid.UUID
    ) -> list[AbstractSubmission]:
        query = (
            select(AbstractSubmission)
            .where(
                AbstractSubmission.event_id == event_id,
                AbstractSubmission.status == "ACCEPTED",
            )
            .order_by(AbstractSubmission.title)
        )
        return list((await self.db.scalars(query)).all())
