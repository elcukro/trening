#!/usr/bin/env python3
"""Generuje proste schematy ćwiczeń (SVG, widok z boku, pozycja start → koniec) do public/exercises/<id>.svg.

Figura to „patyczak” liczony z kątów (stopnie, 0° = w prawo, 90° = w górę) i długości segmentów,
więc każda pozycja to kilka liczb. Uruchom: python3 scripts/exercise-diagrams.py
"""
from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "exercises"
W, H = 220, 130  # dwie klatki po 100 px + strzałka
L = dict(torso=34, neck=9, thigh=30, shin=30, foot=10, ua=20, fa=18)


def p(o, ang, length):
    return (o[0] + math.cos(math.radians(ang)) * length, o[1] - math.sin(math.radians(ang)) * length)


def figure(hip, torso, thigh, shin, ua, fa, foot=0, torso_len=None, thigh_len=None, shin_len=None, ua_len=None, fa_len=None):
    """Zwraca słownik stawów. Kąty: torso od biodra do barku, thigh od biodra do kolana, shin od kolana do kostki,
    ua od barku do łokcia, fa od łokcia do dłoni, foot od kostki do palców."""
    sh = p(hip, torso, torso_len or L["torso"])
    head = p(sh, torso, L["neck"] + 7)
    knee = p(hip, thigh, thigh_len or L["thigh"])
    ankle = p(knee, shin, shin_len or L["shin"])
    toe = p(ankle, foot, L["foot"])
    el = p(sh, ua, ua_len or L["ua"])
    hand = p(el, fa, fa_len or L["fa"])
    return dict(hip=hip, sh=sh, head=head, knee=knee, ankle=ankle, toe=toe, el=el, hand=hand)


def line(a, b, cls="b"):
    return f'<line class="{cls}" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}"/>'


def draw_figure(f, extra_leg=None):
    body = [(f["hip"], f["sh"]), (f["hip"], f["knee"]), (f["knee"], f["ankle"]), (f["ankle"], f["toe"]), (f["sh"], f["el"]), (f["el"], f["hand"])]
    parts = [line(a, b, "halo") for a, b in body] + [f'<circle class="halo" cx="{f["head"][0]:.1f}" cy="{f["head"][1]:.1f}" r="7"/>']
    parts += [
        line(f["hip"], f["sh"]),
        line(f["hip"], f["knee"]),
        line(f["knee"], f["ankle"]),
        line(f["ankle"], f["toe"]),
        line(f["sh"], f["el"]),
        line(f["el"], f["hand"]),
        f'<circle class="h" cx="{f["head"][0]:.1f}" cy="{f["head"][1]:.1f}" r="7"/>',
    ]
    if extra_leg:
        knee = p(f["hip"], extra_leg[0], L["thigh"])
        ankle = p(knee, extra_leg[1], L["shin"])
        parts += [line(f["hip"], knee, "b2"), line(knee, ankle, "b2"), line(ankle, p(ankle, extra_leg[2] if len(extra_leg) > 2 else 0, L["foot"]), "b2")]
    return "".join(parts)


def bar(hand, half=16, plates=True):
    s = f'<line class="eq" x1="{hand[0] - half:.1f}" y1="{hand[1]:.1f}" x2="{hand[0] + half:.1f}" y2="{hand[1]:.1f}"/>'
    if plates:
        s += f'<rect class="pl" x="{hand[0] - half - 3:.1f}" y="{hand[1] - 9:.1f}" width="4" height="18" rx="1"/>'
        s += f'<rect class="pl" x="{hand[0] + half - 1:.1f}" y="{hand[1] - 9:.1f}" width="4" height="18" rx="1"/>'
    return s


def barbell_side(hand, r=9):
    """Sztanga widziana od czoła gryfu – kółko (talerz) w dłoni."""
    return f'<circle class="pl" cx="{hand[0]:.1f}" cy="{hand[1]:.1f}" r="{r}"/><circle class="eqf" cx="{hand[0]:.1f}" cy="{hand[1]:.1f}" r="2"/>'


def db(hand):
    return f'<rect class="pl" x="{hand[0] - 5:.1f}" y="{hand[1] - 3:.1f}" width="10" height="6" rx="1.5"/>'


