"""
Empirical Verification Test Suite: Cosine Separation Boundary & Numerical Stability.

Tests OpenCV Zoo YuNet detection and SFace 128D embeddings on real datasets:
- giang: 5 photos (10 same-person pairs)
- phuc: 7 photos (21 same-person pairs)
- Cross-person: 35 pairs (giang vs phuc)

Checks:
1. 128-dimensional float32 embeddings
2. L2 norm == 1.0 (within 1e-5 tolerance)
3. Same-person pairs >= 0.363 (target >= 0.40)
4. Cross-person pairs < 0.363 (FAR = 0%)
5. Separation margin = min(same) - max(cross) > 0
6. Invariance under mirror flip, illumination scaling, and numerical edge cases.
"""

import glob
import json
import os
import sys
from itertools import combinations
from pathlib import Path

import cv2
import numpy as np
import pytest

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.face_service import FaceRecognitionService, get_or_create_face_service
from app.services.model_loader import ensure_models_available


def get_dataset_images(person: str) -> list[str]:
    candidates = [
        PROJECT_ROOT.parent / person,
        Path(r"c:\Users\Dell\Downloads\nckh\NCKH(ke thua tu TTCS)") / person,
        Path(r"c:\Users\Dell\Downloads\nckh") / person,
    ]
    for c in candidates:
        if c.is_dir():
            files = sorted(glob.glob(str(c / "*.jpg")) + glob.glob(str(c / "*.png")))
            if files:
                return files
    raise FileNotFoundError(f"Dataset for {person} not found in {candidates}")


@pytest.fixture(scope="module")
def face_svc():
    ensure_models_available()
    svc = get_or_create_face_service()
    return svc


@pytest.fixture(scope="module")
def giang_images():
    return get_dataset_images("giang")


@pytest.fixture(scope="module")
def phuc_images():
    return get_dataset_images("phuc")


