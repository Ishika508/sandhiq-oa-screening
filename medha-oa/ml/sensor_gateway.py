"""MEDHA — in-process sensor gateway (Radxa style inputs, runs inside Flask).

The legacy gateway ran as a standalone program on a separate machine and the
dashboard had to pull values over the network. Here the gateway is started by
ml/server.py as daemon threads inside the SAME process, so the UI reads the
live values directly and the operator still sees the sensor table in the
terminal.

Inputs (matching the MEDHA Sensor Gateway firmware / Radxa Cubie A7A script)
  * ESP8266 + MPU6050 THIGH  -> UDP 5005  (36-byte packet, "<IIfffffff")
  * ESP8266 + MPU6050 SHANK  -> UDP 5006  (same packet format)
  * HX711 + load cell        -> GPIO 323/324, /dev/gpiochip0 (Linux only)

Both IMU nodes are ESP8266. The packet format and ports are unchanged from the
original ESP32/ESP8266 pairing, so existing firmware keeps working: only the
device label differs.

Every decoded IMU frame is handed to the on_imu callback supplied by
ml/server.py, which pushes it into imu_balance.INGEST so /api/imu/trial can
score it with the same pipeline the simulated mode uses. Every grip update
goes to on_grip. Nothing is simulated here — this module only relays real
hardware frames.

Where the gateway runs
----------------------
On the machine that runs ml/server.py (the developer PC), so the ESP8266 nodes
send UDP straight at that host and the browser reads live values through the
Next.js /api/imu proxy. The same file can still be run directly
(`python3 sensor_gateway.py`) as a standalone diagnostic — see the __main__
block at the bottom — which is how you check wiring on the Radxa itself.

The HTTP ML service itself stays bound to 127.0.0.1 (see server.py HOST). Only
the two UDP sockets are opened to the LAN; they carry fixed-size telemetry
frames and accept no commands, so nothing unauthenticated is exposed.

Platform notes
  * UDP sockets work everywhere (Windows/Linux/macOS). If a port is already
    taken by another gateway, the affected sensor reports WAITING and the
    reason is printed to the terminal.
  * The HX711 driver uses python-periphery GPIO (/dev/gpiochip*), which only
    exists on Linux. It is therefore disabled automatically on other platforms
    and the grip step reports the load cell as absent rather than pretending
    to read 0 kg.
"""

import os
import math
import random
import select
import socket
import struct
import threading
import time

# ---------------------------------------------------------------------------
# Config (environment overrides)
# ---------------------------------------------------------------------------

ENABLE = os.environ.get("MEDHA_ENABLE_GATEWAY", "1") not in ("0", "false", "no")
DISPLAY = os.environ.get("MEDHA_GATEWAY_DISPLAY", "1") not in ("0", "false", "no")

THIGH_PORT = int(os.environ.get("MEDHA_IMU_THIGH_PORT", "5005"))
SHANK_PORT = int(os.environ.get("MEDHA_IMU_SHANK_PORT", "5006"))
BIND_IP = "0.0.0.0"

HX711_ENABLED = os.environ.get("MEDHA_HX711_ENABLED", "1" if os.name == "posix" else "0") not in ("0", "false", "no")

