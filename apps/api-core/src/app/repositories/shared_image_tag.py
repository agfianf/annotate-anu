"""Repository layer for SharedImageTag (junction) data access - project-scoped."""

from uuid import UUID

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import shared_image_tags, shared_images, tags, tag_categories


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
            tag_info = await SharedImageTagRepository._get_tag_category_info(
                connection, tag_id
            )
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
            base_query
            .order_by(shared_images.c.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total

    @staticmethod
    async def bulk_add_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
        user_id: UUID | None = None,
    ) -> int:
        """Bulk add tags to multiple images in a project. Returns count of new links created."""
        count = 0
        for image_id in shared_image_ids:
            for tag_id in tag_ids:
                result = await SharedImageTagRepository.add_tag(
                    connection, project_id, image_id, tag_id, user_id
                )
                if result:
                    count += 1
        return count

    @staticmethod
    async def bulk_remove_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
    ) -> int:
        """Bulk remove tags from multiple images in a project. Returns count of links removed."""
        count = 0
        for image_id in shared_image_ids:
            for tag_id in tag_ids:
                removed = await SharedImageTagRepository.remove_tag(
                    connection, project_id, image_id, tag_id
                )
                if removed:
                    count += 1
        return count

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
        tag_info = await SharedImageTagRepository._get_tag_category_info(
            connection, tag_id
        )
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
        tag_info = await SharedImageTagRepository._get_tag_category_info(
            connection, tag_id
        )
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

    @staticmethod
    async def bulk_check_label_conflicts(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
    ) -> dict[str, list[dict]]:
        """
        Check for conflicts across multiple images and tags.

        Returns a dict mapping image_id (str) -> list of conflict info dicts.
        Each conflict dict contains:
        {
            "new_tag_id": UUID,
            "new_tag_name": str,
            "existing_tag_id": UUID,
            "existing_tag_name": str,
            "category_id": UUID,
            "category_name": str
        }
        """
        conflicts: dict[str, list[dict]] = {}

        # Pre-fetch tag info for all tags
        tag_info_cache: dict[UUID, dict] = {}
        for tag_id in tag_ids:
            info = await SharedImageTagRepository._get_tag_category_info(
                connection, tag_id
            )
            if info:
                tag_info_cache[tag_id] = info

        for image_id in shared_image_ids:
            image_conflicts = []

            for tag_id in tag_ids:
                tag_info = tag_info_cache.get(tag_id)
                if not tag_info or tag_info["is_uncategorized"]:
                    continue  # Skip if tag not found or uncategorized

                conflict = await SharedImageTagRepository.check_label_conflict(
                    connection, project_id, image_id, tag_id
                )
                if conflict:
                    conflict["new_tag_id"] = tag_id
                    conflict["new_tag_name"] = tag_info["tag_name"]
                    image_conflicts.append(conflict)

            if image_conflicts:
                conflicts[str(image_id)] = image_conflicts

        return conflicts

    @staticmethod
    async def bulk_add_tags_with_replacement(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
        user_id: UUID | None = None,
    ) -> dict:
        """
        Bulk add tags to multiple images with automatic replacement.

        Returns stats:
        {
            "tags_added": int,
            "tags_replaced": int,
            "images_affected": int
        }
        """
        tags_added = 0
        tags_replaced = 0
        images_affected = set()

        for image_id in shared_image_ids:
            for tag_id in tag_ids:
                new_link, replaced = await SharedImageTagRepository.add_tag_with_replacement(
                    connection, project_id, image_id, tag_id, user_id
                )
                if new_link:
                    tags_added += 1
                    images_affected.add(image_id)
                if replaced:
                    tags_replaced += 1

        return {
            "tags_added": tags_added,
            "tags_replaced": tags_replaced,
            "images_affected": len(images_affected),
        }

    @staticmethod
    async def get_bulk_tag_preview(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
    ) -> dict:
        """
        Preview what would happen if bulk tags were added.

        Returns:
        {
            "total_images": int,
            "total_tags_to_add": int,
            "tags_to_replace": int,
            "conflicts_by_label": {label_name: count}
        }
        """
        conflicts = await SharedImageTagRepository.bulk_check_label_conflicts(
            connection, project_id, shared_image_ids, tag_ids
        )

        # Count conflicts by label
        conflicts_by_label: dict[str, int] = {}
        total_replacements = 0

        for image_conflicts in conflicts.values():
            for conflict in image_conflicts:
                label_name = conflict["category_name"]
                conflicts_by_label[label_name] = conflicts_by_label.get(label_name, 0) + 1
                total_replacements += 1

        return {
            "total_images": len(shared_image_ids),
            "total_tags_to_add": len(shared_image_ids) * len(tag_ids),
            "tags_to_replace": total_replacements,
            "conflicts_by_label": conflicts_by_label,
        }