class TestEmpiricalCosineSeparation:
    """Rigorous empirical tests on real images."""

    def test_01_all_dataset_images_detected(self, face_svc: FaceRecognitionService, giang_images, phuc_images):
        """Verify 100% detection rate on all 12 sample images."""
        all_imgs = [("giang", p) for p in giang_images] + [("phuc", p) for p in phuc_images]
        assert len(giang_images) == 5, f"Expected 5 giang images, got {len(giang_images)}"
        assert len(phuc_images) == 7, f"Expected 7 phuc images, got {len(phuc_images)}"

        detection_results = []
        for person, path in all_imgs:
            img = cv2.imread(path)
            assert img is not None, f"Failed to read {path}"
            faces = face_svc.detect_faces(img)
            assert len(faces) >= 1, f"No face detected in {person} image: {os.path.basename(path)}"
            best_face = faces[0]
            x, y, w, h, score, _ = best_face
            assert score >= 0.6, f"Detection score too low: {score:.4f} for {path}"
            detection_results.append({
                "person": person,
                "file": os.path.basename(path),
                "bbox": [x, y, w, h],
                "score": float(score),
            })
        print(f"\n[OK] 100% face detection achieved ({len(detection_results)}/12 images)")

    def test_02_embedding_dimensions_and_l2_norm(self, face_svc: FaceRecognitionService, giang_images, phuc_images):
        """Verify every embedding has dimension == 128, float32 dtype, and L2 norm == 1.0 (tol 1e-5)."""
        all_imgs = giang_images + phuc_images
        for path in all_imgs:
            img = cv2.imread(path)
            faces = face_svc.detect_faces(img)
            emb = face_svc.extract_embedding(img, faces[0][5])
            
            # 1. Dimension check
            assert emb.shape == (128,), f"Shape must be (128,), got {emb.shape} for {path}"
            assert emb.dtype == np.float32, f"Dtype must be float32, got {emb.dtype} for {path}"
            
            # 2. L2 norm check
            norm = float(np.linalg.norm(emb))
            diff = abs(norm - 1.0)
            assert diff <= 1e-5, f"Embedding L2 norm != 1.0 (norm={norm:.8f}, diff={diff}) for {path}"

    def test_03_same_person_separation_giang(self, face_svc: FaceRecognitionService, giang_images):
        """Verify all 10 same-person pairs of giang have similarity >= 0.363 (target >= 0.40)."""
        embs = []
        for path in giang_images:
            img = cv2.imread(path)
            faces = face_svc.detect_faces(img)
            embs.append(face_svc.extract_embedding(img, faces[0][5]))

        sims = []
        for (i, e1), (j, e2) in combinations(enumerate(embs), 2):
            sim = face_svc.compute_similarity(e1, e2)
            sim_dot = float(np.dot(e1, e2))
            assert abs(sim - sim_dot) < 1e-4, f"Mismatch between OpenCV match ({sim}) and dot product ({sim_dot})"
            sims.append(sim)
            assert sim >= 0.363, f"Giang pair ({i}, {j}) failed threshold: {sim:.4f} < 0.363"

        min_sim, max_sim, mean_sim = min(sims), max(sims), float(np.mean(sims))
        print(f"\n[Giang Intra-Class (10 pairs)] min={min_sim:.4f}, max={max_sim:.4f}, mean={mean_sim:.4f}")
        assert min_sim >= 0.363

    def test_04_same_person_separation_phuc(self, face_svc: FaceRecognitionService, phuc_images):
        """Verify all 21 same-person pairs of phuc have similarity >= 0.363 (target >= 0.40)."""
        embs = []
        for path in phuc_images:
            img = cv2.imread(path)
            faces = face_svc.detect_faces(img)
            embs.append(face_svc.extract_embedding(img, faces[0][5]))

        sims = []
        for (i, e1), (j, e2) in combinations(enumerate(embs), 2):
            sim = face_svc.compute_similarity(e1, e2)
            sim_dot = float(np.dot(e1, e2))
            assert abs(sim - sim_dot) < 1e-4, f"Mismatch between OpenCV match ({sim}) and dot product ({sim_dot})"
            sims.append(sim)
            assert sim >= 0.363, f"Phuc pair ({i}, {j}) failed threshold: {sim:.4f} < 0.363"

        min_sim, max_sim, mean_sim = min(sims), max(sims), float(np.mean(sims))
        print(f"\n[Phuc Intra-Class (21 pairs)] min={min_sim:.4f}, max={max_sim:.4f}, mean={mean_sim:.4f}")
        assert min_sim >= 0.363

    def test_05_cross_person_separation_giang_vs_phuc(self, face_svc: FaceRecognitionService, giang_images, phuc_images):
        """Verify all 35 cross-person pairs between giang and phuc have similarity < 0.363 (FAR = 0%)."""
        giang_embs = [face_svc.extract_embedding(cv2.imread(p), face_svc.detect_faces(cv2.imread(p))[0][5]) for p in giang_images]
        phuc_embs = [face_svc.extract_embedding(cv2.imread(p), face_svc.detect_faces(cv2.imread(p))[0][5]) for p in phuc_images]

        cross_sims = []
        for i, g_emb in enumerate(giang_embs):
            for j, p_emb in enumerate(phuc_embs):
                sim = face_svc.compute_similarity(g_emb, p_emb)
                cross_sims.append(sim)
                assert sim < 0.363, f"Cross-person pair Giang[{i}] vs Phuc[{j}] false accept: {sim:.4f} >= 0.363"

        min_cross, max_cross, mean_cross = min(cross_sims), max(cross_sims), float(np.mean(cross_sims))
        print(f"\n[Cross-Person Inter-Class (35 pairs)] min={min_cross:.4f}, max={max_cross:.4f}, mean={mean_cross:.4f}")
        assert max_cross < 0.363

    def test_06_separation_margin_boundary(self, face_svc: FaceRecognitionService, giang_images, phuc_images):
        """Verify clear positive separation margin between same-person min and cross-person max."""
        giang_embs = [face_svc.extract_embedding(cv2.imread(p), face_svc.detect_faces(cv2.imread(p))[0][5]) for p in giang_images]
        phuc_embs = [face_svc.extract_embedding(cv2.imread(p), face_svc.detect_faces(cv2.imread(p))[0][5]) for p in phuc_images]

        same_sims = []
        for e1, e2 in combinations(giang_embs, 2):
            same_sims.append(face_svc.compute_similarity(e1, e2))
        for e1, e2 in combinations(phuc_embs, 2):
            same_sims.append(face_svc.compute_similarity(e1, e2))

        cross_sims = []
        for g_emb in giang_embs:
            for p_emb in phuc_embs:
                cross_sims.append(face_svc.compute_similarity(g_emb, p_emb))

        min_same = min(same_sims)
        max_cross = max(cross_sims)
        margin = min_same - max_cross
        print(f"\n[Boundary Margin] Min Same = {min_same:.4f}, Max Cross = {max_cross:.4f}, Margin = {margin:.4f}")
        assert margin > 0.0, f"Separation margin must be strictly positive, got {margin:.4f}"
        # Recommended operational threshold is in the middle
        midpoint = (min_same + max_cross) / 2.0
        print(f"[Empirical Midpoint Threshold] {midpoint:.4f}")

    def test_07_mirror_and_lighting_invariance(self, face_svc: FaceRecognitionService, giang_images):
        """Stress-test embeddings against horizontal flip and illumination variations."""
        base_img = cv2.imread(giang_images[0])
        base_face = face_svc.detect_faces(base_img)[0]
        base_emb = face_svc.extract_embedding(base_img, base_face[5])

        # 1. Horizontal flip
        flipped = cv2.flip(base_img, 1)
        flipped_faces = face_svc.detect_faces(flipped)
        assert len(flipped_faces) >= 1
        flipped_emb = face_svc.extract_embedding(flipped, flipped_faces[0][5])
        sim_flip = face_svc.compute_similarity(base_emb, flipped_emb)
        print(f"\n[Mirror Invariance] Cosine similarity with flipped face: {sim_flip:.4f}")
        assert sim_flip >= 0.363, f"Flipped face dropped below threshold: {sim_flip:.4f}"

        # 2. Brightness scaling (+20% and -20%)
        brighter = cv2.convertScaleAbs(base_img, alpha=1.2, beta=10)
        darker = cv2.convertScaleAbs(base_img, alpha=0.8, beta=-10)

        f_bright = face_svc.detect_faces(brighter)
        assert len(f_bright) >= 1
        emb_bright = face_svc.extract_embedding(brighter, f_bright[0][5])
        sim_bright = face_svc.compute_similarity(base_emb, emb_bright)
        print(f"[Lighting Invariance (+20%)] Cosine similarity: {sim_bright:.4f}")
        assert sim_bright >= 0.70, f"Illumination +20% degraded similarity: {sim_bright:.4f}"

        f_dark = face_svc.detect_faces(darker)
        assert len(f_dark) >= 1
        emb_dark = face_svc.extract_embedding(darker, f_dark[0][5])
        sim_dark = face_svc.compute_similarity(base_emb, emb_dark)
        print(f"[Lighting Invariance (-20%)] Cosine similarity: {sim_dark:.4f}")
        assert sim_dark >= 0.70, f"Illumination -20% degraded similarity: {sim_dark:.4f}"


