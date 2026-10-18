#!/usr/bin/env python3
from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 22_050
DOTTED_QUARTER_BPM = 90
EIGHTH = 60.0 / (DOTTED_QUARTER_BPM * 3)
BAR = EIGHTH * 6
BAR_COUNT = 24
TOTAL_DURATION = BAR * BAR_COUNT

NOTE_BASE = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


def midi(name: str) -> int:
    if len(name) >= 2 and name[1] in "#b":
        pitch = name[:2]
        octave = int(name[2:])
    else:
        pitch = name[:1]
        octave = int(name[1:])
    return (octave + 1) * 12 + NOTE_BASE[pitch]


def freq(note: str | int) -> float:
    value = midi(note) if isinstance(note, str) else note
    return 440.0 * (2.0 ** ((value - 69) / 12.0))


def at(bar: int, eighth: float = 0) -> float:
    return bar * BAR + eighth * EIGHTH


samples = [0.0] * int(TOTAL_DURATION * SAMPLE_RATE)
rng = random.Random(8675309)


def envelope(t: float, hold: float, attack: float, decay: float, sustain: float, release: float) -> float:
    if t < attack:
        return t / max(attack, 0.0001)
    if t < attack + decay:
        amount = (t - attack) / max(decay, 0.0001)
        return 1.0 + (sustain - 1.0) * amount
    if t < hold:
        return sustain
    if t < hold + release:
        amount = (t - hold) / max(release, 0.0001)
        return sustain * (1.0 - amount)
    return 0.0


def pulse_wave(phase: float, duty: float) -> float:
    return 1.0 if phase % 1.0 < duty else -1.0


def triangle_wave(phase: float) -> float:
    return 4.0 * abs((phase % 1.0) - 0.5) - 1.0


def add_note(
    note: str | int,
    start: float,
    length: float,
    volume: float,
    *,
    wave_shape: str = "pulse",
    duty: float = 0.28,
    attack: float = 0.004,
    decay: float = 0.045,
    sustain: float = 0.45,
    release: float = 0.075,
    vibrato_depth: float = 0.0,
    vibrato_rate: float = 5.5,
) -> None:
    base_freq = freq(note)
    start_i = max(0, int(start * SAMPLE_RATE))
    end_i = min(len(samples), int((start + length + release) * SAMPLE_RATE))
    for i in range(start_i, end_i):
        t = (i / SAMPLE_RATE) - start
        amp = envelope(t, length, attack, decay, sustain, release)
        if amp <= 0:
            continue
        vib = 1.0 + vibrato_depth * math.sin(2.0 * math.pi * vibrato_rate * t)
        phase = base_freq * vib * t
        if wave_shape == "triangle":
            tone = triangle_wave(phase)
        elif wave_shape == "sine":
            tone = math.sin(2.0 * math.pi * phase)
        else:
            tone = pulse_wave(phase, duty)
        samples[i] += tone * amp * volume


def add_kick(start: float, volume: float = 0.11) -> None:
    length = 0.12
    start_i = int(start * SAMPLE_RATE)
    end_i = min(len(samples), int((start + length) * SAMPLE_RATE))
    phase = 0.0
    for i in range(start_i, end_i):
        t = (i / SAMPLE_RATE) - start
        falloff = max(0.0, 1.0 - t / length) ** 2
        current_freq = 118.0 - 58.0 * (t / length)
        phase += current_freq / SAMPLE_RATE
        samples[i] += math.sin(2.0 * math.pi * phase) * falloff * volume


def add_noise_hit(start: float, length: float, volume: float, *, bright: bool = False) -> None:
    start_i = int(start * SAMPLE_RATE)
    end_i = min(len(samples), int((start + length) * SAMPLE_RATE))
    previous = 0.0
    for i in range(start_i, end_i):
        t = (i / SAMPLE_RATE) - start
        env = max(0.0, 1.0 - t / length) ** 2
        current = rng.uniform(-1.0, 1.0)
        tone = current - previous if bright else current * 0.65 + previous * 0.35
        previous = current
        samples[i] += tone * env * volume


CHORDS = [
    ["D3", "A3", "D4", "F4"],
    ["C3", "G3", "C4", "E4"],
    ["G2", "D3", "G3", "B3"],
    ["D3", "A3", "D4", "F4"],
    ["F2", "C3", "F3", "A3"],
    ["C3", "G3", "C4", "E4"],
    ["G2", "D3", "G3", "B3"],
    ["A2", "E3", "A3", "C#4"],
    ["D3", "A3", "D4", "F4"],
    ["G2", "D3", "G3", "B3"],
    ["D3", "A3", "D4", "F4"],
    ["C3", "G3", "C4", "E4"],
    ["F2", "C3", "F3", "A3"],
    ["G2", "D3", "G3", "B3"],
    ["A2", "E3", "A3", "C#4"],
    ["D3", "A3", "D4", "F4"],
    ["Bb2", "F3", "Bb3", "D4"],
    ["C3", "G3", "C4", "E4"],
    ["F2", "C3", "F3", "A3"],
    ["A2", "E3", "A3", "C#4"],
    ["D3", "A3", "D4", "F4"],
    ["C3", "G3", "C4", "E4"],
    ["G2", "D3", "G3", "B3"],
    ["A2", "E3", "A3", "C#4"],
]

