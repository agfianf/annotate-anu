from ultralytics.models.sam import SAM3SemanticPredictor

# Initialize predictor with configuration
overrides = dict(
    conf=0.8,
    task="segment",
    mode="predict",
    model="apps/sam3.pt",
    half=True,  # Use FP16 for faster inference
    save=True,
)
predictor = SAM3SemanticPredictor(overrides=overrides)

# Set image once for multiple queries
predictor.set_image("/home/linux/Desktop/safety-training/src/assets/3.png")

# Query with multiple text prompts
results = predictor(text=["yellow coloured ear muffs wore on a person's head"])

# Works with descriptive phrases
# results = predictor(text=["person with red vest", "person with green vest","person wearing black striped shirt"])

# Query with a single concept
# results = predictor(text=["a person"])