def run_full_empirical_analysis():
    """Standalone runner that outputs complete statistics for the handoff report."""
    ensure_models_available()
    svc = get_or_create_face_service()
    g_paths = get_dataset_images("giang")
    p_paths = get_dataset_images("phuc")

    print(f"Loaded {len(g_paths)} images for giang, {len(p_paths)} images for phuc.")

    def process_person(paths, name):
        records = []
        for p in paths:
            img = cv2.imread(p)
            faces = svc.detect_faces(img)
            if not faces:
                print(f"FAILED TO DETECT: {p}")
                continue
            emb = svc.extract_embedding(img, faces[0][5])
            norm = float(np.linalg.norm(emb))
            records.append({
                "person": name,
                "file": os.path.basename(p),
                "det_score": float(faces[0][4]),
                "bbox": [int(x) for x in faces[0][:4]],
                "dim": int(emb.shape[0]),
                "norm": norm,
                "norm_diff": abs(norm - 1.0),
                "emb": emb,
            })
        return records

    g_records = process_person(g_paths, "giang")
    p_records = process_person(p_paths, "phuc")

    # Intra-class Giang
    g_sims = []
    for (i, r1), (j, r2) in combinations(enumerate(g_records), 2):
        s = svc.compute_similarity(r1["emb"], r2["emb"])
        g_sims.append({"pair": f"giang_{i}_vs_giang_{j}", "files": (r1["file"], r2["file"]), "score": s})

    # Intra-class Phuc
    p_sims = []
    for (i, r1), (j, r2) in combinations(enumerate(p_records), 2):
        s = svc.compute_similarity(r1["emb"], r2["emb"])
        p_sims.append({"pair": f"phuc_{i}_vs_phuc_{j}", "files": (r1["file"], r2["file"]), "score": s})

    # Inter-class Giang vs Phuc
    cross_sims = []
    for i, gr in enumerate(g_records):
        for j, pr in enumerate(p_records):
            s = svc.compute_similarity(gr["emb"], pr["emb"])
            cross_sims.append({"pair": f"giang_{i}_vs_phuc_{j}", "files": (gr["file"], pr["file"]), "score": s})

    all_same = [x["score"] for x in g_sims] + [x["score"] for x in p_sims]
    all_cross = [x["score"] for x in cross_sims]

    report_data = {
        "giang_count": len(g_records),
        "phuc_count": len(p_records),
        "total_images": len(g_records) + len(p_records),
        "l2_norm_max_diff": max([r["norm_diff"] for r in g_records + p_records]),
        "all_128d": all([r["dim"] == 128 for r in g_records + p_records]),
        "giang_intra": {
            "count": len(g_sims),
            "min": float(np.min([x["score"] for x in g_sims])),
            "max": float(np.max([x["score"] for x in g_sims])),
            "mean": float(np.mean([x["score"] for x in g_sims])),
            "std": float(np.std([x["score"] for x in g_sims])),
            "all_ge_0363": all([x["score"] >= 0.363 for x in g_sims]),
            "all_ge_040": all([x["score"] >= 0.40 for x in g_sims]),
            "pairs": [{"pair": x["pair"], "score": round(x["score"], 4)} for x in g_sims],
        },
        "phuc_intra": {
            "count": len(p_sims),
            "min": float(np.min([x["score"] for x in p_sims])),
            "max": float(np.max([x["score"] for x in p_sims])),
            "mean": float(np.mean([x["score"] for x in p_sims])),
            "std": float(np.std([x["score"] for x in p_sims])),
            "all_ge_0363": all([x["score"] >= 0.363 for x in p_sims]),
            "all_ge_040": all([x["score"] >= 0.40 for x in p_sims]),
            "pairs": [{"pair": x["pair"], "score": round(x["score"], 4)} for x in p_sims],
        },
        "same_person_overall": {
            "count": len(all_same),
            "min": float(np.min(all_same)),
            "max": float(np.max(all_same)),
            "mean": float(np.mean(all_same)),
            "median": float(np.median(all_same)),
            "std": float(np.std(all_same)),
            "all_ge_0363": all([s >= 0.363 for s in all_same]),
            "all_ge_040": all([s >= 0.40 for s in all_same]),
        },
        "cross_person_overall": {
            "count": len(all_cross),
            "min": float(np.min(all_cross)),
            "max": float(np.max(all_cross)),
            "mean": float(np.mean(all_cross)),
            "median": float(np.median(all_cross)),
            "std": float(np.std(all_cross)),
            "all_lt_0363": all([s < 0.363 for s in all_cross]),
            "max_cross_score": float(np.max(all_cross)),
            "far_at_0363": sum(1 for s in all_cross if s >= 0.363) / len(all_cross),
            "pairs": [{"pair": x["pair"], "score": round(x["score"], 4)} for x in cross_sims],
        },
        "separation_margin": {
            "min_same": float(np.min(all_same)),
            "max_cross": float(np.max(all_cross)),
            "margin": float(np.min(all_same) - np.max(all_cross)),
            "midpoint_threshold": float((np.min(all_same) + np.max(all_cross)) / 2.0),
        },
    }

    print("\n" + "=" * 60)
    print("EMPIRICAL COSINE SEPARATION ANALYSIS RESULTS")
    print("=" * 60)
    print(f"Total images evaluated: {report_data['total_images']}")
    print(f"Embedding dimension == 128: {report_data['all_128d']}")
    print(f"Max L2 norm deviation from 1.0: {report_data['l2_norm_max_diff']:.2e}")
    print("\n--- Same-Person Pairs (Intra-Class) ---")
    print(f"Giang (10 pairs): min={report_data['giang_intra']['min']:.4f}, max={report_data['giang_intra']['max']:.4f}, mean={report_data['giang_intra']['mean']:.4f}, all >= 0.363: {report_data['giang_intra']['all_ge_0363']}")
    print(f"Phuc  (21 pairs): min={report_data['phuc_intra']['min']:.4f}, max={report_data['phuc_intra']['max']:.4f}, mean={report_data['phuc_intra']['mean']:.4f}, all >= 0.363: {report_data['phuc_intra']['all_ge_0363']}")
    print(f"Overall Same (31 pairs): min={report_data['same_person_overall']['min']:.4f}, max={report_data['same_person_overall']['max']:.4f}, mean={report_data['same_person_overall']['mean']:.4f}")
    print("\n--- Cross-Person Pairs (Inter-Class) ---")
    print(f"Giang vs Phuc (35 pairs): min={report_data['cross_person_overall']['min']:.4f}, max={report_data['cross_person_overall']['max']:.4f}, mean={report_data['cross_person_overall']['mean']:.4f}")
    print(f"All cross-person < 0.363: {report_data['cross_person_overall']['all_lt_0363']} (FAR: {report_data['cross_person_overall']['far_at_0363']*100:.1f}%)")
    print("\n--- Separation Boundary ---")
    print(f"Min Same: {report_data['separation_margin']['min_same']:.4f}")
    print(f"Max Cross: {report_data['separation_margin']['max_cross']:.4f}")
    print(f"Separation Margin (Min Same - Max Cross): {report_data['separation_margin']['margin']:.4f}")
    print(f"Empirical Midpoint Threshold: {report_data['separation_margin']['midpoint_threshold']:.4f}")
    print("=" * 60)

    return report_data


if __name__ == "__main__":
    report = run_full_empirical_analysis()