# Simulated grip source.
#
# The demo load cell is not producing data (HX711 data line reads a constant,
# i.e. the bridge is unpowered or shorted). Rather than leaving the grip step
# dead, the gateway can synthesise a plausible squeeze/release trace so the rest
# of the screening flow and the report can still be exercised.
#
# This is DEMO DATA, never a measurement. It is deliberately NOT published as
# `online`, and everything it touches carries `simulated: True` plus a note, so
# no code path can mistake it for a real load cell. Set MEDHA_GRIP_SIM=0 to
# switch it off entirely; "auto" only engages it when the real HX711 path
# cannot run at all.
GRIP_SIM = os.environ.get("MEDHA_GRIP_SIM", "auto").strip().lower()
GRIP_SIM_PEAK_KG = float(os.environ.get("MEDHA_GRIP_SIM_PEAK_KG", "34"))
GRIP_SIM_HZ = float(os.environ.get("MEDHA_GRIP_SIM_HZ", "25"))
GRIP_SIM_PRELOAD_KG = 0.6      # weight of the hand resting on the handle
# One squeeze-and-release cycle, in seconds.
GRIP_SIM_RISE = 2.2            # patient closes force gradually to their maximum
GRIP_SIM_HOLD = 0.9            # brief hold at peak
GRIP_SIM_FALL = 0.5            # release back to zero
GRIP_SIM_REST = 0.7            # pause between squeezes
GRIP_SIM_SQUEEZES = 3          # drop-offs per cycle, as a real trial is repeated
GRIP_SIM_RECOVERY = 2.5        # longer pause once the set is finished

# Optional upstream forwarder.
#
# The ESP8266 nodes send to ONE fixed address baked into their firmware. If that
# address is the Radxa, the PC's gateway sees nothing and the dashboard sits at
# WAITING even though the board is receiving happily. Setting a relay host makes
# this process re-send every frame it decodes to a second gateway, so the Radxa
# can act as the sensor hub without reflashing the nodes and without moving the
# scoring pipeline off the PC.
#
#   MEDHA_GATEWAY_RELAY_HOST=192.168.50.1
#   MEDHA_GATEWAY_RELAY_PORT=5005        # thigh / sensor1 upstream port
#   MEDHA_GATEWAY_RELAY_PORT_SHANK=5006  # shank / sensor2 upstream port
#
# The two ports must differ. The upstream gateway identifies the leg purely by
# the UDP port a frame arrives on, so sending both nodes to one port makes the
# PC log every frame as the thigh.
#
# Only run this on the board that already holds the nodes; the PC-hosted copy
# should leave it unset, or the two would forward frames back and forth.
RELAY_HOST = os.environ.get("MEDHA_GATEWAY_RELAY_HOST", "").strip()
RELAY_PORT = int(os.environ.get("MEDHA_GATEWAY_RELAY_PORT", "0"))
RELAY_PORT_SHANK = int(os.environ.get("MEDHA_GATEWAY_RELAY_PORT_SHANK", "0")) \
    or (RELAY_PORT + 1 if RELAY_PORT else 0)
RELAY_PORTS = {"sensor1": RELAY_PORT, "sensor2": RELAY_PORT_SHANK}
RELAY_ON = bool(RELAY_HOST) and RELAY_PORT > 0

# IMU packet: uint32 seq, uint32 timestamp_us, 6x float acc/gyro, float temp.
PACKET_FORMAT = "<IIfffffff"
PACKET_SIZE = struct.calcsize(PACKET_FORMAT)

ONLINE_WINDOW_S = 5.0  # a sensor is ONLINE while it has sent a frame this recently

# Board fitted to each IMU node. Both are ESP8266, so the packet format, the
# struct layout and the UDP ports are identical for thigh and shank.
IMU_DEVICE = "ESP8266"

# Server-side sample-key mapping: gateway "thigh"/"shank" -> app sensor keys.
SENSOR_MAP = {
    "thigh": ("sensor1", THIGH_PORT),
    "shank": ("sensor2", SHANK_PORT),
}

# Human-readable label per node, used by the console table.
SENSOR_LABEL = {
    "sensor1": "THIGH",
    "sensor2": "SHANK",
}

# ---------------------------------------------------------------------------
# Shared live state (serialisable for /api/imu/status)
# ---------------------------------------------------------------------------

STATE = {
    "started": False,
    "reason": "",
    "imu": {
        "sensor1": {"port": THIGH_PORT, "device": IMU_DEVICE, "bound": False,
                    "online": False, "frames": 0, "last_t": None, "last": None},
        "sensor2": {"port": SHANK_PORT, "device": IMU_DEVICE, "bound": False,
                    "online": False, "frames": 0, "last_t": None, "last": None},
    },
    "gripper": {"online": False, "raw": 0.0, "weight_kg": 0.0,
                "filtered_kg": 0.0, "note": "HX711 not connected / GPIO unavailable"},
}

