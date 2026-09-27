from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import desc, select

from .auth import auth_required, current_user, require_csrf
from .models import Detection

detection_bp = Blueprint("detections", __name__, url_prefix="/api/detections")


def parse_dt(value: str | None, field: str, default_now: bool = True) -> datetime:
    if not value:
        if default_now:
            return datetime.now(timezone.utc)
        raise ValueError(f"{field} is required.")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be ISO-8601.") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def serialize_detection(d: Detection) -> dict:
    return {
        "id": d.detection_id,
        "imageId": d.image_id,
        "imageFilename": d.image_filename,
        "className": d.class_name,
        "rawLabel": d.raw_label,
        "confidence": d.confidence,
        "boundingBox": d.bounding_box,
        "predictions": d.predictions,
        "gps": d.gps,
        "estimatedSize": d.estimated_size,
        "estimatedWeight": d.estimated_weight,
        "riskLevel": d.risk_level,
        "riskScore": d.risk_score,
        "priority": d.priority,
        "responseDeadline": d.response_deadline.isoformat(),
        "department": d.department,
        "recommendedEquipment": d.recommended_equipment,
        "removalMethod": d.removal_method,
        "verificationStatus": d.verification_status,
        "notes": d.notes,
        "detectionTime": d.detection_time.isoformat(),
        "createdAt": d.created_at.isoformat(),
        "updatedAt": d.updated_at.isoformat(),
        "aiPrediction": d.ai_prediction,
        "estimated": d.estimated,
        "recommended": d.recommended,
        "manualVerificationRequired": d.manual_verification_required,
        "source": "upload",
        "isRealModel": d.is_real_model,
        "inferenceDetails": d.inference_details,
    }


def validate_payload(payload: dict) -> dict:
    required = [
        "id",
        "imageId",
        "className",
        "confidence",
        "boundingBox",
        "gps",
        "estimatedSize",
        "estimatedWeight",
        "riskLevel",
        "riskScore",
        "priority",
        "responseDeadline",
        "department",
        "recommendedEquipment",
        "removalMethod",
        "verificationStatus",
        "notes",
        "detectionTime",
    ]
    missing = [key for key in required if key not in payload]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    confidence = float(payload["confidence"])
    if not 0 <= confidence <= 1:
        raise ValueError("confidence must be between 0 and 1.")

    risk_score = float(payload["riskScore"])
    if not 0 <= risk_score <= 100:
        raise ValueError("riskScore must be between 0 and 100.")

    gps = payload["gps"]
    if not isinstance(gps, dict):
        raise ValueError("gps must be an object.")

    lat = float(gps["latitude"])
    lng = float(gps["longitude"])
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        raise ValueError("Invalid GPS coordinates.")

    return {
        "detection_id": str(payload["id"]),
        "image_id": str(payload["imageId"]),
        "image_filename": str(payload.get("imageFilename") or payload["imageId"]),
        "image_storage_key": payload.get("imageStorageKey"),
        "class_name": str(payload["className"]),
        "raw_label": payload.get("rawLabel"),
        "confidence": confidence,
        "bounding_box": payload["boundingBox"],
        "predictions": payload.get("predictions", []),
        "gps": payload["gps"],
        "estimated_size": payload["estimatedSize"],
        "estimated_weight": payload["estimatedWeight"],
        "risk_level": str(payload["riskLevel"]),
        "risk_score": risk_score,
        "priority": int(payload["priority"]),
        "response_deadline": parse_dt(payload["responseDeadline"], "responseDeadline", False),
        "department": str(payload["department"]),
        "recommended_equipment": payload.get("recommendedEquipment", []),
        "removal_method": str(payload["removalMethod"]),
        "verification_status": str(payload["verificationStatus"]),
        "notes": str(payload.get("notes", "")),
        "detection_time": parse_dt(payload["detectionTime"], "detectionTime"),
        "ai_prediction": bool(payload.get("aiPrediction", True)),
        "estimated": bool(payload.get("estimated", True)),
        "recommended": bool(payload.get("recommended", True)),
        "manual_verification_required": bool(payload.get("manualVerificationRequired", False)),
        "is_real_model": bool(payload.get("isRealModel", True)),
        "inference_details": payload.get("inferenceDetails"),
    }


@detection_bp.post("")
@auth_required
def create_detection():
    csrf_error = require_csrf()
    if csrf_error:
        return csrf_error

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    try:
        data = validate_payload(payload)
    except (KeyError, TypeError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    from flask import g

    db = g.db
    user = current_user()

    existing = db.scalar(
        select(Detection).where(
            Detection.detection_id == data["detection_id"],
            Detection.user_id == user.id,
        )
    )
    if existing:
        return jsonify({"detection": serialize_detection(existing), "created": False}), 200

    data["department"] = user.department
    detection = Detection(user_id=user.id, **data)
    db.add(detection)
    db.commit()
    db.refresh(detection)

    return jsonify({"detection": serialize_detection(detection), "created": True}), 201


@detection_bp.get("")
@auth_required
def list_detections():
    from flask import g

    user = current_user()
    db = g.db

    limit = request.args.get("limit", 100, type=int)
    limit = max(1, min(limit, 500))

    stmt = (
        select(Detection)
        .where(Detection.user_id == user.id)
        .order_by(desc(Detection.created_at))
        .limit(limit)
    )
    rows = db.scalars(stmt).all()

    return jsonify({"detections": [serialize_detection(d) for d in rows]})


@detection_bp.get("/<detection_id>")
@auth_required
def get_detection(detection_id: str):
    from flask import g

    user = current_user()
    db = g.db

    detection = db.scalar(
        select(Detection).where(
            Detection.detection_id == detection_id,
            Detection.user_id == user.id,
        )
    )
    if not detection:
        return jsonify({"error": "Detection not found."}), 404

    return jsonify({"detection": serialize_detection(detection)})


@detection_bp.delete("/<detection_id>")
@auth_required
def delete_detection(detection_id: str):
    csrf_error = require_csrf()
    if csrf_error:
        return csrf_error

    from flask import g

    user = current_user()
    db = g.db

    detection = db.scalar(
        select(Detection).where(
            Detection.detection_id == detection_id,
            Detection.user_id == user.id,
        )
    )
    if not detection:
        return jsonify({"error": "Detection not found."}), 404

    db.delete(detection)
    db.commit()
    return jsonify({"ok": True})
