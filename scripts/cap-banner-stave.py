"""Cap both ends of the bindrune band painted across public/banner.webp.

ALREADY APPLIED — this is a one-shot repair, kept for the method rather than to
be re-run. Running it again on the repaired file would trim the mark a second
time. It is here because the band is a *painted* drawing of the mark rather than
a crop of the master (DESIGN.md §8), so it cannot be re-derived, and because the
method is not obvious from the result.

    python scripts/cap-banner-stave.py     # needs numpy + Pillow

The defect. The band's stave overran Wunjo's flag by 96px on the left and the
last Tiwaz chevron by 59px on the right. A triangle mounted mid-stave is not
Wunjo, it is Thurisaz — the flag has to cap the stave's end. The footer's vector
and the walnut carving in logo.png were both correct; only this drawing drifted.

The method. The neon composites additively in linear light — the stroke's
cross-section measured over a lit backdrop and over pure black agree — so
removing part of the stroke is a subtraction of that part's field, not a
paint-over. Four pieces:

  * PROFILE. Measure the cross-section where the backdrop is provably black:
    the right-hand shaft, against never-painted columns at the frame edge. A
    modelled backdrop inflated it by ~20%, and over-subtracting by that much
    crushed green to zero and left a magenta streak across the rock. The probe
    run is only 59px long, so it is divided by its own end-falloff to recover
    the profile of an unbounded stroke; three rounds converge.
  * SHAPE. That profile times S(x,dy)/S(inf,dy) — the fraction of the field a
    segment cut short still contributes. S comes from a 2-D kernel fitted to the
    profile as a sum of Gaussians: a 2-D Gaussian's line integral preserves
    sigma, so the 1-D fit transfers to 2-D directly, and any error in its
    amplitude cancels in the ratio.
  * CORE. The middle rows are opaque ink and nothing under them survived, so
    they bridge vertically from the corrected rows either side.
  * CAP. A round cap is composited at the cut, or the stroke ends square where
    every other stroke in the mark ends round.

Verification is ground truth, not eyeballing: the right-hand removal sat over
provably black artwork, so the repaired pixels are compared directly against
never-painted columns from the same rows.
"""
import numpy as np
from PIL import Image

SRC = 'public/banner.webp'
QUALITY = 94                 # lands within 0.4 KB of the original file

Y0 = 556.36                  # stave centre, sub-pixel
CUT_L, CUT_R = 155, 1929     # Wunjo's leg base; the last chevron's arm tips
STAVE_L, STAVE_R = 59, 1988
PROBE = (1938, 1978)         # bare shaft, provably black backdrop
REF = (2005, 2045)           # never painted — the backdrop reference
CORE = 5.5                   # rows the opaque ink destroys
WIDTH = 2.2                  # stroke half-width, for the cap
REACH = 70                   # vertical reach of the repair


def to_lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    s = np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)
    return np.clip(np.round(s * 255.0), 0, 255).astype(np.uint8)


lin = to_lin(np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64))
H, W, _ = lin.shape
dys = np.arange(-REACH, REACH + 1).astype(np.float64)
y_lo = int(Y0 - REACH)
band = slice(y_lo, y_lo + len(dys))

measured = np.maximum(lin[band, PROBE[0]:PROBE[1] + 1, :].mean(axis=1)
                      - lin[band, REF[0]:REF[1] + 1, :].mean(axis=1), 0.0)

SIGMAS = np.array([1.5, 2.5, 4.0, 7.0, 12.0, 20.0, 34.0])
halo = np.abs(dys) >= CORE
basis = np.exp(-(dys[halo, None] ** 2) / (2 * SIGMAS[None, :] ** 2))


def fit_kernel(profile):
    """Non-negative least squares onto the Gaussian basis, per channel."""
    amps = np.zeros((len(SIGMAS), 3))
    for c in range(3):
        a = np.linalg.lstsq(basis, profile[halo, c], rcond=None)[0]
        for _ in range(80):
            keep = a > 0
            if not keep.any():
                break
            new = np.zeros_like(a)
            new[keep] = np.linalg.lstsq(basis[:, keep], profile[halo, c], rcond=None)[0]
            if np.allclose(np.maximum(new, 0), np.maximum(a, 0), atol=1e-10):
                a = new
                break
            a = new
        amps[:, c] = np.maximum(a, 0.0)
    return amps / (SIGMAS[:, None] * np.sqrt(2 * np.pi))


