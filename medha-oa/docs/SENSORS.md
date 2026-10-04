# Connecting the IMU nodes and the Radxa

The screening dashboard runs on the **PC**. The ESP8266 IMU nodes (thigh +
shank) and the Radxa are separate devices on the same WiFi, so they send UDP
packets to the PC. Nothing needs to be installed on the Radxa for the IMU path
— it is a receiver, not a relay.

```
 ESP8266 thigh ──┐
                 ├─ UDP 5005/5006 ──► PC ─ ml/server.py ─► /api/imu ─► browser
 ESP8266 shank ──┘                    (0.0.0.0 bind)      (Next proxy)
```

## 0. If the nodes are already pointed at the Radxa

The nodes send to **one fixed address** baked into their firmware, and they
only ever send to that one address. If the firmware targets the Radxa, the PC
receives nothing and the dashboard sits at `WAITING` forever — even though the
board's terminal shows both nodes `ONLINE` with thousands of frames.

Check which side is actually receiving:

```bash
# on the PC
curl -s http://127.0.0.1:3000/api/imu | python -m json.tool | grep -E 'frames|online'
```

`frames: 0` while the Radxa counts frames means the split is in the network, not
in the code. Two ways out:

**Option A — point the firmware at the PC** (cleanest, no extra hop). Set
`PC_IP` in the sketch to the address `ml:serve` printed, and reflash. The catch
is that the PC address usually comes from DHCP and can change, which would
silently break it again later.

**Option B — relay from the Radxa** (no reflash, survives IP changes). Set the
environment variables on the board and the gateway re-sends every frame it
decodes to the PC, byte-for-byte:

```bash
cd ~/oa_screening/acquisition
MEDHA_GATEWAY_RELAY_HOST=192.168.50.1 \
MEDHA_GATEWAY_RELAY_PORT=5005 \
MEDHA_GATEWAY_RELAY_PORT_SHANK=5006 \
python3 sensor_gateway.py
```

The startup line confirms it took effect, and **both ports must be shown**:

```
[gateway] relaying frames upstream to 192.168.50.1 (sensor1->5005, sensor2->5006)
```

If it only mentions one port, the board is running an older `sensor_gateway.py`
and every shank frame is being counted as a thigh frame. That failure is easy to
miss: the thigh frame counter climbs, the site shows both nodes ONLINE, and the
thigh's live values flicker between the two legs' orientations.

Use the address the **board can actually route to**. A host often owns several
interfaces, and the PC prints them all at startup:

```
[medha-ml] IMU nodes should target this PC: 10.62.140.193 (UDP 5005/5006)
[medha-ml] other local addresses, in case that one is on a subnet the sensors
           cannot route to: 192.168.50.1
```

`Network is unreachable` from the board means no route to that subnet, not a
firewall problem. Pin the right one with `MEDHA_LAN_IP`.

The PC still does all the scoring, so the coefficients exist in exactly one place.
Set the relay on the **board only** — if the PC copy also had it enabled the two
would forward frames back and forth forever.

To make Option B permanent, drop a line into `~/.profile`:

```bash
export MEDHA_GATEWAY_RELAY_HOST=192.168.50.1
export MEDHA_GATEWAY_RELAY_PORT=5005
export MEDHA_GATEWAY_RELAY_PORT_SHANK=5006
```

## 1. Start the service

```bash
npm run ml:serve
```

On startup it prints the address to aim the nodes at:

```
[medha-ml] IMU nodes should target this PC: 192.168.1.50 (UDP 5005/5006)
```

The same value is available at any time from `GET /api/imu` as `lanAddress`,
and shown in the IMU step under **Live sensors**. **Use the printed address,
not `127.0.0.1`** — the nodes cannot reach loopback.

`npm run ml:serve` must stay running for live sensors. The X-ray step needs
it too, so there is only one service to manage.

## 2. Point the firmware at that address

Each node needs the PC's LAN address baked in. In the ESP8266 sketch, set the
destination before `WiFiUDP.begin(localPort)`:

```cpp
static IPAddress PC_IP(192, 168, 1, 50);   // <- the address ml:serve printed
WiFiUDP udp;

void sendFrame() {
  uint32_t ts = (uint32_t)(micros() & 0xFFFFFFFFULL);  // MUST be 32-bit
  char buf[36];
  int n = serializeFloats(buf, ax, ay, az, gx, gy, gz, tempC);
  uint32_t seq = frameCounter++;
  buf[0] = seq & 0xFF;            buf[1] = (seq >> 8) & 0xFF;
  buf[2] = (seq >> 16) & 0xFF;    buf[3] = (seq >> 24) & 0xFF;
  buf[4] = ts & 0xFF;  buf[5] = (ts >> 8) & 0xFF;
  buf[6] = (ts >> 16) & 0xFF; buf[7] = (ts >> 24) & 0xFF;
  memcpy(buf + 8, buf, 28);
  udp.writeTo(buf, 36, PC_IP, (thigh ? 5005 : 5006));
}
```

Two details that fail **silently** if wrong — the node then shows `WAITING`
with `frames=0` and no error anywhere:

| Requirement | Symptom if wrong |
|---|---|
| Packet is exactly **36** bytes (`<IIfffffff` = 2×uint32 + 7×float32) | every packet rejected on length |
| `ts_us` truncated to 32 bits (`micros() & 0xFFFFFFFF`) | `struct.unpack` raises, frames dropped |
| Thigh → port **5005**, shank → **5006** | one node stays `WAITING` |

