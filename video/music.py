"""Synthesizes the promo's background music: an original, royalty-free track.

96 BPM, so one bar is 2.5 s and every 5 s scene cut lands on a downbeat.
Pad intro, arpeggio from the first cut, drums from 10 s, a riser into the
outro at 55 s, then a held chord to the end.

Usage: python3 video/music.py   ->  video/out/music.wav (needs numpy)
"""

import os
import wave

import numpy as np

SR = 44100
DURATION = 60.0
BEAT = 60 / 96
N = int(SR * DURATION)
t = np.arange(N) / SR
rng = np.random.default_rng(137)


def hz(note):
    """MIDI note number to frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


def seg(start, end):
    return slice(int(start * SR), min(N, int(end * SR)))


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (a filter sweep)."""
    a = np.exp(-2 * np.pi * np.asarray(cutoff) / SR) * np.ones_like(x)
    y = np.empty_like(x)
    acc = 0.0
    # Blockwise to keep the per-sample loop tolerable in pure numpy.
    for i in range(0, len(x), 4096):
        xs, as_ = x[i:i + 4096], a[i:i + 4096]
        out = np.empty_like(xs)
        for j in range(len(xs)):
            acc = as_[j] * acc + (1 - as_[j]) * xs[j]
            out[j] = acc
        y[i:i + 4096] = out
    return y


