"""Moondream API router.

Provides endpoints for Moondream-specific inference operations:
- /detect: Zero-shot object detection
- /segment: Object segmentation (SVG path)
- /query: Visual question answering
- /caption: Image captioning
- /point: Object center point detection
- /auto-tag: Automatic image tagging
- /ocr: Text extraction
"""

from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.helpers.response_api import JsonResponse
from app.services.moondream_proxy import MoondreamProxyService

router = APIRouter(prefix="/moondream", tags=["moondream"])

# Initialize the proxy service
moondream_service = MoondreamProxyService()


# Response data schemas
class MoondreamObject(BaseModel):
    """Detected object bounding box."""

    x_min: float = Field(..., description="Left coordinate (normalized 0-1)")
    y_min: float = Field(..., description="Top coordinate (normalized 0-1)")
    x_max: float = Field(..., description="Right coordinate (normalized 0-1)")
    y_max: float = Field(..., description="Bottom coordinate (normalized 0-1)")


class MoondreamPoint(BaseModel):
    """Object center point."""

    x: float = Field(..., description="X coordinate (normalized 0-1)")
    y: float = Field(..., description="Y coordinate (normalized 0-1)")


class MoondreamBbox(BaseModel):
    """Bounding box for segmentation."""

    x_min: float = Field(..., description="Left coordinate (normalized 0-1)")
    y_min: float = Field(..., description="Top coordinate (normalized 0-1)")
    x_max: float = Field(..., description="Right coordinate (normalized 0-1)")
    y_max: float = Field(..., description="Bottom coordinate (normalized 0-1)")


class DetectData(BaseModel):
    """Detection result data."""

    objects: list[MoondreamObject] = Field(..., description="Detected objects")


class SegmentData(BaseModel):
    """Segmentation result data."""

    path: str = Field(..., description="SVG path data for the segmentation mask")
    bbox: MoondreamBbox = Field(..., description="Bounding box of the segmented object")


class QueryData(BaseModel):
    """Query result data."""

    answer: str = Field(..., description="Answer to the query")


class CaptionData(BaseModel):
    """Caption result data."""

    caption: str = Field(..., description="Generated caption")


class PointData(BaseModel):
    """Point detection result data."""

    points: list[MoondreamPoint] = Field(..., description="Center points of detected objects")


class ConnectionTestData(BaseModel):
    """Connection test result data."""

    success: bool = Field(..., description="Whether the connection was successful")
    message: str = Field(..., description="Status message")
    model_info: str | None = Field(None, description="Model information if available")
    latency_ms: float | None = Field(None, description="Latency in milliseconds")


@router.post("/detect", response_model=JsonResponse[DetectData, None])
async def detect_objects(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    object_name: Annotated[str, Form(description="Name of the object to detect")],
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[DetectData, None]:
    """Detect objects in an image using Moondream.

    Returns bounding boxes for all detected instances of the specified object.
    Coordinates are normalized (0-1).
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    result = await moondream_service.detect(
        image_bytes=image_bytes,
        image_content_type=content_type,
        object_name=object_name,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=DetectData(
            objects=[MoondreamObject(**obj) for obj in result.objects]
        ),
        message="Detection completed successfully",
        success=True,
        status_code=200,
    )


@router.post("/segment", response_model=JsonResponse[SegmentData, None])
async def segment_object(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    object_name: Annotated[str, Form(description="Name of the object to segment")],
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[SegmentData, None]:
    """Segment an object in an image using Moondream.

    Returns an SVG path that outlines the object and its bounding box.
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    result = await moondream_service.segment(
        image_bytes=image_bytes,
        image_content_type=content_type,
        object_name=object_name,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=SegmentData(
            path=result.path,
            bbox=MoondreamBbox(**result.bbox) if result.bbox else MoondreamBbox(
                x_min=0, y_min=0, x_max=0, y_max=0
            ),
        ),
        message="Segmentation completed successfully",
        success=True,
        status_code=200,
    )


@router.post("/query", response_model=JsonResponse[QueryData, None])
async def query_image(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    question: Annotated[str, Form(description="Question to ask about the image")],
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[QueryData, None]:
    """Query an image with a natural language question (VQA).

    Moondream will analyze the image and return an answer to your question.
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    result = await moondream_service.query(
        image_bytes=image_bytes,
        image_content_type=content_type,
        question=question,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=QueryData(answer=result.answer),
        message="Query completed successfully",
        success=True,
        status_code=200,
    )


@router.post("/caption", response_model=JsonResponse[CaptionData, None])
async def caption_image(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    length: Annotated[
        Literal["short", "long"], Form(description="Caption length")
    ] = "short",
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[CaptionData, None]:
    """Generate a caption for an image.

    Returns a natural language description of the image contents.
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    result = await moondream_service.caption(
        image_bytes=image_bytes,
        image_content_type=content_type,
        length=length,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=CaptionData(caption=result.caption),
        message="Caption generated successfully",
        success=True,
        status_code=200,
    )


@router.post("/point", response_model=JsonResponse[PointData, None])
async def point_objects(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    object_name: Annotated[str, Form(description="Name of the object to locate")],
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[PointData, None]:
    """Get center points for objects in an image.

    Returns the center coordinates for all detected instances of the specified object.
    Coordinates are normalized (0-1).
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    result = await moondream_service.point(
        image_bytes=image_bytes,
        image_content_type=content_type,
        object_name=object_name,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=PointData(
            points=[MoondreamPoint(**pt) for pt in result.points]
        ),
        message="Point detection completed successfully",
        success=True,
        status_code=200,
    )


@router.post("/auto-tag", response_model=JsonResponse[list[str], None])
async def auto_tag_image(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[list[str], None]:
    """Automatically generate tags for an image.

    Uses Moondream's query capability to extract objects, features,
    and characteristics from the image.
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    tags = await moondream_service.auto_tag(
        image_bytes=image_bytes,
        image_content_type=content_type,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=tags,
        message="Auto-tagging completed successfully",
        success=True,
        status_code=200,
    )


@router.post("/ocr", response_model=JsonResponse[str, None])
async def extract_text(
    image: Annotated[UploadFile, File(description="Image file to analyze")],
    mode: Annotated[
        Literal["all", "reading", "table"], Form(description="OCR mode")
    ] = "all",
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[str, None]:
    """Extract text from an image (OCR).

    Modes:
    - all: Extract all visible text
    - reading: Extract text in natural reading order
    - table: Extract table content preserving structure
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"

    text = await moondream_service.ocr(
        image_bytes=image_bytes,
        image_content_type=content_type,
        mode=mode,
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=text,
        message="OCR completed successfully",
        success=True,
        status_code=200,
    )


@router.post("/test-connection", response_model=JsonResponse[ConnectionTestData, None])
async def test_connection(
    base_url: Annotated[
        str, Form(description="Moondream API base URL")
    ] = "https://api.moondream.ai/v1",
    api_key: Annotated[str | None, Form(description="API key for authentication")] = None,
) -> JsonResponse[ConnectionTestData, None]:
    """Test connection to Moondream API.

    Verifies that the provided credentials and URL are valid.
    """
    result = await moondream_service.test_connection(
        base_url=base_url,
        api_key=api_key,
    )

    return JsonResponse(
        data=ConnectionTestData(
            success=result["success"],
            message=result["message"],
            model_info=result.get("model_info"),
            latency_ms=result.get("latency_ms"),
        ),
        message="Connection test completed",
        success=True,
        status_code=200,
    )
