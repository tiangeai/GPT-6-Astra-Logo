#!/usr/bin/env python3
import json
import math
import os
import shutil
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from common import WEB  # noqa: E402

NODE = shutil.which("node")
ASPECT = 16 / 9


def run_node(script):
    figs = os.path.join(WEB, "app", "figures")
    prelude = f"""
      global.window = globalThis;
      require({json.dumps(os.path.join(figs, 'rng.js'))});
      require({json.dumps(os.path.join(figs, 'astra.js'))});
      const doc = require({json.dumps(os.path.join(WEB, 'data', 'entries.json'))});
      const P = doc.entries.find(e => e.id === 'gpt-6-astra').params;
      const A = globalThis.AD_FIGURES.astra;
      const tabs = A.armTables(P);
      const parts = A.build(P);
      const ASPECT = {ASPECT};
      const T0 = 40;
      const ev = (q, t) => A.evolve(q, P, t, tabs, ASPECT, [0, 0, 0, 0, 0, 0, 0]).slice();
    """
    r = subprocess.run([NODE, "-e", prelude + script], capture_output=True, text=True)
    if r.returncode != 0:
        raise AssertionError(f"the node side failed: {r.stderr[:800]}")
    return json.loads(r.stdout)


@unittest.skipUnless(NODE, "node is not installed; skipping the kinematics comparison")
class StarsFlowAlongTheStrokesTowardTheCore(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.data = run_node("""
          const out = [], dt = 0.1;
          for (const q of parts) {
            if (q.kind !== 0) continue;
            const a = ev(q, T0), b = ev(q, T0 + dt);
            if (a[5] <= 0.05 || b[5] <= 0.05) continue;
            const ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]);
            let dth = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
            dth = Math.atan2(Math.sin(dth), Math.cos(dth));
            out.push([q.arm, ra, (rb - ra) / dt, dth / dt, Math.hypot(b[0] - a[0], b[1] - a[1]) / dt]);
          }
          const nominal = tabs.map(t => t.length * Math.abs(t.speed) * P.flowSpeed);
          console.log(JSON.stringify({rows: out, nominal, dirs: tabs.map(t => t.dir)}));
        """)
        cls.rows = cls.data["rows"]

    def test_every_arm_flows_toward_the_end_nearer_the_core(self):
        self.assertEqual(len(self.data["dirs"]), 5)
        self.assertEqual(self.data["dirs"], [1, 1, -1, -1, -1])

    def test_most_stars_move_inward_the_mean_radius_shrinks(self):
        inward = sum(1 for r in self.rows if r[2] < 0) / len(self.rows)
        mean_dr = sum(r[2] for r in self.rows) / len(self.rows)
        self.assertGreater(inward, 0.6, f"only {inward:.0%} of the stars flow inward")
        self.assertLess(mean_dr, 0, "on average the stars move away from the core")

    def test_counterclockwise_on_screen(self):
        ccw = sum(1 for r in self.rows if r[3] > 0) / len(self.rows)
        self.assertGreater(ccw, 0.9, f"only {ccw:.0%} of the stars go counterclockwise")

    def test_speed_along_an_arm_is_constant_at_its_nominal_rate(self):
        for k, nominal in enumerate(self.data["nominal"]):
            band = [r for r in self.rows if r[0] == k]
            self.assertGreater(len(band), 100, f"arm[{k}] has too few samples")
            speeds = sorted(r[4] for r in band)
            median = speeds[len(speeds) // 2]
            self.assertAlmostEqual(median, nominal, delta=0.12 * nominal,
                                   msg=f"arm[{k}] median speed along the path {median:.3f} != nominal {nominal:.3f}")
            within = sum(1 for s in speeds if 0.7 * nominal <= s <= 1.3 * nominal) / len(speeds)
            self.assertGreater(within, 0.9, f"arm[{k}]: only {within:.0%} of the stars are within +/-30% of the nominal speed")

    def test_angular_speed_is_inversely_proportional_to_the_radius(self):
        inner = [abs(r[3]) for r in self.rows if 0.4 <= r[1] < 1.5]
        outer = [abs(r[3]) for r in self.rows if r[1] >= 3.5]
        self.assertGreater(len(inner), 30)
        self.assertGreater(len(outer), 30)
        w_in = sorted(inner)[len(inner) // 2]
        w_out = sorted(outer)[len(outer) // 2]
        self.assertGreater(w_in / w_out, 2.0, "the inner ring must turn much faster than the outer one (omega ~ 1/r)")


@unittest.skipUnless(NODE, "node is not installed; skipping the kinematics comparison")
class ThePatternHoldsStill_TheStarsMove(unittest.TestCase):
    def test_the_arc_length_table_depends_only_on_the_parameters(self):
        same = run_node("""
          const t2 = A.armTables(P);
          let maxd = 0;
          tabs.forEach((t, k) => { for (let i = 0; i < t.pts.length; i++) maxd = Math.max(maxd, Math.abs(t.pts[i] - t2[k].pts[i])); });
          console.log(JSON.stringify({maxd, n: tabs.length, size: tabs[0].size}));
        """)
        self.assertEqual(same["maxd"], 0)
        self.assertEqual(same["n"], 5)
        self.assertEqual(same["size"], 512)

    def test_the_core_spins_rigidly_background_stars_stay_put(self):
        r = run_node("""
          const dt = 1.0;
          const core = parts.filter(q => q.kind === 2);
          const field = parts.filter(q => q.kind === 1).slice(0, 100);
          const rate = (q, p) => { const a = A.evolve(q, p, T0, tabs, ASPECT, [0,0,0,0,0,0,0]).slice(), b = A.evolve(q, p, T0 + dt, tabs, ASPECT, [0,0,0,0,0,0,0]);
            let d = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]); return Math.atan2(Math.sin(d), Math.cos(d)) / dt; };
          const still = Object.assign({}, P, {coreWobble: [0, 0, 0, 0]});
          const dc = core.map(q => rate(q, still));
          const dw = core.filter(q => Math.hypot(q.px, q.py) > 0.15).map(q => rate(q, P));
          const df = field.map(q => { const a = ev(q, T0), b = ev(q, T0 + dt); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
          console.log(JSON.stringify({dc, dw, df, omega: P.coreSpin * P.flowSpeed, n: core.length}));
        """)
        self.assertGreaterEqual(r["n"], 18)
        for w in r["dc"]:
            self.assertAlmostEqual(w, r["omega"], delta=1e-6, msg="the core stars do not spin rigidly at 0.36*v")
        self.assertGreater(len(r["dw"]), 5)
        for w in r["dw"]:
            self.assertAlmostEqual(w, r["omega"], delta=0.15 * r["omega"], msg="the sway distorts the apparent spin of the core too much")
        self.assertEqual(max(r["df"]), 0.0, "background stars moved")

    def test_the_twinkle_amplitude_is_a_quarter_of_the_original(self):
        r = run_node("console.log(JSON.stringify({amp: P.twinkleAmp}))")
        self.assertLessEqual(r["amp"], 0.15)
        self.assertGreater(r["amp"], 0.0)


@unittest.skipUnless(NODE, "node is not installed")
class Entrance_ScatterThenGather(unittest.TestCase):
    def test_the_first_14pct_appears_across_the_viewport_at_45pct_size(self):
        r = run_node("""
          const t = P.introDelay + P.introDuration * (P.revealWindow + 0.02);
          const arm = parts.filter(q => q.kind === 0);
          let vis = 0, ratio = 0, far = 0, n = 0;
          for (const q of arm) {
            const a = ev(q, t), z = ev(q, T0);
            n++; if (a[5] > 0.5) vis++; ratio += a[3] / Math.max(z[3], 1e-6);
            if (Math.hypot(a[0] - z[0], a[1] - z[1]) > 1.0) far++;
          }
          console.log(JSON.stringify({vis: vis / n, ratio: ratio / n, far: far / n}));
        """)
        self.assertGreater(r["vis"], 0.9, "early in the entrance almost every star should already be visible")
        self.assertLess(r["ratio"], 0.55, "early in the entrance stars should be about half their final size (sqrt 0.2)")
        self.assertGreater(r["far"], 0.9, "early in the entrance stars should still be scattered across the viewport, not already on the arms")

    def test_every_star_sits_on_a_stroke_once_the_entrance_ends(self):
        r = run_node("""
          const t1 = P.introDelay + P.introDuration + 0.001;
          let maxd = 0;
          for (const q of parts) {
            if (q.kind !== 0) continue;
            const a = ev(q, t1);
            const b = A.evolve(q, Object.assign({}, P, {introDelay: -1000}), t1, tabs, ASPECT, [0,0,0,0,0,0,0]);
            let best = Infinity, pt = [0,0,0];
            for (let i = 0; i <= 200; i++) { A.samplePath(tabs[q.arm], i / 200, pt); best = Math.min(best, Math.hypot(pt[0] - a[0], pt[1] - a[1])); }
            maxd = Math.max(maxd, best);
          }
          console.log(JSON.stringify({maxd}));
        """)
        self.assertLess(r["maxd"], 0.6, "after the entrance some stars are still too far from the arm skeleton (the scatter range is +/-6 units)")

    def test_flow_and_core_spin_start_only_past_half_the_entrance(self):
        r = run_node("""
          const t_early = P.introDelay + P.introDuration * (P.flowGateStart - 0.05);
          const t_late = P.introDelay + P.introDuration + 2;
          console.log(JSON.stringify({
            early: A.flowTime(P, t_early), late: A.flowTime(P, t_late),
            gate_early: A.flowGate(P, A.introProgress(P, t_early)), gate_end: A.flowGate(P, 1),
            steady: A.flowTime(P, t_late + 1) - A.flowTime(P, t_late)
          }));
        """)
        self.assertEqual(r["early"], 0.0)
        self.assertEqual(r["gate_early"], 0.0)
        self.assertEqual(r["gate_end"], 1.0)
        self.assertGreater(r["late"], 0.0)
        self.assertAlmostEqual(r["steady"], 1.0, places=9, msg="after the entrance, flow time should equal wall-clock time")


if __name__ == "__main__":
    unittest.main(verbosity=2)