def reverb(x, seconds=2.6, mix=0.3):
    """Convolution with a decaying-noise impulse response."""
    n = int(SR * seconds)
    ir = rng.standard_normal(n) * np.exp(-6 * np.arange(n) / n)
    ir = lowpass(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return x * (1 - mix) + wet * mix


# Chords, one per scene (5 s each), as MIDI notes.
CHORDS = [
    [48, 55, 59, 64, 67],  # Cmaj7      intro
    [45, 52, 55, 60, 64],  # Am7        overview
    [41, 48, 52, 57, 60],  # Fmaj7      cli
    [43, 50, 55, 59, 62],  # G          code
    [48, 55, 59, 64, 67],  # Cmaj7      web
    [45, 52, 55, 60, 64],  # Am7        funnel
    [41, 48, 52, 57, 60],  # Fmaj7      retention
    [43, 50, 55, 59, 62],  # G          errors
    [40, 47, 50, 55, 59],  # Em7        logs
    [41, 48, 52, 57, 60],  # Fmaj7      sdks
    [43, 50, 55, 60, 62],  # Gsus4      self-host
    [36, 48, 55, 59, 64],  # Cmaj7      outro
]
chord_at = lambda time: CHORDS[min(len(CHORDS) - 1, int(time // 5))]

# --- Pad: detuned saws, filter opening over the intro ----------------------
pad = np.zeros(N)
for i, chord in enumerate(CHORDS):
    start, end = i * 5.0, i * 5.0 + 5.0 + (5.0 if i == len(CHORDS) - 1 else 0.6)
    s = seg(start, end)
    tt = t[s] - start
    env = np.minimum(1, tt / 0.6) * np.clip((end - start - tt) / 0.6, 0, 1)
    for note in chord:
        for detune in (-0.08, 0.0, 0.08):
            f = hz(note + detune)
            for h in range(1, 9):
                if f * h > 9000:
                    break
                pad[s] += env * np.sin(2 * np.pi * f * h * tt + h * 0.7) / h / 15
pad = lowpass(pad, 350 + 2600 * np.clip(t / 12, 0, 1) - 1400 * np.clip((t - 55) / 5, 0, 1))

# --- Arpeggio: plucked chord tones in 16ths, from the first cut -------------
arp = np.zeros(N)
step = BEAT / 4
pattern = [0, 2, 3, 4, 3, 2, 1, 2]
for k in range(int(5.0 / step), int(55.0 / step)):
    start = k * step
    chord = chord_at(start)
    note = chord[1 + pattern[k % len(pattern)] % 4] + 12
    s = seg(start, start + 0.4)
    tt = t[s] - start
    f = hz(note)
    vel = 0.55 + 0.45 * (k % 4 == 0)
    arp[s] += vel * np.exp(-tt / 0.13) * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * 0.09
# Dotted-eighth echoes.
delayed = np.zeros(N)
d = int(SR * BEAT * 0.75)
for n_echo, gain in enumerate([0.45, 0.25, 0.12], start=1):
    delayed[d * n_echo:] += arp[:-d * n_echo] * gain
arp = arp + delayed
arp *= np.clip((t - 5) / 2.5, 0, 1)  # ease in

# --- Drums ------------------------------------------------------------------
kick = np.zeros(N)
duck = np.ones(N)
for k in range(int(10 / BEAT), int(55 / BEAT)):
    start = k * BEAT
    s = seg(start, start + 0.45)
    tt = t[s] - start
    phase = 2 * np.pi * (48 * tt + (110 / 18) * (1 - np.exp(-18 * tt)))
    kick[s] += np.sin(phase) * np.exp(-tt / 0.16) * 0.8
    kick[s] += np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt / 0.003) * 0.05
    # Sidechain: pad, bass and arp dip after each kick.
    duck[s] = np.minimum(duck[s], 1 - 0.5 * np.exp(-tt / 0.14))

hats = np.zeros(N)
noise = rng.standard_normal(N)
bright = noise - lowpass(noise, 7000)
for k in range(int(20 / (BEAT / 2)), int(55 / (BEAT / 2))):
    start = k * BEAT / 2
    s = seg(start, start + 0.08)
    tt = t[s] - start
    open_hat = k % 2 == 1
    hats[s] += bright[s] * np.exp(-tt / (0.035 if open_hat else 0.012)) * (0.16 if open_hat else 0.06)

claps = np.zeros(N)
mid = lowpass(noise, 2500) - lowpass(noise, 900)
for k in range(int(25 / BEAT), int(55 / BEAT)):
    if k % 2 == 1:
        start = k * BEAT
        s = seg(start, start + 0.25)
        tt = t[s] - start
        claps[s] += mid[s] * np.exp(-tt / 0.05) * 0.55
claps = reverb(claps, 1.4, 0.35)

# --- Bass: root notes in eighths -------------------------------------------
bass = np.zeros(N)
for k in range(int(10 / (BEAT / 2)), int(55 / (BEAT / 2))):
    start = k * BEAT / 2
    s = seg(start, start + BEAT / 2)
    tt = t[s] - start
    f = hz(chord_at(start)[0] - 12 if chord_at(start)[0] >= 40 else chord_at(start)[0])
    env = np.minimum(1, tt / 0.01) * np.exp(-tt / 0.25)
    bass[s] += np.tanh(2.2 * np.sin(2 * np.pi * f * tt)) * env * 0.22

# --- Transitions: a soft swell into every cut, a riser and impact at 55 s ---
fx = np.zeros(N)
air = lowpass(noise, 4000) - lowpass(noise, 600)
for cut in range(10, 55, 5):
    s = seg(cut - 0.9, cut)
    tt = t[s] - (cut - 0.9)
    fx[s] += air[s] * (tt / 0.9) ** 3 * 0.10
s = seg(50, 55)
tt = t[s] - 50
fx[s] += (noise[s] - lowpass(noise[s], 300 + 5000 * (tt / 5) ** 2)) * (tt / 5) ** 2.5 * 0.22
s = seg(55, 58.5)
tt = t[s] - 55
fx[s] += np.sin(2 * np.pi * (38 * tt + 3 * (1 - np.exp(-6 * tt)))) * np.exp(-tt / 0.9) * 0.6
# Bell melody over the outro chord.
for at, note in [(55.0, 76), (55.625, 79), (56.25, 83), (57.5, 84)]:
    s = seg(at, at + 2.5)
    tt = t[s] - at
    f = hz(note)
    fx[s] += np.exp(-tt / 0.7) * (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2.76 * f * tt)) * 0.07

# --- Mix ---------------------------------------------------------------------
music = reverb(pad * duck * 0.9 + arp * duck, 2.8, 0.32) + bass * duck + kick + hats + claps + reverb(fx, 2.2, 0.3)
music = np.tanh(music * 1.1)
music *= np.minimum(1, t / 0.3) * np.clip((DURATION - t) / 2.0, 0, 1)
music /= np.max(np.abs(music)) / 0.89  # about -1 dBFS peak

# Stereo: slight width from a short delay on the right channel.
right = np.concatenate([np.zeros(int(SR * 0.012)), music[:-int(SR * 0.012)]])
left = music
stereo = np.stack([left * 0.96 + right * 0.04, right * 0.96 + left * 0.04], axis=1)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'music.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, 'wb') as f:
    f.setnchannels(2)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((stereo * 32767).astype('<i2').tobytes())
print(f'wrote {out}')
