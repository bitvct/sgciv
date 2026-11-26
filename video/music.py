"""Original ambient score for the sgciv trailer (synthesised, no samples).

python3 music.py out.wav 31
Warm pad chords (Dmaj9 - Bm9 - Gmaj9 - Asus4/A), a soft plucked arpeggio,
a sub-bass and a simple Schroeder reverb. Fades in and out.
"""
import sys, wave
import numpy as np

SR = 44100
out = sys.argv[1] if len(sys.argv) > 1 else "music.wav"
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 31.0
N = int(SR * DUR)
t = np.arange(N) / SR


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# chords as MIDI notes; each lasts a quarter of the piece
CHORDS = [
    [50, 57, 62, 66, 69, 73, 76],   # Dmaj9
    [47, 54, 59, 62, 66, 69, 73],   # Bm9
    [43, 50, 55, 59, 62, 66, 69],   # Gmaj9
    [45, 52, 57, 62, 64, 69, 71],   # Asus4 -> A
]
seg = DUR / len(CHORDS)
mix = np.zeros(N)

# --- pads: detuned additive tones with slow envelopes, overlapping between chords
for ci, chord in enumerate(CHORDS):
    s0 = max(0.0, ci * seg - 0.8)
    s1 = min(DUR, (ci + 1) * seg + 1.6)
    i0, i1 = int(s0 * SR), int(s1 * SR)
    tt = t[i0:i1] - s0
    L = s1 - s0
    env = np.minimum(1, tt / 1.6) * np.minimum(1, (L - tt) / 1.8)
    env = np.clip(env, 0, 1) ** 1.5
    for m in chord[1:]:
        f = hz(m)
        for det in (-0.12, 0.0, 0.13):
            ff = f * 2 ** (det / 12)
            tone = np.sin(2 * np.pi * ff * tt) + 0.35 * np.sin(2 * np.pi * 2 * ff * tt) + 0.12 * np.sin(2 * np.pi * 3 * ff * tt)
            mix[i0:i1] += 0.018 * env * tone * (0.8 + 0.2 * np.sin(2 * np.pi * 0.15 * tt + m))
    # sub bass on the root
    f = hz(chord[0] - 12)
    mix[i0:i1] += 0.09 * env * np.sin(2 * np.pi * f * tt)

# --- plucked arpeggio (eighth notes at 96 bpm), enters after the title
step = 60 / 96 / 2
k = 0
pt = 3.2
while pt < DUR - 2.5:
    ci = min(len(CHORDS) - 1, int(pt / seg))
    chord = CHORDS[ci]
    pattern = [3, 4, 5, 6, 5, 4, 3, 5]
    m = chord[pattern[k % len(pattern)]] + (12 if k % 16 in (6, 7) else 0)
    f = hz(m)
    i0 = int(pt * SR)
    n = int(1.4 * SR)
    tt = np.arange(min(n, N - i0)) / SR
    env = np.exp(-tt * 4.2) * np.minimum(1, tt / 0.004)
    tone = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt * 8)
    vel = 0.055 * (0.75 + 0.25 * ((k % 4) == 0))
    mix[i0:i0 + len(tt)] += vel * env * tone
    k += 1
    pt += step

# --- soft swell / impact at the title and at the end card
for at, amp in ((0.15, 0.25), (27.95, 0.18)):
    i0 = int(at * SR)
    tt = np.arange(min(int(3 * SR), N - i0)) / SR
    noise = np.random.default_rng(1).standard_normal(len(tt))
    # low-passed noise boom
    a = 0.02
    y = np.zeros_like(noise)
    for j in range(1, len(noise)):
        y[j] = y[j - 1] + a * (noise[j] - y[j - 1])
    mix[i0:i0 + len(tt)] += amp * y * np.exp(-tt * 1.6) * 6 + amp * 0.5 * np.sin(2 * np.pi * 55 * tt) * np.exp(-tt * 2.2)


# --- Schroeder reverb
def comb(x, d, g):
    y = np.copy(x)
    for i in range(d, len(x)):
        y[i] += g * y[i - d]
    return y


def allpass(x, d, g):
    y = np.zeros_like(x)
    for i in range(len(x)):
        xd = x[i - d] if i >= d else 0.0
        yd = y[i - d] if i >= d else 0.0
        y[i] = -g * x[i] + xd + g * yd
    return y


dry = mix
# run the slow loops at a lower rate for speed, then upsample
dec = 4
small = dry[::dec]
sr2 = SR // dec
wet = sum(comb(small, int(sr2 * d), 0.78) for d in (0.0297, 0.0371, 0.0411, 0.0437)) / 4
wet = allpass(allpass(wet, int(sr2 * 0.005), 0.7), int(sr2 * 0.0017), 0.7)
wet = np.repeat(wet, dec)[:N]
wet = np.pad(wet, (0, N - len(wet)))
y = dry * 0.75 + wet * 0.55

# master fades + normalise
fade_in = np.minimum(1, t / 0.6)
fade_out = np.minimum(1, (DUR - t) / 1.8)
y *= np.clip(fade_in, 0, 1) * np.clip(fade_out, 0, 1)
y /= max(1e-9, np.max(np.abs(y))) / 0.85
stereo = np.stack([y, np.roll(y, int(0.012 * SR)) * 0.97], axis=1)
pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, f"{DUR:.1f}s")