MELODY = [
    ["D5", "F5", "E5", "D5", "A4", "C5"],
    ["D5", "E5", "F5", "G5", "F5", "E5"],
    ["D5", "B4", "G4", "A4", "B4", "D5"],
    ["C5", "E5", "D5", "A4", "C5", "D5"],
    ["F5", "A5", "G5", "F5", "E5", "D5"],
    ["E5", "G5", "F5", "E5", "C5", "E5"],
    ["D5", "B4", "G4", "B4", "A4", "G4"],
    ["A4", "C#5", "E5", "F5", "E5", "C#5"],
    ["D5", "F5", "A5", "F5", "E5", "D5"],
    ["G5", "B5", "A5", "G5", "D5", "B4"],
    ["F5", "A5", "G5", "F5", "D5", "A4"],
    ["E5", "G5", "E5", "C5", "D5", "E5"],
    ["F5", "A5", "C6", "A5", "G5", "F5"],
    ["G5", "B5", "D6", "B5", "A5", "G5"],
    ["E5", "C#5", "A4", "C#5", "E5", "G5"],
    ["F5", "E5", "D5", "A4", "C5", "D5"],
    ["D6", "Bb5", "A5", "F5", "D5", "F5"],
    ["E5", "G5", "C6", "G5", "E5", "D5"],
    ["A5", "C6", "A5", "F5", "E5", "F5"],
    ["G5", "E5", "C#5", "A4", "C#5", "E5"],
    ["D5", "F5", "A5", "D6", "A5", "F5"],
    ["E5", "G5", "C6", "G5", "E5", "C5"],
    ["D5", "B4", "G4", "A4", "B4", "D5"],
    ["A4", "C#5", "E5", "F5", "E5", "C#5"],
]


for bar, chord in enumerate(CHORDS):
    root = chord[0]
    fifth = chord[1]
    bass_volume = 0.075 if bar < 16 else 0.085
    add_note(root, at(bar, 0), EIGHTH * 1.8, bass_volume, wave_shape="triangle", attack=0.006, decay=0.06, sustain=0.5, release=0.08)
    add_note(fifth, at(bar, 3), EIGHTH * 1.65, bass_volume * 0.86, wave_shape="triangle", attack=0.006, decay=0.06, sustain=0.45, release=0.08)

    arp_order = [0, 2, 1, 3, 2, 1] if bar % 2 == 0 else [0, 1, 2, 3, 2, 1]
    for eighth, chord_index in enumerate(arp_order):
        note_value = midi(chord[chord_index]) + 24
        add_note(
            note_value,
            at(bar, eighth),
            EIGHTH * 0.42,
            0.028 if bar < 16 else 0.034,
            duty=0.18,
            attack=0.002,
            decay=0.035,
            sustain=0.22,
            release=0.045,
        )

    add_kick(at(bar, 0), 0.1 if bar % 4 else 0.12)
    if bar >= 8:
        add_kick(at(bar, 3), 0.055)
    for eighth in (1, 2, 4, 5):
        add_noise_hit(at(bar, eighth), 0.035, 0.013, bright=True)
    for eighth in (2, 5):
        add_noise_hit(at(bar, eighth) + EIGHTH * 0.08, 0.055, 0.018 if bar >= 16 else 0.014)


for bar, notes in enumerate(MELODY):
    for eighth, note_name in enumerate(notes):
        length = EIGHTH * (0.52 if eighth not in (0, 3) else 0.72)
        add_note(
            note_name,
            at(bar, eighth),
            length,
            0.076 if bar < 16 else 0.085,
            duty=0.24 if bar % 4 else 0.2,
            decay=0.055,
            sustain=0.42,
            release=0.06,
            vibrato_depth=0.0016 if bar >= 16 else 0.0008,
        )


COUNTER_LINES = {
    8: ["A4", "D5", "C5", "A4"],
    9: ["B4", "D5", "G5", "D5"],
    10: ["A4", "D5", "F5", "D5"],
    11: ["G4", "C5", "E5", "C5"],
    12: ["A4", "F5", "E5", "C5"],
    13: ["B4", "G5", "F5", "D5"],
    14: ["C#5", "E5", "G5", "E5"],
    15: ["D5", "F5", "E5", "D5"],
    20: ["F4", "A4", "D5", "F5"],
    21: ["E4", "G4", "C5", "E5"],
    22: ["D4", "G4", "B4", "D5"],
}

for bar, notes in COUNTER_LINES.items():
    for idx, note_name in enumerate(notes):
        add_note(
            note_name,
            at(bar, idx * 1.5),
            EIGHTH * 0.85,
            0.034,
            duty=0.36,
            attack=0.006,
            decay=0.04,
            sustain=0.38,
            release=0.08,
        )


for bar in (7, 15, 19, 23):
    add_noise_hit(at(bar, 5.65), 0.11, 0.028, bright=True)


peak = max(abs(value) for value in samples) or 1.0
if peak > 0:
    samples = [value / peak * 0.72 for value in samples]

fade_samples = int(0.006 * SAMPLE_RATE)
for i in range(fade_samples):
    samples[i] *= i / fade_samples
    samples[-i - 1] *= i / fade_samples


def write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        frames = b"".join(
            struct.pack("<h", max(-32_767, min(32_767, int(sample * 32_767))))
            for sample in samples
        )
        wav.writeframes(frames)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    paths = [
        repo_root / "Art/Generated/Music/Options/01-court-minstrels-6-8.wav",
        repo_root / "ListingEvalApp/Assets.xcassets/MediEvalMusicCourtMinstrels.dataset/court-minstrels.wav",
    ]
    for path in paths:
        write_wav(path)
        print(f"Wrote {path.relative_to(repo_root)} ({TOTAL_DURATION:.2f}s)")


if __name__ == "__main__":
    main()
