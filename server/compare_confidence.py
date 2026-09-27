from pathlib import Path
from PIL import Image, ImageOps
from server.model import _load_model
from server.image_preprocessing import preprocess_sonar_image
from server.model import _pil_to_bgr, _bgr_to_pil

image_path = Path("server/sonar_geotagged_test.jpg")

model = _load_model()

# Load original image
raw = Image.open(image_path)
original = ImageOps.exif_transpose(raw).convert("RGB")

# --------------------------------------------------
# 1. WITHOUT OpenCV
# --------------------------------------------------
result_without = model.predict(
    source=original,
    conf=0.25,
    iou=0.7,
    imgsz=640,
    augment=False,
    agnostic_nms=False,
    verbose=False,
)[0]

print("\n========== WITHOUT OPENCV ==========")

for box in result_without.boxes:
    cls_id = int(box.cls[0])
    label = result_without.names.get(cls_id, str(cls_id))
    confidence = float(box.conf[0])

    print(
        f"{label}: confidence={confidence:.4f} "
        f"({confidence * 100:.2f}%)"
    )

# --------------------------------------------------
# 2. WITH OpenCV
# --------------------------------------------------
original_bgr = _pil_to_bgr(original)
processed_bgr = preprocess_sonar_image(original_bgr)
processed = _bgr_to_pil(processed_bgr)

result_with = model.predict(
    source=processed,
    conf=0.25,
    iou=0.7,
    imgsz=640,
    augment=False,
    agnostic_nms=False,
    verbose=False,
)[0]

print("\n========== WITH OPENCV ==========")

for box in result_with.boxes:
    cls_id = int(box.cls[0])
    label = result_with.names.get(cls_id, str(cls_id))
    confidence = float(box.conf[0])

    print(
        f"{label}: confidence={confidence:.4f} "
        f"({confidence * 100:.2f}%)"
    )

# --------------------------------------------------
# Comparison
# --------------------------------------------------
print("\n========== COMPARISON ==========")

without = [
    (
        result_without.names.get(int(b.cls[0]), str(int(b.cls[0]))),
        float(b.conf[0]),
    )
    for b in result_without.boxes
]

with_cv = [
    (
        result_with.names.get(int(b.cls[0]), str(int(b.cls[0]))),
        float(b.conf[0]),
    )
    for b in result_with.boxes
]

for label_without, conf_without in without:
    matches = [
        conf
        for label, conf in with_cv
        if label == label_without
    ]

    if matches:
        conf_with = max(matches)
        difference = conf_with - conf_without
        percentage_change = (
            difference / conf_without * 100
            if conf_without
            else 0
        )

        print(
            f"{label_without}: "
            f"{conf_without:.4f} ? {conf_with:.4f} | "
            f"difference={difference:+.4f} | "
            f"change={percentage_change:+.2f}%"
        )
