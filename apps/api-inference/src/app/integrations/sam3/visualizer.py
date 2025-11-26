"""Visualization utilities for drawing masks and bounding boxes."""

import io

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image, ImageDraw

from app.config import settings
from app.helpers.logger import logger


class Sam3Visualizer:
    """Utilities for visualizing SAM3 results."""

    @staticmethod
    def draw_masks_and_boxes(
        image: Image.Image,
        masks: torch.Tensor,
        boxes: torch.Tensor,
        scores: torch.Tensor | None = None,
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
        masks : torch.Tensor
            Binary masks tensor [N, H, W]
        boxes : torch.Tensor
            Bounding boxes tensor [N, 4] in xyxy format
        scores : torch.Tensor | None
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
        # Convert image to RGBA for overlay
        image_rgba = image.convert("RGBA")
        width, height = image.size

        # Ensure masks are on CPU and convert to numpy
        masks = masks.cpu().numpy() if isinstance(masks, torch.Tensor) else masks
        boxes = boxes.cpu().numpy() if isinstance(boxes, torch.Tensor) else boxes

        if scores is not None:
            scores = scores.cpu().numpy() if isinstance(scores, torch.Tensor) else scores

        n_objects = masks.shape[0]

        if n_objects == 0:
            logger.warning("No objects to visualize")
            return image

        # Generate colors from colormap
        cmap = matplotlib.colormaps.get_cmap(colormap).resampled(n_objects)
        colors = [tuple(int(c * 255) for c in cmap(i)[:3]) for i in range(n_objects)]

        # Draw masks
        if draw_masks:
            for idx, (mask, color) in enumerate(zip(masks, colors)):
                # Convert mask to uint8
                mask_uint8 = (mask * 255).astype(np.uint8)
                mask_image = Image.fromarray(mask_uint8)

                # Create colored overlay
                overlay = Image.new("RGBA", image_rgba.size, color + (0,))
                alpha_channel = mask_image.point(lambda v: int(v * alpha))
                overlay.putalpha(alpha_channel)

                # Composite onto image
                image_rgba = Image.alpha_composite(image_rgba, overlay)

        # Draw bounding boxes
        if draw_boxes:
            draw = ImageDraw.Draw(image_rgba)

            for idx, (box, color) in enumerate(zip(boxes, colors)):
                x1, y1, x2, y2 = box.tolist()

                # Draw rectangle
                draw.rectangle([x1, y1, x2, y2], outline=color + (255,), width=3)

                # Draw score if available
                if scores is not None:
                    score_text = f"{scores[idx]:.2f}"
                    draw.text((x1, y1 - 15), score_text, fill=color + (255,))

        # Convert back to RGB
        result_image = image_rgba.convert("RGB")

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

        buffer.seek(0)
        return buffer.read()

    @staticmethod
    def create_visualization(
        image: Image.Image,
        masks: torch.Tensor,
        boxes: torch.Tensor,
        scores: torch.Tensor | None = None,
        alpha: float = 0.5,
        draw_boxes: bool = True,
        draw_masks: bool = True,
    ) -> bytes:
        """Create visualization and return as bytes.

        Parameters
        ----------
        image : Image.Image
            Original PIL Image
        masks : torch.Tensor
            Binary masks tensor [N, H, W]
        boxes : torch.Tensor
            Bounding boxes tensor [N, 4]
        scores : torch.Tensor | None
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
        # Draw visualizations
        viz_image = Sam3Visualizer.draw_masks_and_boxes(
            image=image,
            masks=masks,
            boxes=boxes,
            scores=scores,
            alpha=alpha,
            draw_boxes=draw_boxes,
            draw_masks=draw_masks,
        )

        # Encode to bytes
        image_bytes = Sam3Visualizer.encode_image_to_bytes(
            viz_image, format=settings.VISUALIZATION_FORMAT, quality=settings.VISUALIZATION_QUALITY
        )

        return image_bytes