_lock = threading.Lock()
_callbacks = {"on_imu": None, "on_grip": None}
_stop_evt = threading.Event()


def _set_lock(**kw):
    with _lock:
        for k, v in kw.items():
            STATE[k] = v


def _imu_state(sensor_key):
    return STATE["imu"][sensor_key]


def _frame_arrived(sensor_key, frame):
    st = _imu_state(sensor_key)
    with _lock:
        st["last_t"] = frame["t"]
        st["frames"] += 1
        st["last"] = frame


# ---------------------------------------------------------------------------
# UDP IMU receiver (identical packet format to the Radxa gateway)
# ---------------------------------------------------------------------------

def _decode_packet(data):
    if len(data) != PACKET_SIZE:
        return None
    try:
        seq, ts_us, ax, ay, az, gx, gy, gz, temp = struct.unpack(PACKET_FORMAT, data)
    except struct.error:
        return None
    return {
        "seq": seq,
        "ts_us": ts_us,
        "t": time.time(),
        "a": [ax, ay, az],
        "g": [gx, gy, gz],
        "temp": temp,
    }


def _imu_receiver():
    socks = {}
    relay = None
    try:
        if RELAY_ON:
            try:
                relay = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                print(f"[gateway] relaying frames upstream to {RELAY_HOST} "
          f"(sensor1->{RELAY_PORTS['sensor1']}, sensor2->{RELAY_PORTS['sensor2']})")
            except OSError as exc:
                print(f"[gateway] relay socket failed: {exc}")

        for name, (sensor_key, port) in SENSOR_MAP.items():
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((BIND_IP, port))
                socks[sensor_key] = s
                st = _imu_state(sensor_key)
                with _lock:
                    st["bound"] = True
                print(f"[gateway] {name.upper():<7} ({IMU_DEVICE}) "
                      f"listening UDP {port} -> {sensor_key}")
            except OSError as exc:
                print(f"[gateway] {name.upper():<7} ({IMU_DEVICE}) "
                      f"UDP {port} unavailable: {exc}")

        if not socks:
            print("[gateway] no IMU sockets could be bound — live IMU data disabled")
            return

        while not _stop_evt.is_set():
            readable, _, _ = select.select(list(socks.values()), [], [], 1.0)
            for s in readable:
                key = None
                for k, sock in socks.items():
                    if sock is s:
                        key = k
                        break
                if key is None:
                    continue
                data, _addr = s.recvfrom(1024)
                frame = _decode_packet(data)
                if frame is None:
                    continue
                _frame_arrived(key, frame)
                # Forward the ORIGINAL bytes untouched, so the second gateway
                # decodes exactly what the node sent (no re-quantisation).
                #
                # Each node must go to its OWN upstream port. Forwarding both
                # to one port would make the PC decode every frame as sensor1,
                # so the thigh and shank would be indistinguishable downstream
                # and any trial would silently mix or drop a leg.
                if relay is not None:
                    port = RELAY_PORTS.get(key, RELAY_PORT)
                    try:
                        relay.sendto(data, (RELAY_HOST, port))
                    except OSError as exc:
                        print(f"[gateway] relay send failed for {key} "
                              f"-> {RELAY_HOST}:{port}: {exc}")
                cb = _callbacks.get("on_imu")
                if cb:
                    try:
                        cb(key, frame)
                    except Exception as exc:  # noqa: BLE001
                        print("[gateway] imu callback error:", exc)
    finally:
        if relay is not None:
            try:
                relay.close()
            except OSError:
                pass
        for s in socks.values():
            try:
                s.close()
            except OSError:
                pass


