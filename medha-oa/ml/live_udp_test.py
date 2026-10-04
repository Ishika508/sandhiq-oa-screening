"""Stream realistic IMU frames to the gateway, as the ESP8266 nodes do.

Fills the same UDP path as the real hardware, so it verifies the whole chain
(firewall, ports, packet layout, buffering, scoring) without strapping sensors
to anyone. Useful on a new network, after a firewall change, or when a real
node reports WAITING and you need to know whether the fault is in the radio
link or the receiver.

    python ml/live_udp_test.py                       # default ports, 9s
    python ml/live_udp_test.py --host 192.168.1.50  # send to another machine
    python ml/live_udp_test.py --scenario moderate  # unhealthy stance
    python ml/live_udp_test.py --score              # print the scored trial

The synthetic stance mirrors imu_balance.SCENARIOS, so a `low` run should come
back at roughly risk 2 / vibration 0.22 m/s². If it does not, the receiver or
the network is at fault rather than the scoring.

NOTE: this is a DIAGNOSTIC. It fabricates samples, so anything it produces is
test data and must never be saved onto a patient record.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import socket
import struct
import sys
import threading
import time
import urllib.error
import urllib.request

# Must match sensor_gateway.PACKET_FORMAT exactly: uint32 seq, uint32 ts_us,
# 6x float acc/gyro, float temp = 36 bytes.
PACKET_FORMAT = "<IIfffffff"
PACKET_SIZE = struct.calcsize(PACKET_FORMAT)
GRAVITY = 9.81

# Mirrors imu_balance.SCENARIOS so the resulting score lands in the intended band.
SCENARIOS = {
    "low": {"vib": 0.220, "sway": 6.0, "freq": 3.2, "noise": 0.015},
    "moderate": {"vib": 0.550, "sway": 16.0, "freq": 4.1, "noise": 0.045},
    "high": {"vib": 1.050, "sway": 36.0, "freq": 5.0, "noise": 0.080},
}


def _frames(profile, count, rate, seed):
    """Deterministic quiet-stance frames: {(seq, ts_us, ax, ay, az, gx, gy, gz, temp)}."""
    rng = random.Random(seed)
    amp = profile["vib"] * math.sqrt(2.0)
    sway_amp = profile["sway"] * math.sqrt(2.0)
    freq = profile["freq"] * (1.0 + 0.06 * (rng.random() - 0.5))
    fslow = 0.55 + 0.15 * (rng.random() - 0.5)
    n = profile["noise"]
    p1, p2, p3 = (rng.random() * math.tau for _ in range(3))

    for i in range(count):
        t = i / rate
        trem = amp * math.sin(math.tau * freq * t + p1) \
            + 0.28 * amp * math.sin(math.tau * freq * 2.2 * t + p2)
        sway = sway_amp * math.sin(math.tau * fslow * t + p3)
        n1, n2, n3 = rng.gauss(0, n), rng.gauss(0, n * 0.6), rng.gauss(0, n * 0.8)
        yield (
            i,
            int(time.time() * 1e6) % (2 ** 32),  # firmware sends 32-bit micros
            0.05 * math.sin(math.tau * fslow * t + p2) + n2,
            GRAVITY + trem + n1,
            0.04 * math.sin(math.tau * fslow * t * 1.3 + p3) + n3,
            0.5 * math.sin(math.tau * fslow * t + p1) + n3,
            sway + 0.6 * trem * 20.0 * 0.08,
            0.4 * math.sin(math.tau * fslow * t + p2) + n2,
            31.5,
        )


def stream(host, port, profile, count, rate, seq0, seed):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sent = 0
    try:
        for seq, ts, ax, ay, az, gx, gy, gz, temp in _frames(profile, count, rate, seed):
            sock.sendto(struct.pack(PACKET_FORMAT, (seq0 + seq) % (2 ** 32), ts,
                                    ax, ay, az, gx, gy, gz, temp), (host, port))
            sent += 1
            time.sleep(1.0 / rate)
    finally:
        sock.close()
    return sent


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1", help="gateway host (use the LAN address to test another machine)")
    ap.add_argument("--thigh-port", type=int, default=5005)
    ap.add_argument("--shank-port", type=int, default=5006)
    ap.add_argument("--duration", type=float, default=9.0, help="seconds per node")
    ap.add_argument("--rate", type=float, default=100.0, help="Hz per node")
    ap.add_argument("--scenario", choices=sorted(SCENARIOS), default="low")
    ap.add_argument("--service", default="http://127.0.0.1:8000", help="ml/server.py base URL")
    ap.add_argument("--score", action="store_true", help="POST /api/imu/trial afterwards")
    args = ap.parse_args()

    profile = SCENARIOS[args.scenario]
    count = max(10, int(round(args.duration * args.rate)))
    print(f"[test] {count} frames/node @ {args.rate:g} Hz for {args.duration:g}s "
          f"-> {args.host} UDP {args.thigh_port} (thigh) / {args.shank_port} (shank), "
          f"scenario={args.scenario}")

    workers = [
        threading.Thread(target=stream, args=(args.host, args.thigh_port, profile,
                                               count, args.rate, 1, 11)),
        threading.Thread(target=stream, args=(args.host, args.shank_port, profile,
                                               count, args.rate, 5000, 29)),
    ]
    for w in workers:
        w.start()
    for w in workers:
        w.join()
    print("[test] done streaming")

    if not args.score:
        print("[test] re-run with --score to fetch the scored trial")
        return 0

    try:
        with urllib.request.urlopen(f"{args.service}/api/imu/status", timeout=20) as r:
            st = json.load(r)
        for key, node in st["gateway"]["imu"].items():
            print(f"[test] {key:<8} {node['device']} bound={node['bound']} "
                  f"online={node['online']} frames={node['frames']}")
        if not st.get("ready"):
            print("[test] gateway has too few buffered frames to score — is ml/server.py "
                  "on the same host, and did the packets actually arrive?")
            return 1

        req = urllib.request.Request(
            f"{args.service}/api/imu/trial", data=b"{}",
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=90) as r:
            res = json.load(r)
    except (urllib.error.URLError, OSError, KeyError, json.JSONDecodeError) as exc:
        print(f"[test] could not reach {args.service}: {exc}")
        return 1

    mean = res.get("mean", {})
    print(f"[test] score {res['risk_100']}/100 band={res['band']} "
          f"nodes={','.join(res.get('sensorsPresent', []))} duration={res['duration_s']}s")
    print(f"[test] vibration={mean.get('vibration_rms')} jerk={mean.get('jerk_rms')} "
          f"sway={mean.get('sway_rms')}")
    for key, m in (res.get("sensors") or {}).items():
        if m:
            print(f"[test]   {key}: vib={m['vibration_rms']} jerk={m['jerk_rms']} "
                  f"sway={m['sway_rms']} tremor={m['tremor_freq']}Hz")
    print("[test] REMINDER: these are synthetic frames, not a patient measurement.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
