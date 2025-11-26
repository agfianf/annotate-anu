"""
Utility functions for converting SAM3 masks to polygon coordinates.
"""

import cv2
import numpy as np
import torch


def mask_to_polygons(mask: torch.Tensor, simplify_tolerance: float = 1.5) -> list[list[list[float]]]:
    """
    Convert a binary mask tensor to polygon coordinates.

    Args:
        mask: Binary mask tensor of shape [H, W] with values 0.0 or 1.0
        simplify_tolerance: Epsilon parameter for polygon simplification (Douglas-Peucker algorithm)
                          Higher values = simpler polygons with fewer points

    Returns:
        List of polygons, where each polygon is a list of [x, y] coordinate pairs.
        Multiple polygons may exist if the mask has disconnected regions or holes.
        Format: [[[x1, y1], [x2, y2], ...], [[x1, y1], ...], ...]
    """
    # Convert tensor to numpy array
    mask_np = mask.cpu().numpy()

    # Convert to uint8 (0 or 255)
    mask_uint8 = (mask_np * 255).astype(np.uint8)

    # Find contours using OpenCV
    # RETR_TREE gets all contours including holes
    # CHAIN_APPROX_SIMPLE compresses horizontal, vertical, and diagonal segments
    contours, hierarchy = cv2.findContours(mask_uint8, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    polygons = []

    for contour in contours:
        # Skip very small contours (likely noise)
        if len(contour) < 3:
            continue

        # Simplify the polygon to reduce number of points
        epsilon = simplify_tolerance
        simplified = cv2.approxPolyDP(contour, epsilon, closed=True)

        # Convert from OpenCV format [[x, y]] to list of [x, y] pairs
        # OpenCV contours are shape (N, 1, 2), we want (N, 2)
        polygon = simplified.squeeze().tolist()

        # Ensure it's a list of lists (handle single point edge case)
        if isinstance(polygon[0], (int, float)):
            polygon = [polygon]

        # Only keep polygons with at least 3 points
        if len(polygon) >= 3:
            polygons.append(polygon)

    return polygons


def calculate_mask_area(mask: torch.Tensor) -> float:
    """
    Calculate the total pixel area of a binary mask.

    Args:
        mask: Binary mask tensor of shape [H, W] with values 0.0 or 1.0

    Returns:
        Total number of pixels with value 1.0
    """
    return float(mask.sum().item())


def masks_to_polygon_data(masks: torch.Tensor, simplify_tolerance: float = 1.5) -> list[dict]:
    """
    Convert multiple masks to polygon data structures.

    Args:
        masks: Tensor of binary masks with shape [N, H, W]
        simplify_tolerance: Epsilon parameter for polygon simplification

    Returns:
        List of dictionaries with polygon and area data for each mask
        Format: [{"polygons": [...], "area": 1234.0}, ...]
    """
    polygon_data = []

    for i in range(masks.shape[0]):
        mask = masks[i]
        polygons = mask_to_polygons(mask, simplify_tolerance)
        area = calculate_mask_area(mask)

        polygon_data.append({"polygons": polygons, "area": area})

    return polygon_data