def kb(hand):
    return f'<circle class="pl" cx="{hand[0]:.1f}" cy="{hand[1] + 7:.1f}" r="6"/><path class="eq" d="M{hand[0] - 4:.1f} {hand[1] + 3:.1f} q4 -7 8 0"/>'


def rect(x, y, w, h, cls="eq"):
    return f'<rect class="{cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="2"/>'


def floor(y=112):
    return f'<line class="fl" x1="4" y1="{y}" x2="96" y2="{y}"/>'


def frame(content, dx):
    return f'<g transform="translate({dx} 0)">{content}</g>'


ARROW = '<path class="ar" d="M104 66 h12 m-4 -4 l4 4 l-4 4"/>'

# ---------------------------------------------------------------- definicje: (opis pozycji start, pozycji koniec)
EX = {}


def add(eid, start, end):
    EX[eid] = (start, end)


# przysiad ze sztangą na plecach: stojąc → biodro do kolana
add(
    "back_squat",
    lambda: draw_figure(f := figure((50, 62), 95, -88, -90, 150, 60)) + bar((f["sh"][0], f["sh"][1] - 2)) + floor(),
    lambda: draw_figure(f := figure((44, 84), 60, -40, -95, 140, 60)) + bar((f["sh"][0], f["sh"][1] - 2)) + floor(),
)
# RDL: stojąc → zawias biodrowy, sztanga przy goleniach
add(
    "rdl",
    lambda: draw_figure(f := figure((50, 62), 92, -88, -90, -85, -90)) + barbell_side(f["hand"]) + floor(),
    lambda: draw_figure(f := figure((56, 66), 165, -75, -90, -110, -95, foot=0)) + barbell_side((f["hand"][0], f["hand"][1] + 2)) + floor(),
)
# trap bar: głębszy zawias + kolana
add(
    "trap_bar_deadlift",
    lambda: draw_figure(f := figure((52, 80), 130, -55, -100, -100, -95)) + rect(f["hand"][0] - 14, f["hand"][1] - 2, 28, 4) + f'<circle class="pl" cx="{f["hand"][0] - 16:.1f}" cy="{f["hand"][1] + 8:.1f}" r="8"/>' + floor(),
    lambda: draw_figure(f := figure((50, 62), 92, -88, -90, -85, -92)) + rect(f["hand"][0] - 14, f["hand"][1] - 2, 28, 4) + f'<circle class="pl" cx="{f["hand"][0] - 16:.1f}" cy="{f["hand"][1] + 8:.1f}" r="8"/>' + floor(),
)
# wiosłowanie hantlem: podpór na ławce, ręka w dole → hantel przy biodrze
add(
    "db_row",
    lambda: rect(58, 84, 34, 6) + draw_figure(f := figure((60, 66), 175, -60, -95, -95, -90)) + db(f["hand"]) + floor(),
    lambda: rect(58, 84, 34, 6) + draw_figure(f := figure((60, 66), 175, -60, -95, -60, 175, ua_len=16, fa_len=14)) + db(f["hand"]) + floor(),
)
# wspięcia na palce
add(
    "calf_raise",
    lambda: draw_figure(f := figure((50, 60), 92, -88, -90, -85, -90)) + floor(),
    lambda: draw_figure(f := figure((50, 52), 92, -88, -88, -85, -90, foot=-60)) + floor(),
)
# Pallof press: stojąc bokiem do wyciągu, ręce przy klatce → wyprost przed sobą
add(
    "pallof_press",
    lambda: draw_figure(f := figure((40, 62), 92, -88, -90, -20, 120, ua_len=16, fa_len=14)) + f'<line class="eq" x1="{f["hand"][0]:.1f}" y1="{f["hand"][1]:.1f}" x2="4" y2="{f["hand"][1] + 2:.1f}"/>' + floor(),
    lambda: draw_figure(f := figure((40, 62), 92, -88, -90, 0, 0)) + f'<line class="eq" x1="{f["hand"][0]:.1f}" y1="{f["hand"][1]:.1f}" x2="4" y2="{f["hand"][1] + 2:.1f}"/>' + floor(),
)
# dead bug: leżąc, ręce i nogi w górze → przeciwległe ręka i noga opuszczone nisko
add(
    "dead_bug",
    lambda: draw_figure(figure((40, 100), 0, 80, -10, 85, 90, foot=-20, torso_len=30)) + floor(112),
    lambda: draw_figure(figure((40, 100), 0, 15, -5, 165, 170, foot=-10, torso_len=30)) + floor(112),
)
# plank bokiem
add(
    "side_plank",
    lambda: draw_figure(figure((50, 92), 12, 190, -5, -100, 0, torso_len=30, ua_len=16, fa_len=16)) + floor(),
    lambda: draw_figure(figure((50, 80), 8, 195, -8, -110, 0, torso_len=30, ua_len=16, fa_len=16)) + floor(),
)
# step-up: noga na skrzyni → wyprost na skrzyni
add(
    "step_up",
    lambda: rect(58, 80, 34, 32, "eq") + draw_figure(f := figure((44, 66), 85, -88, -90, -85, -90), extra_leg=(-20, -100)) + db(f["hand"]) + floor(),
    lambda: rect(58, 80, 34, 32, "eq") + draw_figure(f := figure((74, 34), 92, -88, -90, -85, -90)) + db(f["hand"]) + floor(),
)
# przysiad bułgarski: tylna stopa na ławce, zejście
add(
    "bulgarian_split_squat",
    lambda: rect(66, 90, 28, 6) + draw_figure(f := figure((42, 64), 90, -80, -95, -85, -90), extra_leg=(-15, 25)) + db(f["hand"]) + floor(),
    lambda: rect(66, 90, 28, 6) + draw_figure(f := figure((40, 80), 85, -30, -100, -85, -90), extra_leg=(-5, 40)) + db(f["hand"]) + floor(),
)
# hip thrust: plecy na ławce, biodro nisko → wyprost biodra ze sztangą
add(
    "hip_thrust",
    lambda: rect(4, 70, 30, 30) + draw_figure(f := figure((48, 92), 150, -20, -80, -80, -20, torso_len=32)) + barbell_side((f["hip"][0], f["hip"][1] - 6), 7) + floor(),
    lambda: rect(4, 70, 30, 30) + draw_figure(f := figure((50, 74), 165, -5, -85, -60, -30, torso_len=32)) + barbell_side((f["hip"][0], f["hip"][1] - 6), 7) + floor(),
)
# podciąganie
add(
    "pull_up",
    lambda: '<line class="eq" x1="20" y1="14" x2="80" y2="14"/>' + draw_figure(figure((50, 84), 90, -85, -70, 92, 90, torso_len=30, ua_len=18, fa_len=18, foot=-30)),
    lambda: '<line class="eq" x1="20" y1="14" x2="80" y2="14"/>' + draw_figure(figure((50, 54), 90, -85, -70, 150, 60, torso_len=30, ua_len=18, fa_len=18, foot=-30)),
)
# pompki
add(
    "push_up",
    lambda: draw_figure(figure((40, 82), 12, 190, -5, -90, -90, torso_len=34)) + floor(),
    lambda: draw_figure(figure((40, 98), 8, 190, -5, -175, -20, torso_len=34, ua_len=18, fa_len=16)) + floor(),
)
# spacer farmera
add(
    "farmer_walk",
    lambda: draw_figure(f := figure((48, 62), 92, -100, -85, -88, -90), extra_leg=(-70, -95)) + kb(f["hand"]) + floor(),
    lambda: draw_figure(f := figure((52, 62), 92, -75, -95, -88, -90), extra_leg=(-105, -85)) + kb(f["hand"]) + floor(),
)
# wyprosty tułowia na ławce rzymskiej
add(
    "back_extension",
    lambda: rect(40, 72, 40, 8) + rect(74, 60, 6, 44) + draw_figure(figure((44, 74), 260, 5, -60, 250, 260, torso_len=32, thigh_len=28, shin_len=20)) + floor(),
    lambda: rect(40, 72, 40, 8) + rect(74, 60, 6, 44) + draw_figure(figure((44, 74), 180, 5, -60, 250, 250, torso_len=32, thigh_len=28, shin_len=20)) + floor(),
)
# Copenhagen plank: górna noga na ławce
add(
    "copenhagen_plank",
    lambda: rect(70, 78, 26, 6) + draw_figure(figure((50, 92), 12, 190, 0, -100, 0, torso_len=30, ua_len=16, fa_len=16, thigh_len=24, shin_len=16), extra_leg=(-8, 0)) + floor(),
    lambda: rect(70, 78, 26, 6) + draw_figure(figure((50, 82), 8, 190, 0, -110, 0, torso_len=30, ua_len=16, fa_len=16, thigh_len=24, shin_len=16), extra_leg=(-14, 0)) + floor(),
)
# plank przodem z unoszeniem ręki
add(
    "plank_reach",
    lambda: draw_figure(figure((40, 84), 12, 190, -5, -100, 0, torso_len=34, ua_len=16, fa_len=16)) + floor(),
    lambda: draw_figure(figure((40, 84), 12, 190, -5, 15, 0, torso_len=34, ua_len=18, fa_len=16)) + floor(),
)
# wyskoki z hantlami
add(
    "jump_squat",
    lambda: draw_figure(f := figure((46, 80), 70, -45, -95, -85, -90)) + db(f["hand"]) + floor(),
    lambda: draw_figure(f := figure((50, 46), 92, -85, -80, -85, -90, foot=-40)) + db(f["hand"]) + floor(),
)
# swing kettlebell
add(
    "kb_swing",
    lambda: draw_figure(f := figure((54, 70), 150, -70, -92, -125, -120)) + kb(f["hand"]) + floor(),
    lambda: draw_figure(f := figure((50, 62), 92, -88, -90, 0, 0)) + kb((f["hand"][0], f["hand"][1] - 7)) + floor(),
)
# wskoki na skrzynię
add(
    "box_jump",
    lambda: rect(60, 76, 34, 36) + draw_figure(figure((36, 82), 65, -45, -95, -150, -100)) + floor(),
    lambda: rect(60, 76, 34, 36) + draw_figure(figure((76, 40), 80, -60, -95, 20, 40)) + floor(),
)
# obwód mobilności: głęboki przysiad z gumą / kettlebell
add(
    "mobility_circuit",
    lambda: draw_figure(f := figure((44, 90), 75, -30, -100, -30, 20)) + kb((f["hand"][0], f["hand"][1] - 4)) + floor(),
    lambda: draw_figure(figure((50, 62), 92, -88, -90, 100, 95)) + floor(),
)
# schłodzenie – rozciąganie zginaczy bioder (klęk)
add(
    "cooldown_stretch",
    lambda: draw_figure(figure((50, 80), 92, 20, -90, -70, -90, thigh_len=24, shin_len=24), extra_leg=(-100, 0)) + floor(),
    lambda: draw_figure(figure((56, 82), 100, 30, -95, 110, 100, thigh_len=24, shin_len=24), extra_leg=(-100, 0)) + floor(),
)