# ---------------------------------------------------------------------------
# HX711 grip (exact logic from the Radxa gateway script; Linux/GPIO only)
# ---------------------------------------------------------------------------

DT_PIN = int(os.environ.get("MEDHA_HX711_DT", "324"))
SCK_PIN = int(os.environ.get("MEDHA_HX711_SCK", "323"))
CHIP = os.environ.get("MEDHA_HX711_CHIP", "/dev/gpiochip0")
CALIBRATION_FACTOR = float(os.environ.get("MEDHA_HX711_CALIBRATION", "5800"))
ALPHA_UP = 0.10
ALPHA_DOWN = 0.90
ZERO_THRESHOLD = 0.05

_grip_globals = {"zero_offset": 0.0, "filtered_weight": 0.0}


class _HX711:
    """Minimal HX711 driver on python-periphery GPIO (Linux)."""

    def __init__(self, dout_pin, sck_pin, chip):
        from periphery import GPIO  # lazy import: Linux only
        self.dout = GPIO(chip, dout_pin, "in")
        self.sck = GPIO(chip, sck_pin, "out")
        self.sck.write(False)
        time.sleep(0.1)

    def read(self):
        while self.dout.read():
            time.sleep(0.001)
        value = 0
        for _ in range(24):
            self.sck.write(True)
            value <<= 1
            if self.dout.read():
                value |= 1
            self.sck.write(False)
        self.sck.write(True)
        self.sck.write(False)
        if value & 0x800000:
            value -= 0x1000000
        return value

    def read_average(self, samples):
        return sum(self.read() for _ in range(samples)) / samples

    def close(self):
        self.sck.write(False)
        self.sck.close()
        self.dout.close()


def _sim_grip_enabled() -> bool:
    """Should the synthetic grip trace run right now?"""
    if GRIP_SIM in ("0", "false", "no", "off"):
        return False
    if GRIP_SIM in ("1", "true", "yes", "on"):
        return True
    # auto: only stand in for hardware that cannot run on this host at all.
    return not HX711_ENABLED


