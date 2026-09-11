"""SQLAlchemy Core models for QC review.

Carries the vote/consolidation schema of the standalone QC tool: per-reviewer
votes plus Delphi-style consolidation (replicas, agreement threshold, max votes).
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

VERDICTS = ("good", "refine", "bad")


# QC SESSIONS
qc_sessions = Table(
    "qc_sessions",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    Column("name", String(255), nullable=False),
    Column(
        "mode",
        String(20),
        nullable=False,
        server_default=text("'instance'"),
        comment="instance (whole frame) or roi (per-crop classification)",
    ),
    Column("job_id", Integer, ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True),
    Column(
        "config",
        JSONB,
        nullable=False,
        server_default=text(
            '\'{"replicas": 1, "agreement_threshold": 0.66, "max_votes": 3}\'::jsonb'
        ),
        comment="Delphi settings: replicas, agreement_threshold, max_votes",
    ),
    Column(
        "source",
        JSONB,
        nullable=True,
        comment="Where items come from: bucket/prefix or annotation filter",
    ),
    Column(
        "created_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    ),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    CheckConstraint("mode IN ('instance', 'roi')", name="ck_qc_sessions_mode"),
    Index("ix_qc_sessions_project_id", "project_id"),
)

# QC VERDICTS (raw, one row per reviewer per item)
qc_verdicts = Table(
    "qc_verdicts",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "session_id",
        UUID(as_uuid=True),
        ForeignKey("qc_sessions.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "item_key",
        String(1024),
        nullable=False,
        comment="Stable item identifier: image id for instance mode, crop path for roi mode",
    ),
    Column(
        "image_id", UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), nullable=True
    ),
    Column(
        "reviewer_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("verdict", String(20), nullable=False, comment="good, refine or bad"),
    Column(
        "tag", String(255), nullable=True, comment="Free-form grouping tag carried from the QC tool"
    ),
    Column(
        "corrected_label_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="SET NULL"),
        nullable=True,
        comment="ROI mode: the class the reviewer says this crop actually is",
    ),
    Column("note", Text, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    CheckConstraint("verdict IN ('good', 'refine', 'bad')", name="ck_qc_verdicts_verdict"),
    UniqueConstraint("session_id", "item_key", "reviewer_id", name="uq_qc_verdicts_reviewer_item"),
    Index("ix_qc_verdicts_session_item", "session_id", "item_key"),
    # The review queue's NOT EXISTS probe: "has this reviewer voted in this session?"
    Index("ix_qc_verdicts_session_reviewer", "session_id", "reviewer_id"),
)

# QC CONSOLIDATED (one row per item, recomputed from verdicts)
qc_consolidated = Table(
    "qc_consolidated",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column(
        "session_id",
        UUID(as_uuid=True),
        ForeignKey("qc_sessions.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("item_key", String(1024), nullable=False),
    Column(
        "image_id", UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), nullable=True
    ),
    Column("verdict", String(20), nullable=False, comment="Majority verdict, or 'disputed'"),
    Column("tag", String(255), nullable=True),
    Column("n_votes", Integer, nullable=False, server_default=text("0")),
    Column("agreement", Float, nullable=False, server_default=text("0")),
    Column("consensus", Boolean, nullable=False, server_default=text("false")),
    Column("settled", Boolean, nullable=False, server_default=text("false")),
    Column(
        "votes",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
        comment="reviewer_id -> verdict",
    ),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    UniqueConstraint("session_id", "item_key", name="uq_qc_consolidated_item"),
    Index("ix_qc_consolidated_session_verdict", "session_id", "verdict"),
)