def field(t_lo, t_hi, xs, kamp):
    """Sum of the 2-D kernel over stroke pixels t in [t_lo, t_hi]."""
    t = np.arange(t_lo, t_hi + 1).astype(np.float64)
    r2 = (xs[None, :, None] - t[None, None, :]) ** 2 + (dys[:, None, None] ** 2)
    out = np.zeros((len(dys), len(xs), 3))
    for s, a in zip(SIGMAS, kamp):
        out += np.exp(-r2 / (2 * s ** 2)).sum(axis=2)[..., None] * a
    return out


# The probe run is finite. Divide out its own end-falloff to recover the profile
# of an unbounded stroke — the kernel is needed to compute the falloff and the
# falloff to correct the profile the kernel is fitted to, so iterate.
P = measured.copy()
mid = np.array([(PROBE[0] + PROBE[1]) / 2.0])
for _ in range(3):
    kamp = fit_kernel(P)
    inf = np.maximum(field(-400, 400, np.array([0.0]), kamp)[:, 0, :], 1e-12)
    frac = np.clip(field(CUT_R + 1, STAVE_R, mid, kamp)[:, 0, :] / inf, 0.15, 1.0)
    P = measured / frac
kamp = fit_kernel(P)
S_inf = np.maximum(field(-400, 400, np.array([0.0]), kamp)[:, 0, :], 1e-12)

out = lin.copy()
core = np.abs(dys) <= CORE

for seg_lo, seg_hi, cut, retained in [
    (STAVE_L, CUT_L - 1, CUT_L, +1),     # retained mark lies at x > cut
    (CUT_R + 1, STAVE_R, CUT_R, -1),     # retained mark lies at x < cut
]:
    x_lo = max(0, min(seg_lo, cut) - 80)
    x_hi = min(W - 1, max(seg_hi, cut) + 80)
    xs = np.arange(x_lo, x_hi + 1).astype(np.float64)
    u = (xs - cut) * retained                       # <0 removed, >=0 retained

    obs = out[band, x_lo:x_hi + 1, :]
    bg = np.maximum(
        obs - P[:, None, :] * (field(seg_lo, seg_hi, xs, kamp) / S_inf[:, None, :]),
        0.0)

    a, b = np.where(core)[0][0] - 1, np.where(core)[0][-1] + 1
    w = ((dys[core] - dys[a]) / (dys[b] - dys[a]))[:, None, None]
    bg[core] = (1 - w) * bg[a][None] + w * bg[b][None]

    d = np.sqrt(np.minimum(u, 0.0)[None, :] ** 2 + dys[:, None] ** 2)
    cap = np.clip(WIDTH + 0.5 - d, 0.0, 1.0)[..., None]
    keep_ink = (core[:, None] & (u >= 0)[None, :])[..., None]

    out[band, x_lo:x_hi + 1, :] = np.where(keep_ink, obs, cap * obs + (1 - cap) * bg)

orig = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
Image.fromarray(to_srgb(out)).save(SRC, 'WEBP', quality=QUALITY, method=6)

# Ground truth: the right-hand removal sat over provably black artwork.
chk = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
for label, a in (('before  ', orig[band, 1945:1990]),
                 ('after   ', chk[band, 1945:1990]),
                 ('never painted', orig[band, REF[0]:REF[1] + 1])):
    print('%-14s mean %s  max %s'
          % (label, np.round(a.mean(axis=(0, 1)), 2), a.max(axis=(0, 1))))

lum = 0.2126 * chk[..., 0] + 0.7152 * chk[..., 1] + 0.0722 * chk[..., 2]
r = np.where(lum[round(Y0)] > 150)[0]
print('stave spans x %d..%d (was %d..%d)' % (r.min(), r.max(), STAVE_L, STAVE_R))