The firmware does not need to change otherwise; the packet format and ports are
the same as the original gateway.

## 3. Allow UDP through the firewall

Windows blocks inbound UDP by default, so the first run after switching
networks usually shows `bound: true` but `online: false`. Either allow it once
per network, or add a permanent rule from an **administrator** prompt:

```powershell
New-NetFirewallRule -DisplayName "MEDHA IMU 5005" -Direction Inbound -Protocol UDP -LocalPort 5005 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "MEDHA IMU 5006" -Direction Inbound -Protocol UDP -LocalPort 5006 -Action Allow -Profile Private
```

Use `-Profile Private` deliberately: do not open these on a public network.
The packets carry only accelerometer/gyro telemetry and accept no commands,
but there is no reason to widen the rule beyond a trusted LAN.

Quick check that the PC is reachable at all — run this on the Radxa:

```bash
ping -c 3 192.168.1.50        # substitute the printed address
```

## When the load cell reads a constant value

`GRIPPER / HX711 : ONLINE` with `RAW ADC 0.0` used to be reported as a working
sensor, which is the most misleading reading possible — a confident `0.0 kg`
looks like a real measurement. The driver now samples the bridge a few times
after taring, and a real load cell always moves by at least a count or two from
noise. A constant value means the data line is stuck, so the gateway reports:

```
[gateway] HX711 reads a constant 0 — treating the load cell as NOT connected
```

and the grip step falls back to manual entry instead of recording a zero. When
that happens, check that the load cell itself is powered, that `DT`/`SCK`
(GPIO 324/323 by default) match the wiring, and that the amplifier board's
analog side is shared with the board's ground.

The PC-hosted gateway never shows a load cell at all: the HX711 driver needs
Linux GPIO, so it auto-disables elsewhere and the UI says the load cell is
absent rather than reporting 0 kg.

## 4. Confirm the path before involving the browser

The terminal table is the fastest signal. Run `ml:serve` and watch:

```
THIGH / ESP8266 : WAITING | UDP 5005 | frames=0
  ACC  :   waiting for first packet
```

then, with the nodes powered:

```
THIGH / ESP8266 : ONLINE | UDP 5005 | frames=2841
  ACC  :   0.052    9.794    0.037
  GYRO :    1.20    -0.40     0.15
```

- `bound: true, online: false` → firewall, wrong IP, or node not on the same
  WiFi.
- `online: true` but the browser shows `WAITING` → the browser is talking to a
  different service instance (see below).

## Running the gateway on the Radxa instead

To check the wiring on the board itself, `ml/sensor_gateway.py` also runs
standalone:

```bash
cd ~/oa_screening/acquisition
python3 sensor_gateway.py
```

It prints the same table. Two caveats:

- Ports 5005/5006 are unprivileged, so **do not use `sudo`**. Running as root
  leaves root-owned files and can break later `pip`/`git` work.
- On the Radxa the HX711 also works, if one is wired to GPIO 323/324. In that
  setup the load cell is read on the board, and this PC-hosted gateway will
  report the grip load cell as absent — use manual/dynamometer entry until the
  board pushes readings across.

## Only one service may own the ports

A stale `ml/server.py` from an earlier session silently hijacks the port on
Windows: Flask sets `allow_reuse_address`, so a second process binds 8000
successfully and requests are served by whichever process the OS picks. The
symptom is a new endpoint returning `{"error":"Unknown endpoint."}` from old
code. Check before starting:

```powershell
Get-NetTCPConnection -LocalPort 8000,5005,5006 -State Listen |
  Select-Object LocalPort, OwningProcess
```

Kill the old PID, or just run `npm run ml:serve` again.

## Environment overrides

| Variable | Default | Meaning |
|---|---|---|
| `MEDHA_ENABLE_GATEWAY` | `1` | `0` disables the gateway entirely |
| `MEDHA_GATEWAY_DISPLAY` | `1` | `0` silences the terminal table |
| `MEDHA_IMU_THIGH_PORT` | `5005` | thigh UDP port |
| `MEDHA_IMU_SHANK_PORT` | `5006` | shank UDP port |
| `MEDHA_IMU_MIN_FRAMES` | `10` | frames needed before a trial can be scored |
| `MEDHA_IMU_REQUIRE_BOTH` | `0` | `1` refuses to score with only one IMU |
| `MEDHA_HX711_ENABLED` | `1` on Linux, else `0` | force the load cell on/off |
| `MEDHA_GATEWAY_RELAY_HOST` | *(empty)* | re-send every received frame to this host |
| `MEDHA_GATEWAY_RELAY_PORT` | `0` | upstream port for **sensor1 / thigh** |
| `MEDHA_GATEWAY_RELAY_PORT_SHANK` | *thigh port + 1* | upstream port for **sensor2 / shank** — must differ, or both legs are counted as one |
| `MEDHA_ML_URL` | `http://127.0.0.1:8000` | where the Next proxy looks for the service |

## Reproducing the pipeline without hardware

`ml/live_udp_test.py`-style senders exercise the whole path. A healthy
reference stance should score **low** (risk ≈ 2, vibration ≈ 0.22 m/s²); if
your numbers are wildly different, the signal is wrong before the score is.
