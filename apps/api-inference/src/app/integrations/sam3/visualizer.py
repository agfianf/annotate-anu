"""Visualization utilities for drawing masks and bounding boxes."""

import io

import matplotlib
import numpy as np
import torch
from PIL import Image, ImageDraw

from app.config import settings
from app.helpers.logger import logger
from app.integrations.sam3.mask_utils import masks_to_numpy


class Sam3Visualizer:
    """Utilities for visualizing SAM3 results."""

    @staticmethod
    def draw_masks_and_boxes(
        image: Image.Image,
        masks: torch.Tensor | np.ndarray,
        boxes: torch.Tensor | np.ndarray,
        scores: torch.Tensor | np.ndarray | None = None,
        alpha: float = 0.5,
        colormap: str = "rainbow",
        draw_boxes: bool = True,
        draw_masks: bool = True,
    ) -> Image.Image:
        """Draw masks and bounding boxes on image.

        Parameters
        ----------
        image : Image.Image
            Original PIL Image
        masks : torch.Tensor | np.ndarray
            Binary masks [N, H, W]; a uint8 array from ``masks_to_numpy`` avoids a second GPU copy
        boxes : torch.Tensor | np.ndarray
            Bounding boxes tensor [N, 4] in xyxy format
        scores : torch.Tensor | np.ndarray | None
            Confidence scores for each detection
        alpha : float
            Transparency for mask overlay (0.0 to 1.0)
        colormap : str
            Matplotlib colormap name
        draw_boxes : bool
            Whether to draw bounding boxes
        draw_masks : bool
            Whether to draw masks

        Returns
        -------
        Image.Image
            Image with visualizations drawn
        """
        masks_u8 = masks_to_numpy(masks)
        boxes = boxes.float().cpu().numpy() if isinstance(boxes, torch.Tensor) else np.asarray(boxes)

        if scores is not None:
            scores = scores.float().cpu().numpy() if isinstance(scores, torch.Tensor) else np.asarray(scores)

        n_objects = masks_u8.shape[0]

        if n_objects == 0:
            logger.warning("No objects to visualize")
            return image

        # Generate colors from colormap
        cmap = matplotlib.colormaps.get_cmap(colormap).resampled(n_objects)
        colors = [tuple(int(c * 255) for c in cmap(i)[:3]) for i in range(n_objects)]

        # Blend every mask into one RGB buffer, touching only the masked pixels. The
        # previous version allocated a full-size RGBA overlay and alpha-composited the
        # whole image once per object.
        canvas = np.array(image.convert("RGB"), dtype=np.uint8)
        if draw_masks:
            for mask, color in zip(masks_u8, colors):
                region = mask.astype(bool)
                if not region.any():
                    continue
                blended = canvas[region].astype(np.float32) * (1.0 - alpha) + np.array(color, dtype=np.float32) * alpha
                canvas[region] = blended.astype(np.uint8)

        result_image = Image.fromarray(canvas)

        # Draw bounding boxes
        if draw_boxes:
            draw = ImageDraw.Draw(result_image)

            for idx, (box, color) in enumerate(zip(boxes, colors)):
                x1, y1, x2, y2 = (float(v) for v in box)

                draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

                if scores is not None:
                    draw.text((x1, y1 - 15), f"{float(scores[idx]):.2f}", fill=color)

        logger.info(f"Visualization completed - Objects: {n_objects}")
        return result_image

    @staticmethod
    def encode_image_to_bytes(image: Image.Image, format: str = "PNG", quality: int = 95) -> bytes:
        """Encode PIL Image to bytes.

        Parameters
        ----------
        image : Image.Image
            PIL Image to encode
        format : str
            Image format (PNG or JPEG)
        quality : int
            JPEG quality (1-100)

        Returns
        -------
        bytes
            Encoded image bytes
        """
        buffer = io.BytesIO()

        if format.upper() == "JPEG":
            image.save(buffer, format="JPEG", quality=quality)
        else:
            image.save(buffer, format="PNG")

        return buffer.getvalue()

    @staticmethod
    def create_visualization(
        image: Image.Image,
        masks: torch.Tensor | np.ndarray,
        boxes: torch.Tensor | np.ndarray,
        scores: torch.Tensor | np.ndarray | None = None,
        alpha: float = 0.5,
        draw_boxes: bool = True,
        draw_masks: bool = True,
    ) -> bytes:
        """Create visualization and return as bytes.

        Parameters
        ----------
        image : Image.Image
            Original PIL Image
        masks : torch.Tensor | np.ndarray
            Binary masks [N, H, W]
        boxes : torch.Tensor | np.ndarray
            Bounding boxes [N, 4]
        scores : torch.Tensor | np.ndarray | None
            Confidence scores
        alpha : float
            Mask transparency
        draw_boxes : bool
            Whether to draw boxes
        draw_masks : bool
            Whether to draw masks

        Returns
        -------
        bytes
            Encoded visualization image
        """
        viz_image = Sam3Visualizer.draw_masks_and_boxes(
            image=image,
            masks=masks,
            boxes=boxes,
            scores=scores,
            alpha=alpha,
            draw_boxes=draw_boxes,
            draw_masks=draw_masks,
        )

        return Sam3Visualizer.encode_image_to_bytes(
            viz_image, format=settings.VISUALIZATION_FORMAT, quality=settings.VISUALIZATION_QUALITY
        )
