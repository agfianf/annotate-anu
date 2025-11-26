import matplotlib.pyplot as plt
import numpy as np
import torch
from PIL import Image
from transformers import Sam3Model, Sam3Processor

device = "cuda" if torch.cuda.is_available() else "cpu"

model = Sam3Model.from_pretrained("facebook/sam3").to(device)
processor = Sam3Processor.from_pretrained("facebook/sam3")

# Load gambar
img = Image.open("assets/images/truck.jpg").convert("RGB")

# Proses input
inputs = processor(images=img, text="a white car", return_tensors="pt").to(device)

with torch.no_grad():
    outputs = model(**inputs)

# Post-process segmentation
results = processor.post_process_instance_segmentation(
    outputs,
    threshold=0.5,
    mask_threshold=0.5,
    target_sizes=inputs.get("original_sizes").tolist(),
)[0]

masks = results["masks"]  # tensor mask
boxes = results["boxes"]  # bounding boxes
scores = results["scores"]  # confidence

print("Found", len(masks), "masks")

if len(masks) > 0:
    mask0 = masks[0].cpu().numpy()
    # save or visualize mask0 as needed
    Image.fromarray((mask0 * 255).astype(np.uint8)).save("mask0.png")

# plt.imshow(img)
# plt.imshow(mask0, alpha=0.5, cmap="jet")
# plt.show()
