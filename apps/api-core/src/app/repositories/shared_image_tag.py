"""Repository layer for SharedImageTag (junction) data access - project-scoped.

Bulk operations take an **image scope**: either an explicit list of ids, or a `Select` of ids such as `ProjectImageRepository.filtered_image_ids_subquery`. A scope given as a statement never reaches Python: it is frozen once into a transaction-scoped temp table and every write joins against that. The cost of a bulk tag is then a fixed handful of statements — one per tag plus a constant — rather than three to five round trips per (image, tag) pair, which is what made "tag everything matching this filter" over tens of thousands of images unable to finish.

Freezing is not an optimisation, it is required for correctness. The scope is usually a filter, and a filter can name tags; applying a tag changes which images the filter matches. Re-running the scope between the delete and the insert would therefore act on a different image set each time — "select everything tagged red, apply blue" would delete the red tags and then find nothing left to tag. The temp table is the snapshot the old materialised id list used to provide.
"""

from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from sqlalchemy import (
    Column,
    MetaData,
    Select,
    Table,
    and_,
    delete,
    func,
    insert,
    literal,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.schema import CreateTable, DropTable

from app.models.data_management import shared_image_tags, shared_images, tag_categories, tags

#: An image set named either by its ids or by a statement that yields them.
ImageScope = list[UUID] | Select


class SharedImageTagRepository:
    """Async repository for project-scoped shared image tag operations."""

    @staticmethod
    async def add_tag(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
        user_id: UUID | None = None,
        category_id: UUID | None = None,
    ) -> dict | None:
        """Add a tag to an image in a project. Returns None if already exists."""
        # Check if already exists
        existing = await SharedImageTagRepository.get_link(
            connection, project_id, shared_image_id, tag_id
        )
        if existing:
            return existing

        # If category_id not provided, fetch it from the tag
        if category_id is None:
            tag_info = await SharedImageTagRepository._get_tag_category_info(connection, tag_id)
            if tag_info:
                category_id = tag_info["category_id"]
            else:
                return None  # Tag not found

        data = {
            "project_id": project_id,
            "shared_image_id": shared_image_id,
            "tag_id": tag_id,
            "category_id": category_id,
            "created_by": user_id,
        }
        stmt = insert(shared_image_tags).values(**data).returning(shared_image_tags)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def remove_tag(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
    ) -> bool:
        """Remove a tag from an image in a project."""
        stmt = delete(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id == shared_image_id,
            shared_image_tags.c.tag_id == tag_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_link(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
    ) -> dict | None:
        """Get the link between image and tag in a project."""
        stmt = select(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id == shared_image_id,
            shared_image_tags.c.tag_id == tag_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_tags_for_image(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> list[dict]:
        """Get all tags for an image in a project."""
        stmt = (
            select(tags)
            .join(shared_image_tags, tags.c.id == shared_image_tags.c.tag_id)
            .where(
                shared_image_tags.c.project_id == project_id,
                shared_image_tags.c.shared_image_id == shared_image_id,
            )
            .order_by(tags.c.name)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_images_for_tag(
        connection: AsyncConnection,
        project_id: int,
        tag_id: UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        """Get all images with a specific tag in a project."""
        from sqlalchemy import func

        # Base query
        base_query = (
            select(shared_images)
            .join(shared_image_tags, shared_images.c.id == shared_image_tags.c.shared_image_id)
            .where(
                shared_image_tags.c.project_id == project_id,
                shared_image_tags.c.tag_id == tag_id,
            )
        )

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = (
            base_query.order_by(shared_images.c.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total

    # Rows per INSERT; 6 bind params per row keeps each statement far below
    # asyncpg's 32767-parameter limit.
    _BULK_INSERT_CHUNK = 2000

    @staticmethod
    async def bulk_add_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
        user_id: UUID | None = None,
    ) -> int:
        """Bulk add tags to multiple images in a project. Returns count of new links created.

        Set-based: one lookup for the tags' category ids, then one multi-row
        ``INSERT ... ON CONFLICT DO NOTHING`` per chunk. Unknown tag ids are
        skipped, and links that already exist are left untouched.
        """
        if not shared_image_ids or not tag_ids:
            return 0

        unique_tag_ids = list(dict.fromkeys(tag_ids))
        unique_image_ids = list(dict.fromkeys(shared_image_ids))

        category_stmt = select(tags.c.id, tags.c.category_id).where(tags.c.id.in_(unique_tag_ids))
        category_by_tag = {
            row.id: row.category_id for row in (await connection.execute(category_stmt)).fetchall()
        }

        rows = [
            {
                "project_id": project_id,
                "shared_image_id": image_id,
                "tag_id": tag_id,
                "category_id": category_by_tag[tag_id],
                "created_by": user_id,
            }
            for image_id in unique_image_ids
            for tag_id in unique_tag_ids
            if tag_id in category_by_tag
        ]
        if not rows:
            return 0

        created = 0
        chunk = SharedImageTagRepository._BULK_INSERT_CHUNK
        for start in range(0, len(rows), chunk):
            stmt = (
                pg_insert(shared_image_tags)
                .values(rows[start : start + chunk])
                .on_conflict_do_nothing(index_elements=["project_id", "shared_image_id", "tag_id"])
            )
            result = await connection.execute(stmt)
            created += result.rowcount
        return created

    @staticmethod
    async def bulk_remove_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: ImageScope,
        tag_ids: list[UUID],
    ) -> int:
        """Bulk remove tags from an image scope in a project. Returns count of links removed.

        One statement whatever the scope's size. A scope given as a ``Select`` needs no freezing:
        the whole delete happens in a single statement, which sees one snapshot, so the removal
        cannot change which images the scope matches half way through.
        """
        if not tag_ids:
            return 0
        if isinstance(shared_image_ids, Select):
            image_match = shared_image_tags.c.shared_image_id.in_(
                select(shared_image_ids.subquery().c.id)
            )
        else:
            if not shared_image_ids:
                return 0
            image_match = shared_image_tags.c.shared_image_id.in_(shared_image_ids)

        stmt = delete(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            image_match,
            shared_image_tags.c.tag_id.in_(tag_ids),
        )
        result = await connection.execute(stmt)
        return result.rowcount

    @staticmethod
    async def clear_image_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> int:
        """Remove all tags from an image in a project."""
        stmt = delete(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id == shared_image_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount

    # =========================================================================
    # Label Constraint Methods (1 tag per label per image)
    # =========================================================================

    @staticmethod
    async def _get_tag_category_info(
        connection: AsyncConnection,
        tag_id: UUID,
    ) -> dict | None:
        """Get tag info with category details for conflict detection."""
        stmt = (
            select(
                tags.c.id.label("tag_id"),
                tags.c.name.label("tag_name"),
                tags.c.category_id,
                tag_categories.c.name.label("category_name"),
                tag_categories.c.display_name.label("category_display_name"),
                tag_categories.c.is_uncategorized,
            )
            .join(tag_categories, tags.c.category_id == tag_categories.c.id)
            .where(tags.c.id == tag_id)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def check_label_conflict(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
    ) -> dict | None:
        """
        Check if adding this tag would violate the 1-tag-per-label rule.

        Returns conflict info if a conflict exists:
        {
            "existing_tag_id": UUID,
            "existing_tag_name": str,
            "category_id": UUID,
            "category_name": str,
            "is_uncategorized": bool
        }

        Returns None if no conflict (tag can be added).
        """
        # Get the tag's category info
        tag_info = await SharedImageTagRepository._get_tag_category_info(connection, tag_id)
        if not tag_info:
            return None  # Tag not found

        # Uncategorized tags are exempt from the 1-per-label rule
        if tag_info["is_uncategorized"]:
            return None

        category_id = tag_info["category_id"]

        # Check for existing tag from same category on this image
        conflict_stmt = (
            select(
                shared_image_tags.c.tag_id,
                tags.c.name.label("tag_name"),
            )
            .join(tags, shared_image_tags.c.tag_id == tags.c.id)
            .where(
                shared_image_tags.c.project_id == project_id,
                shared_image_tags.c.shared_image_id == shared_image_id,
                shared_image_tags.c.category_id == category_id,
                shared_image_tags.c.tag_id != tag_id,  # Exclude same tag
            )
        )
        result = await connection.execute(conflict_stmt)
        conflict_row = result.fetchone()

        if conflict_row:
            return {
                "existing_tag_id": conflict_row.tag_id,
                "existing_tag_name": conflict_row.tag_name,
                "category_id": category_id,
                "category_name": tag_info["category_display_name"] or tag_info["category_name"],
                "is_uncategorized": False,
            }

        return None

    @staticmethod
    async def add_tag_with_replacement(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
        user_id: UUID | None = None,
    ) -> tuple[dict | None, dict | None]:
        """
        Add a tag to an image, auto-replacing existing tag from same label.

        Returns:
            (new_tag_link, replaced_tag_info or None)

        replaced_tag_info contains the replaced tag details if a replacement occurred.
        """
        # Get tag's category info
        tag_info = await SharedImageTagRepository._get_tag_category_info(connection, tag_id)
        if not tag_info:
            return None, None

        category_id = tag_info["category_id"]
        is_uncategorized = tag_info["is_uncategorized"]

        replaced_tag_info = None

        # If not uncategorized, check for and remove existing tag from same category
        if not is_uncategorized:
            # Find existing tag from same category
            existing_stmt = (
                select(
                    shared_image_tags.c.id,
                    shared_image_tags.c.tag_id,
                    tags.c.name.label("tag_name"),
                )
                .join(tags, shared_image_tags.c.tag_id == tags.c.id)
                .where(
                    shared_image_tags.c.project_id == project_id,
                    shared_image_tags.c.shared_image_id == shared_image_id,
                    shared_image_tags.c.category_id == category_id,
                )
            )
            result = await connection.execute(existing_stmt)
            existing_row = result.fetchone()

            if existing_row and existing_row.tag_id != tag_id:
                # There's a different tag from same category - remove it
                replaced_tag_info = {
                    "tag_id": existing_row.tag_id,
                    "tag_name": existing_row.tag_name,
                    "category_id": category_id,
                    "category_name": tag_info["category_display_name"] or tag_info["category_name"],
                }
                delete_stmt = delete(shared_image_tags).where(
                    shared_image_tags.c.id == existing_row.id
                )
                await connection.execute(delete_stmt)
            elif existing_row and existing_row.tag_id == tag_id:
                # Same tag already exists - return existing
                existing_link = await SharedImageTagRepository.get_link(
                    connection, project_id, shared_image_id, tag_id
                )
                return existing_link, None

        # Add the new tag
        new_link = await SharedImageTagRepository.add_tag(
            connection, project_id, shared_image_id, tag_id, user_id, category_id
        )

        return new_link, replaced_tag_info

    # =========================================================================
    # Bulk operations over an image scope
    # =========================================================================

    @staticmethod
    @asynccontextmanager
    async def _frozen_scope(connection: AsyncConnection, scope: ImageScope):
        """Yield ``(in_operand, image_count)`` for a scope that will not move underneath the caller.

        A list of ids is already a snapshot and is used as given, deduplicated. A ``Select`` is copied once into a temp table dropped at commit, so the filter runs exactly once no matter how many statements follow and no matter how large the match set is; nothing about the scope crosses into Python except its size.
        """
        if not isinstance(scope, Select):
            ids = list(dict.fromkeys(scope))
            yield ids, len(ids)
            return

        frozen = Table(
            f"bulk_scope_{uuid4().hex}",
            MetaData(),
            Column("id", shared_images.c.id.type, primary_key=True),
            prefixes=["TEMPORARY"],
            postgresql_on_commit="DROP",
        )
        await connection.execute(CreateTable(frozen))
        copied = await connection.execute(insert(frozen).from_select(["id"], scope))
        yield select(frozen.c.id), copied.rowcount
        # Reached only when the body succeeded. A failure aborts the transaction, which drops the
        # table with it, and ``ON COMMIT DROP`` covers a transaction that lives on past this call.
        await connection.execute(DropTable(frozen))

    @staticmethod
    async def _tag_plan(
        connection: AsyncConnection, tag_ids: list[UUID]
    ) -> tuple[list, dict, dict]:
        """Resolve the requested tags into ``(applied, winner_by_label, label_name_by_label)``.

        ``applied`` are the requested tags that exist, in request order and deduplicated. ``winner_by_label`` is the tag that ends up on the image for each non-uncategorized label: the **last** requested tag of that label, which is the tag the old per-pair loop also left behind, since each iteration replaced whatever the previous one had just written. Uncategorized labels are exempt from the one-tag-per-label rule and appear in neither map.
        """
        unique_tag_ids = list(dict.fromkeys(tag_ids))
        if not unique_tag_ids:
            return [], {}, {}

        stmt = (
            select(
                tags.c.id,
                tags.c.category_id,
                tag_categories.c.name.label("category_name"),
                tag_categories.c.display_name.label("category_display_name"),
                tag_categories.c.is_uncategorized,
            )
            .join(tag_categories, tags.c.category_id == tag_categories.c.id)
            .where(tags.c.id.in_(unique_tag_ids))
        )
        by_id = {row.id: row for row in (await connection.execute(stmt)).fetchall()}

        applied = [by_id[tag_id] for tag_id in unique_tag_ids if tag_id in by_id]
        winners: dict[UUID, UUID] = {}
        labels: dict[UUID, str] = {}
        for row in applied:
            if row.is_uncategorized:
                continue
            winners[row.category_id] = row.id
            labels[row.category_id] = row.category_display_name or row.category_name
        return applied, winners, labels

    @staticmethod
    def _displaced_rows(project_id: int, in_operand, winners: dict[UUID, UUID]):
        """Predicate selecting the links the one-tag-per-label rule has to remove.

        For each label being written, that is every link on a target image carrying a *different* tag of the same label. Preview and application share this predicate, so the number the confirmation dialog shows is the number of rows the write actually deletes.
        """
        return and_(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id.in_(in_operand),
            or_(
                *[
                    and_(
                        shared_image_tags.c.category_id == category_id,
                        shared_image_tags.c.tag_id != winner,
                    )
                    for category_id, winner in winners.items()
                ]
            ),
        )

    @staticmethod
    async def bulk_add_tags_with_replacement(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: ImageScope,
        tag_ids: list[UUID],
        user_id: UUID | None = None,
    ) -> dict:
        """
        Bulk add tags to an image scope with automatic replacement.

        One ``DELETE`` removes every link the one-tag-per-label rule displaces, then one
        ``INSERT ... SELECT ... ON CONFLICT DO NOTHING`` per tag writes the new links. The
        statement count depends on the number of tags, never on the number of images.

        Returns stats:
        {
            "tags_added": int,
            "tags_replaced": int,
            "images_affected": int,
            "conflicts_by_label": dict[str, int],
        }

        ``tags_added`` counts the (image, tag) pairs present once the operation finishes, which is
        the number the previous per-pair loop reported: a pair that already existed is counted,
        because it is still a tag the request asked for and got. ``tags_replaced`` counts rows
        actually deleted, and ``conflicts_by_label`` breaks that down by label — unlike the old
        handler, which asked for the conflicts *after* applying the change and so always answered
        an empty map.
        """
        empty = {
            "tags_added": 0,
            "tags_replaced": 0,
            "images_affected": 0,
            "conflicts_by_label": {},
        }
        applied, winners, labels = await SharedImageTagRepository._tag_plan(connection, tag_ids)
        if not applied:
            return empty

        async with SharedImageTagRepository._frozen_scope(connection, shared_image_ids) as (
            in_operand,
            image_count,
        ):
            if not image_count:
                return empty

            conflicts_by_label: dict[str, int] = {}
            tags_replaced = 0
            if winners:
                removed = await connection.execute(
                    delete(shared_image_tags)
                    .where(
                        SharedImageTagRepository._displaced_rows(project_id, in_operand, winners)
                    )
                    .returning(shared_image_tags.c.category_id)
                )
                for row in removed.fetchall():
                    label = labels.get(row.category_id, "")
                    conflicts_by_label[label] = conflicts_by_label.get(label, 0) + 1
                    tags_replaced += 1

            for tag in applied:
                await connection.execute(
                    pg_insert(shared_image_tags)
                    .from_select(
                        ["project_id", "shared_image_id", "tag_id", "category_id", "created_by"],
                        SharedImageTagRepository._new_links(
                            project_id, in_operand, tag.id, tag.category_id, user_id
                        ),
                    )
                    .on_conflict_do_nothing(
                        index_elements=["project_id", "shared_image_id", "tag_id"]
                    )
                )

            return {
                "tags_added": image_count * len(applied),
                "tags_replaced": tags_replaced,
                "images_affected": image_count,
                "conflicts_by_label": conflicts_by_label,
            }

    @staticmethod
    def _new_links(
        project_id: int,
        in_operand,
        tag_id: UUID,
        category_id: UUID,
        user_id: UUID | None,
    ) -> Select:
        """The rows one tag contributes, as a ``SELECT`` over the frozen scope.

        Every column but the image id is a constant, typed from the target column so a ``NULL``
        ``created_by`` and a bare UUID both bind correctly.
        """
        columns = shared_image_tags.c
        if isinstance(in_operand, Select):
            picked = in_operand.subquery()
        else:
            picked = select(shared_images.c.id).where(shared_images.c.id.in_(in_operand)).subquery()
        return select(
            literal(project_id, type_=columns.project_id.type).label("project_id"),
            picked.c.id.label("shared_image_id"),
            literal(tag_id, type_=columns.tag_id.type).label("tag_id"),
            literal(category_id, type_=columns.category_id.type).label("category_id"),
            literal(user_id, type_=columns.created_by.type).label("created_by"),
        )

    @staticmethod
    async def get_bulk_tag_preview(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: ImageScope,
        tag_ids: list[UUID],
    ) -> dict:
        """
        Preview what would happen if bulk tags were added.

        Counts the same rows :meth:`bulk_add_tags_with_replacement` would delete, with the same
        predicate and in one grouped statement, so the dialog and the operation cannot disagree
        about how many tags a label loses.

        Returns:
        {
            "total_images": int,
            "total_tags_to_add": int,
            "tags_to_replace": int,
            "conflicts_by_label": {label_name: count}
        }
        """
        _, winners, labels = await SharedImageTagRepository._tag_plan(connection, tag_ids)

        async with SharedImageTagRepository._frozen_scope(connection, shared_image_ids) as (
            in_operand,
            image_count,
        ):
            conflicts_by_label: dict[str, int] = {}
            total_replacements = 0
            if winners and image_count:
                stmt = (
                    select(shared_image_tags.c.category_id, func.count().label("count"))
                    .where(
                        SharedImageTagRepository._displaced_rows(project_id, in_operand, winners)
                    )
                    .group_by(shared_image_tags.c.category_id)
                )
                for row in (await connection.execute(stmt)).fetchall():
                    label = labels.get(row.category_id, "")
                    conflicts_by_label[label] = conflicts_by_label.get(label, 0) + row.count
                    total_replacements += row.count

            return {
                "total_images": image_count,
                "total_tags_to_add": image_count * len(tag_ids),
                "tags_to_replace": total_replacements,
                "conflicts_by_label": conflicts_by_label,
            }
