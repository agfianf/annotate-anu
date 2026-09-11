"""
Utility functions for converting SAM3 masks to polygon coordinates.

The post-processed masks come back from transformers as an int64 [N, H, W] tensor on
the model device. Everything here works on a single uint8 copy of that stack so the
device->host transfer happens once (1 byte/pixel instead of 8) and no per-mask
GPU syncs are needed.
"""

import cv2
import numpy as np
import torch


def masks_to_numpy(masks: torch.Tensor | np.ndarray) -> np.ndarray:
    """Return masks as a contiguous uint8 array of shape [N, H, W] with values 0 or 255.

    Args:
        masks: Binary mask tensor/array of shape [N, H, W]; any numeric dtype, non-zero = foreground

    Returns:
        uint8 numpy array, one device->host copy for the whole stack
    """
    if isinstance(masks, torch.Tensor):
        if masks.ndim == 2:
            masks = masks.unsqueeze(0)
        if masks.numel() == 0:
            return np.zeros(tuple(masks.shape), dtype=np.uint8)
        return (masks > 0).to(torch.uint8).mul_(255).cpu().numpy()

    arr = np.asarray(masks)
    if arr.ndim == 2:
        arr = arr[None]
    if arr.dtype != np.uint8 or arr.max(initial=0) not in (0, 255):
        arr = np.where(arr > 0, 255, 0).astype(np.uint8)
    return np.ascontiguousarray(arr)


def mask_to_polygons(mask: np.ndarray, simplify_tolerance: float = 1.5) -> list[list[list[int]]]:
    """
    Convert a single binary mask to polygon coordinates.

    Args:
        mask: uint8 array of shape [H, W] with values 0 or 255
        simplify_tolerance: Epsilon parameter for polygon simplification (Douglas-Peucker algorithm)
                          Higher values = simpler polygons with fewer points

    Returns:
        List of polygons, where each polygon is a list of [x, y] coordinate pairs.
        Multiple polygons may exist if the mask has disconnected regions or holes.
        Format: [[[x1, y1], [x2, y2], ...], [[x1, y1], ...], ...]
    """
    # RETR_CCOMP returns every outer boundary and every hole, which is all the
    # caller uses; RETR_TREE additionally builds a full nesting hierarchy that was
    # thrown away. CHAIN_APPROX_SIMPLE compresses straight runs.
    contours, _ = cv2.findContours(np.ascontiguousarray(mask), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

    polygons = []

    for contour in contours:
        # Skip very small contours (likely noise)
        if len(contour) < 3:
            continue

        simplified = cv2.approxPolyDP(contour, simplify_tolerance, closed=True)

        # OpenCV contours are shape (N, 1, 2); we want (N, 2)
        polygon = simplified.reshape(-1, 2).tolist()

        # Only keep polygons with at least 3 points
        if len(polygon) >= 3:
            polygons.append(polygon)

    return polygons


def masks_to_polygon_data(masks: torch.Tensor | np.ndarray, simplify_tolerance: float = 1.5) -> list[dict]:
    """
    Convert multiple masks to polygon data structures.

    Args:
        masks: Binary masks with shape [N, H, W] (tensor on any device, or a uint8 array from masks_to_numpy)
        simplify_tolerance: Epsilon parameter for polygon simplification

    Returns:
        List of dictionaries with polygon and area data for each mask
        Format: [{"polygons": [...], "area": 1234.0}, ...]
    """
    masks_u8 = masks_to_numpy(masks)
    if masks_u8.shape[0] == 0:
        return []

    # One vectorised pass for every area instead of a GPU reduction + sync per mask
    areas = np.count_nonzero(masks_u8.reshape(masks_u8.shape[0], -1), axis=1)

    return [
        {"polygons": mask_to_polygons(masks_u8[i], simplify_tolerance), "area": float(areas[i])}
        for i in range(masks_u8.shape[0])
    ]