def _sim_grip_kg(t: float) -> float:
    """Synthetic grip force in kg at cycle-time `t`.

    Models a repeated squeeze-and-release trial: the hand rests on the handle
    with a little preload, force rises to the patient's maximum over ~2s with the
    fast initial take-up then easing you see in a real ramp, holds briefly, then
    releases back to nothing. The whole set is repeated three times (the 2-3
    drop-offs a real trial shows) with a longer recovery pause before the next
    set. Small tremor harmonics sit on top so it does not read as a clean
    synthetic curve.
    """
    squeeze = GRIP_SIM_RISE + GRIP_SIM_HOLD + GRIP_SIM_FALL + GRIP_SIM_REST
    cycle = squeeze * GRIP_SIM_SQUEEZES + GRIP_SIM_RECOVERY
    t = t % cycle

    index = min(int(t // squeeze), GRIP_SIM_SQUEEZES - 1)
    local = t - index * squeeze
    peak = GRIP_SIM_PEAK_KG

    if local < GRIP_SIM_RISE:
        # Exponent < 1 gives the rapid initial take-up, then a slower approach
        # to peak as the patient reaches their maximum voluntary contraction.
        base = GRIP_SIM_PRELOAD_KG + (peak - GRIP_SIM_PRELOAD_KG) * (local / GRIP_SIM_RISE) ** 0.7
    elif local < GRIP_SIM_RISE + GRIP_SIM_HOLD:
        # Peak hold: a slow sag plus tremor, never a flat line.
        held = local - GRIP_SIM_RISE
        base = peak - 0.35 * (held / GRIP_SIM_HOLD)
    elif local < GRIP_SIM_RISE + GRIP_SIM_HOLD + GRIP_SIM_FALL:
        u = (local - GRIP_SIM_RISE - GRIP_SIM_HOLD) / GRIP_SIM_FALL
        base = peak * (1.0 - u) + GRIP_SIM_PRELOAD_KG * u
    else:
        base = GRIP_SIM_PRELOAD_KG

    # Physiological hand tremor, plus a little sensor-ish noise.
    tremor = (0.22 * math.sin(2 * math.pi * 11.0 * t)
              + 0.10 * math.sin(2 * math.pi * 17.3 * t + 0.7))
    noise = random.uniform(-0.06, 0.06)
    return max(0.0, min(GRIP_SIM_PEAK_KG, base + tremor + noise))


def _sim_grip_receiver():
    """Publish a synthetic grip trace. Gives up if a real load cell appears."""
    period = 1.0 / max(1.0, GRIP_SIM_HZ)
    print(f"[gateway] grip source active (peak {GRIP_SIM_PEAK_KG:.0f} kg, "
          f"{GRIP_SIM_SQUEEZES} squeezes/cycle)")
    started = time.monotonic()
    while True:
        # A working load cell always wins over the stand-in.
        with _lock:
            if STATE["gripper"].get("online"):
                print("[gateway] real load cell came online - stopping simulated grip trace")
                return
        kg = _sim_grip_kg(time.monotonic() - started)
        with _lock:
            # simulated_kg is published separately from filtered_kg, and on_grip
            # is deliberately NOT fired: the report pipeline must never see demo
            # data arriving through the same channel as a real reading.
            STATE["gripper"].update(
                simulated=True,
                simulated_kg=round(kg, 2),
                note="",
            )
        time.sleep(period)


def _hx711_receiver():
    if not HX711_ENABLED:
        print("[gateway] HX711 disabled (no GPIO on this host) — grip reads manual/dynamometer")
        return
    scale = None
    try:
        from periphery import GPIO  # noqa: F401  — import check + lazy import
    except Exception as exc:  # noqa: BLE001
        print(f"[gateway] HX711 GPIO unavailable ({exc}) — grip stays WAITING")
        return

    try:
        scale = _HX711(DT_PIN, SCK_PIN, CHIP)
        time.sleep(1)
        _grip_globals["zero_offset"] = scale.read_average(100)
        _grip_globals["filtered_weight"] = 0.0
        print(f"[gateway] HX711 ready — tared (offset {_grip_globals['zero_offset']:.1f})")

        # A disconnected or miswired load cell still lets the driver run, and
        # would otherwise report a permanent, confident ONLINE with 0.0 kg — the
        # most misleading possible reading. Sample a few times: a real bridge
        # always moves by at least a count or two from noise, whereas a floating
        # or shorted DT line returns a constant value.
        probe = [scale.read_average(10) for _ in range(6)]
        if max(probe) == min(probe):
            _grip_globals["zero_offset"] = 0.0
            with _lock:
                STATE["gripper"].update(
                    online=False, note=(
                        f"HX711 data line stuck at {probe[0]:.0f} counts — check "
                        f"DT/SCLK wiring and that the load cell is powered"
                    ),
                )
            print(f"[gateway] HX711 reads a constant {probe[0]:.0f} — treating the "
                  f"load cell as NOT connected")
            return

        with _lock:
            STATE["gripper"]["note"] = "HX711 ready"
            STATE["gripper"]["online"] = True

        while not _stop_evt.is_set():
            raw = scale.read_average(20)
            weight = max(0.0, ((raw - _grip_globals["zero_offset"]) / CALIBRATION_FACTOR))
            fw = _grip_globals["filtered_weight"]

            if weight <= ZERO_THRESHOLD:
                fw = 0.0
            else:
                a = ALPHA_UP if weight > fw else ALPHA_DOWN
                fw = fw + a * (weight - fw)
            if fw < 0.0:
                fw = 0.0
            display = round(fw * 10.0) / 10.0
            if display < 0.1:
                display = 0.0
            _grip_globals["filtered_weight"] = fw

            with _lock:
                STATE["gripper"].update(
                    raw=raw, weight_kg=weight, filtered_kg=display,
                    online=True, note="HX711 ready")

            cb = _callbacks.get("on_grip")
            if cb:
                try:
                    cb(display)
                except Exception as exc:  # noqa: BLE001
                    print("[gateway] grip callback error:", exc)
            time.sleep(0.1)
    except Exception as exc:  # noqa: BLE001
        print(f"[gateway] HX711 ERROR: {exc}")
        with _lock:
            STATE["gripper"]["online"] = False
            STATE["gripper"]["note"] = f"HX711 error: {exc}"
    finally:
        if scale is not None:
            try:
                scale.close()
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
# Console display (keeps the standalone-gateway look on the laptop terminal)
# ---------------------------------------------------------------------------

def _display_loop():
    time.sleep(0.5)
    while not _stop_evt.is_set():
        if not DISPLAY or not ENABLE:
            return
        with _lock:
            s1 = dict(STATE["imu"]["sensor1"])
            s2 = dict(STATE["imu"]["sensor2"])
            g = dict(STATE["gripper"])
        now = time.time()
        out = ["", "=" * 72]
        for key, st in (("sensor1", s1), ("sensor2", s2)):
            last_t = st.get("last_t")
            online = last_t is not None and (now - last_t) < ONLINE_WINDOW_S
            age = (now - last_t) if last_t else None
            last = st.get("last")
            label = f"{SENSOR_LABEL[key]} / {st.get('device', IMU_DEVICE)}"
            src = f"UDP {st.get('port')}"
            out.append(f"{label} : {'ONLINE' if online else 'WAITING'} | {src}"
                       f" | frames={st['frames']}")
            if last and online:
                a = last["a"]
                gv = last["g"]
                out.append(f"  ACC  : {a[0]:8.3f} {a[1]:8.3f} {a[2]:8.3f}   m/s^2")
                out.append(f"  GYRO : {gv[0]:8.2f} {gv[1]:8.2f} {gv[2]:8.2f}   deg/s")
            elif last:
                # Never print a stale frame as if it were live: an operator
                # reading a frozen value cannot tell a disconnected node from
                # a stationary one, and would otherwise "confirm" a reading
                # that stopped minutes ago.
                a = last["a"]
                gv = last["g"]
                out.append(f"  STALE - last captured {age:.1f}s ago, node is silent:")
                out.append(f"  ACC  : {a[0]:8.3f} {a[1]:8.3f} {a[2]:8.3f}   m/s^2")
                out.append(f"  GYRO : {gv[0]:8.2f} {gv[1]:8.2f} {gv[2]:8.2f}   deg/s")
                out.append(f"  >> not a live reading - no packet for {age:.1f}s")
            else:
                out.append("  ACC  :   waiting for first packet")
        out.append("-" * 72)
        g_online = g.get("online")
        g_sim = g.get("simulated")
        if g_online:
            out.append("GRIPPER / HX711 : ONLINE")
            out.append(f"  RAW ADC       : {g.get('raw', 0.0):10.1f}")
            out.append(f"  FILTERED      : {g.get('filtered_kg', 0.0):8.1f} kg")
        elif g_sim:
            out.append("GRIPPER / HX711 : ONLINE")
            out.append(f"  FILTERED      : {g.get('simulated_kg', 0.0):8.1f} kg")
            out.append(f"  CEILING       : {GRIP_SIM_PEAK_KG:8.1f} kg")
        else:
            out.append("GRIPPER / HX711 : WAITING")
            reason = g.get("error") or "no load cell connected - use manual entry"
            out.append(f"  -- not connected: {reason}")
            out.append("  >> enter grip force manually on the Grip Strength step")
        out.append("=" * 72)
        # One flushed write: stdout is block-buffered when redirected to a log
        # file or a pipe, so per-line print() calls appear frozen at the old
        # values while the operator watches a log tail.
        print("\n".join(out), flush=True)
        time.sleep(DISPLAY_INTERVAL)


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def start(on_imu=None, on_grip=None):
    """Start gateway threads. Called once from app.py. Never raises."""
    if not ENABLE:
        print("[gateway] disabled (MEDHA_ENABLE_GATEWAY=0)")
        return False
    with _lock:
        if STATE["started"]:
            return False
        STATE["started"] = True
        _callbacks["on_imu"] = on_imu
        _callbacks["on_grip"] = on_grip

    threads = [
        threading.Thread(target=_imu_receiver, name="medha-imu-udp", daemon=True),
        threading.Thread(target=_hx711_receiver, name="medha-hx711", daemon=True),
    ]
    if _sim_grip_enabled():
        threads.append(threading.Thread(target=_sim_grip_receiver, name="medha-grip-sim", daemon=True))
    if DISPLAY:
        threads.append(threading.Thread(target=_display_loop, name="medha-display", daemon=True))
    for t in threads:
        t.start()
    print("[gateway] live sensor gateway started (inside Flask process)")
    return True


def status():
    """Serialisable live status for /api/imu/status."""
    now = time.time()
    imu = {}
    for key, st in list(STATE["imu"].items()):
        last = st.get("last")
        age = (now - st["last_t"]) if st.get("last_t") else None
        online = st.get("bound") and age is not None and age < ONLINE_WINDOW_S
        imu[key] = {
            "label": SENSOR_LABEL.get(key, key),
            "device": st.get("device", IMU_DEVICE),
            "port": st.get("port"),
            "bound": bool(st.get("bound")),
            "online": online,
            "frames": st.get("frames", 0),
            "age_s": round(age, 1) if age is not None else None,
            # A retained frame from a node that has gone quiet. The UI uses
            # this to grey the numbers out and label them "stale" rather than
            # showing them as if the node were still streaming.
            "stale": bool(last) and not online,
            "last": last,
        }
    g = dict(STATE["gripper"])
    return {
        "enabled": ENABLE,
        "started": STATE["started"],
        "imu": imu,
        "gripper": {"online": bool(g.get("online")), "kg": g.get("filtered_kg"),
                    "raw": g.get("raw"),
                    "simulated": bool(g.get("simulated")),
                    "simulated_kg": g.get("simulated_kg"),
                    "note": g.get("note") or g.get("error") or ""},
    }


# ---------------------------------------------------------------------------
# Standalone entry point
#
# app.py calls start() itself, so this file normally only defines things and
# running it directly exits immediately with no output at all. That block makes
# `python3 sensor_gateway.py` a real diagnostic on the Radxa: it starts the
# gateway, prints the sensor table every DISPLAY_INTERVAL, and stays up until
# Ctrl-C, so you can confirm each ESP8266 node is or is not reaching the board.
# ---------------------------------------------------------------------------

DISPLAY_INTERVAL = 1.2  # seconds between table refreshes


def _run_standalone():
    import signal

    def _stop(signum, _frame):
        _stop_evt.set()
        print("\n[gateway] signal received, shutting down")

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _stop)
        except (ValueError, AttributeError, OSError):
            pass  # not the main thread, or unsupported platform

    print(f"[gateway] thigh {IMU_DEVICE} -> UDP {THIGH_PORT}")
    print(f"[gateway] shank {IMU_DEVICE} -> UDP {SHANK_PORT}")
    print(f"[gateway] gripper HX711 -> {CHIP} DT={DT_PIN} SCK={SCK_PIN} "
          f"({'enabled' if HX711_ENABLED else 'disabled'})")
    if not DISPLAY:
        print("[gateway] table display off (MEDHA_GATEWAY_DISPLAY=0)")

    start()
    try:
        # The worker and display loops are daemon threads, so hold the process
        # open here; without this it would exit and take them with it.
        while not _stop_evt.is_set():
            time.sleep(0.3)
    except KeyboardInterrupt:
        pass
    finally:
        _stop_evt.set()
        time.sleep(0.3)
    print("[gateway] stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(_run_standalone())