STYLE = (
    "<style>"
    ".b{stroke:#334155;stroke-width:4;stroke-linecap:round;fill:none;paint-order:stroke}"
    ".b2{stroke:#7c8ea3;stroke-width:3.5;stroke-linecap:round;fill:none}"
    ".h{fill:#334155}"
    ".halo{stroke:#f8fafc;stroke-width:8;stroke-linecap:round;fill:none;opacity:.9}"
    ".eq{stroke:#0284c7;stroke-width:3.5;stroke-linecap:round;fill:none}"
    ".eqf{fill:#0284c7}"
    ".pl{fill:#0ea5e9;opacity:.85}"
    ".fl{stroke:#94a3b8;stroke-width:2;stroke-dasharray:4 3}"
    ".ar{stroke:#94a3b8;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}"
    ".t{font:600 9px system-ui,sans-serif;fill:#64748b}"
    "</style>"
)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for eid, (start, end) in EX.items():
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Schemat: {eid}">'
            + STYLE
            + frame(start(), 0)
            + ARROW
            + frame(end(), 120)
            + '<text class="t" x="6" y="124">start</text><text class="t" x="126" y="124">koniec</text>'
            + "</svg>"
        )
        (OUT / f"{eid}.svg").write_text(svg, encoding="utf-8")
    print(f"zapisano {len(EX)} schematów do {OUT}")


if __name__ == "__main__":
    main()
