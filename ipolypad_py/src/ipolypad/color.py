"""Color-aware mask + auto-contrast. SPEC §4.1, §4.2."""
# this_file: ipolypad_py/src/ipolypad/color.py
from __future__ import annotations

import numpy as np
from PIL import Image, ImageOps


def _has_alpha(img: Image.Image) -> bool:
    a = np.array(img.split()[-1], dtype=np.uint8)
    # Treat fully opaque as "no alpha information" — colour route applies.
    return bool(a.min() < 250 and a.max() > 5)


def _otsu(a: np.ndarray) -> int | None:
    """Otsu threshold on a uint8 channel. Returns None if degenerate."""
    hist = np.bincount(a.ravel(), minlength=256).astype(np.float64)
    total = a.size
    if total == 0:
        return None
    cum = np.cumsum(hist)
    cum_mean = np.cumsum(hist * np.arange(256))
    # Between-class variance for each candidate threshold
    w0 = cum / total
    w1 = 1.0 - w0
    # avoid div-by-zero
    with np.errstate(divide="ignore", invalid="ignore"):
        m0 = np.where(cum > 0, cum_mean / np.maximum(cum, 1), 0.0)
        m1 = np.where(
            total - cum > 0,
            (cum_mean[-1] - cum_mean) / np.maximum(total - cum, 1),
            0.0,
        )
        sigma_b = w0 * w1 * (m0 - m1) ** 2
    if not np.isfinite(sigma_b).any():
        return None
    t = int(np.nanargmax(sigma_b))
    if t in (0, 255):
        return None
    return t


def _bg_color_from_corners(rgb: np.ndarray) -> np.ndarray:
    """Estimate background colour from a corner+edge sample. Returns float (3,)."""
    h, w, _ = rgb.shape
    band = max(2, min(h, w) // 32)
    samples = np.concatenate(
        [
            rgb[:band, :, :].reshape(-1, 3),
            rgb[-band:, :, :].reshape(-1, 3),
            rgb[:, :band, :].reshape(-1, 3),
            rgb[:, -band:, :].reshape(-1, 3),
        ]
    )
    # Median is robust to mixed edges (e.g. text bleeding into the frame).
    return np.median(samples, axis=0).astype(np.float64)


def _rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Lazy import of scikit-image. Returns float H×W×3."""
    from skimage.color import rgb2lab

    return rgb2lab(rgb / 255.0)


def _sauvola(lab_l: np.ndarray) -> np.ndarray:
    """Adaptive Sauvola threshold on L channel. Returns boolean foreground mask."""
    from skimage.filters import threshold_sauvola

    win = max(15, (min(lab_l.shape) // 16) | 1)
    t = threshold_sauvola(lab_l, window_size=win, k=0.2)
    return lab_l < t  # darker than local threshold = foreground


def autoenhance(img: Image.Image) -> Image.Image:
    """Auto-levels + mild gamma. SPEC §4.2. Idempotent in practice (one pass)."""
    rgb = img.convert("RGB")
    # Per-channel stretch via PIL autocontrast on L-equivalent; cheaper than scikit.
    rgb = ImageOps.autocontrast(rgb, cutoff=2, preserve_tone=True)
    # Mild gamma toward darker midtones (γ ≈ 0.85).
    arr = np.asarray(rgb, dtype=np.float32) / 255.0
    arr = np.power(arr, 1.0 / 0.85)
    rgb = Image.fromarray((np.clip(arr, 0.0, 1.0) * 255.0).astype(np.uint8))
    # Reattach original alpha if present.
    if img.mode == "RGBA":
        a = img.split()[-1]
        out = rgb.convert("RGBA")
        out.putalpha(a)
        return out
    return rgb


def mask_smart(
    img: Image.Image,
    *,
    bg_tolerance: float = 12.0,
) -> np.ndarray:
    """Boolean H×W foreground mask, content-aware (SPEC §4.1).

    Routing:
      1. Has alpha → Otsu on alpha, fallback to 24.
      2. No alpha → corner background colour, ΔE > bg_tolerance in Lab.
      3. Degenerate (<2% or >98% coverage) → Sauvola on L channel.
    """
    rgba = np.asarray(img.convert("RGBA"))
    alpha = rgba[..., 3]
    rgb = rgba[..., :3]

    candidates: list[np.ndarray] = []

    if _has_alpha(img):
        t = _otsu(alpha)
        if t is None:
            t = 24
        candidates.append(alpha > t)

    bg = _bg_color_from_corners(rgb)
    lab_img = _rgb_to_lab(rgb)
    lab_bg = _rgb_to_lab(bg.reshape(1, 1, 3).astype(np.uint8))[0, 0]
    de = np.linalg.norm(lab_img - lab_bg[None, None, :], axis=-1)
    candidates.append(de > bg_tolerance)

    def coverage(m: np.ndarray) -> float:
        return float(m.mean())

    for m in candidates:
        c = coverage(m)
        if 0.02 < c < 0.98:
            return m

    # Escalate to Sauvola on L.
    return _sauvola(lab_img[..., 0])


def mask_fixed(img: Image.Image, *, threshold: int = 24) -> np.ndarray:
    """Fixed-threshold mask on alpha. SPEC §2.3 (also JS parity path)."""
    alpha = np.array(img.split()[-1], dtype=np.uint8)
    return alpha > threshold
