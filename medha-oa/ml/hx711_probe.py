#!/usr/bin/env python3
"""Standalone HX711 / load-cell wiring check for the Radxa.

Run this on the board INSTEAD of the gateway while you are checking the grip
sensor. The gateway deliberately refuses to report a grip force when the HX711
returns a constant value, which is correct behaviour but hides the raw numbers
you need in order to tell "cell not connected" apart from "cell connected but
not loaded yet".

    python3 hx711_probe.py            # 60 samples, ~10 s
    python3 hx711_probe.py --samples 200
    python3 hx711_probe.py --dt 324 --sck 323 --chip /dev/gpiochip0

What to look for:

  * "data line is stuck"  -> DOUT is not moving at all. Check the DOUT/SCK
    wiring, 5 V on the HX711, and that the cell is actually on the board's
    amplifier. This is the usual cause of a flat 0.
  * values change when you press the cell -> wiring is fine, it was simply
    unloaded (or unloaded at tare time). Add load and re-read.
  * values change wildly with no load -> floating/loose cell leads.

A healthy cell with nothing on it usually sits near zero but still jitters by a
few counts. A dead data line reads exactly one number forever.
"""
import argparse
import statistics
import sys
import time


def parse_args():
    p = argparse.ArgumentParser(description="HX711 / load cell wiring check")
    # type=int matters: python-periphery treats a *string* first argument as a
    # line NAME and looks it up by name, so passing "324" fails with
    # 'GPIO line "324" not found by name' even when line 324 exists.
    p.add_argument("--dt", type=int, default=324, help="HX711 DOUT line offset (default 324)")
    p.add_argument("--sck", type=int, default=323, help="HX711 SCK line offset (default 323)")
    p.add_argument("--chip", default="/dev/gpiochip0", help="gpiochip device")
    p.add_argument("--samples", type=int, default=60, help="samples to read")
    p.add_argument("--interval", type=float, default=0.15, help="seconds between reads")
    p.add_argument("--list", action="store_true",
                   help="list the GPIO lines this chip actually exposes, then exit")
    p.add_argument("--diagnose", type=float, nargs="?", const=3.0, default=0, metavar="SECONDS",
                   help="sample DOUT's idle level without clocking, to tell an "
                        "unpowered HX711 from a wrong pin")
    p.add_argument("--scan", type=int, default=0, metavar="LINE",
                   help="sweep 25 line offsets from LINE looking for a live DOUT")
    return p.parse_args()


class HX711:
    """Minimal 24-bit HX711 read on python-periphery GPIO."""

    def __init__(self, dout_pin, sck_pin, chip):
        from periphery import GPIO

        self.dout = GPIO(chip, dout_pin, "in")
        self.sck = GPIO(chip, sck_pin, "out")
        self.sck.write(False)
        time.sleep(0.1)

    def read(self):
        # The chip pulls DOUT low when a fresh 24-bit word is ready.
        deadline = time.time() + 2.0
        while self.dout.read():
            if time.time() > deadline:
                raise TimeoutError("DOUT never went low - no data from HX711")
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
        if value & 0x800000:  # two's complement 24-bit
            value -= 0x1000000
        return value

    def close(self):
        try:
            self.sck.write(False)
            self.sck.close()
            self.dout.close()
        except Exception:
            pass


def list_lines(chip):
    """Show which lines the chip really exposes.

    The GPIO numbers in a board datasheet (PK3, PK4, GPIO323 ...) are *not*
    necessarily the line offsets Linux assigns, so the wiring table and the
    number the driver needs can differ.
    """
    import subprocess

    print(f"lines exposed by {chip}:")
    try:
        out = subprocess.run(["gpioinfo", chip], capture_output=True, text=True, timeout=15)
        if out.returncode == 0 and out.stdout.strip():
            for line in out.stdout.splitlines():
                print("  " + line)
            return True
        if out.stderr.strip():
            print("  gpioinfo said:", out.stderr.strip())
    except FileNotFoundError:
        print("  gpioinfo (libgpiod-tools) is not installed")
    except Exception as exc:
        print("  gpioinfo failed:", exc)

    try:
        from periphery import ChipInfo

        info = ChipInfo(chip)
        names = info.lines
        print(f"  periphery ChipInfo reports {len(names)} lines")
        for i, name in enumerate(names):
            print(f"    offset {i:<4} name={name!r}")
        return True
    except Exception as exc:
        print("  periphery ChipInfo failed:", exc)

    print()
    print("  Fall back to the sysfs view:")
    print("    cat /sys/class/gpio/export")
    print("    grep -i gpiochip /sys/kernel/debug/gpio 2>/dev/null")
    print("    dmesg | grep -i gpio")
    return False


def diagnose(dout_pin, sck_pin, chip, seconds=3.0):
    """Separate 'not powered / wrong pin' from 'alive but unloaded'.

    A working HX711 idles with DOUT HIGH and pulses it LOW about ten times a
    second when a conversion completes. So:

      DOUT mostly HIGH with ~10 LOW pulses/sec -> chip is alive, keep going
      DOUT constant LOW                        -> held low: no VCC, or DOUT
                                                  is wired to ground/the
                                                  wrong header pin
      DOUT constant HIGH                       -> floating: DOUT not really
                                                  connected to the HX711

    Reading 24 zero bits (what a plain read gives here) happens in the first
    case too if the code clocks faster than the chip, so the idle level is the
    reliable signal.
    """
    from periphery import GPIO

    try:
        dout = GPIO(chip, dout_pin, "in")
        sck = GPIO(chip, sck_pin, "out")
        sck.write(False)
    except Exception as exc:
        print(f"  cannot open lines {dout_pin}/{sck_pin}: {exc}")
        return 2

    print(f"  sampling DOUT (line {dout_pin}) idle level for {seconds:.0f}s,")
    print("  not clocking SCK. A live HX711 idles HIGH and pulses LOW.")
    print()

    samples = []
    end = time.time() + seconds
    while time.time() < end:
        samples.append(1 if dout.read() else 0)
        time.sleep(0.002)

    highs = sum(samples)
    lows = len(samples) - highs
    transitions = sum(1 for a, b in zip(samples, samples[1:]) if a != b)
    low_runs = 0
    prev = None
    for s in samples:
        if s == 0 and prev != 0:
            low_runs += 1
        prev = s

    pct_high = 100.0 * highs / len(samples) if samples else 0.0
    print(f"  samples        : {len(samples)}")
    print(f"  time HIGH      : {pct_high:.1f}%")
    print(f"  LOW pulses     : {low_runs}  (~10/s means the chip is converting)")
    print(f"  transitions    : {transitions}")
    print()

    if lows == 0:
        print("  VERDICT: DOUT never goes low - it is floating.")
        print("    DOUT is probably not actually connected to the HX711.")
        print("    Check the solder joint, and that pin 40 is the wire you think.")
        print("    Also try --scan to find the line the kernel exposes for it.")
    elif highs == 0:
        print("  VERDICT: DOUT is held LOW the whole time.")
        print("    That is what an UNPOWERED HX711 looks like, and what you get if")
        print("    DOUT is wired to GND or to the wrong header pin.")
        print("    1. confirm the HX711 VCC actually has voltage")
        print("       (3.3 V may be too low for the load cell excitation - most")
        print("        breakout boards want 5 V on VCC)")
        print("    2. confirm the ground is shared with the load cell")
        print("    3. confirm DOUT is on the pin you think, not a GND pin")
    else:
        print("  VERDICT: DOUT toggles - the HX711 is powered and converting.")
        print("    A reading of 0 on every sample then means the LOAD CELL side is")
        print("    dead, not the chip: check the cell's four wires, that it is")
        print("    plugged into the amplifier board, and that it is not a")
        print("    4-wire/3-wire cell wired as the wrong type.")

    dout.close()
    sck.close()
    return 0


def scan(chip, low, high, duration_per_pin=0.05):
    """Look for a DOUT line that ever goes LOW on its own.

    An idle-but-unconnected input usually sits HIGH, while a live HX711 pulses
    LOW. Sweeping a range of offsets can reveal that the kernel numbering of
    the pin you wired is different from the datasheet label.
    """
    from periphery import GPIO

    print(f"  scanning DOUT lines {low}..{high} on {chip}")
    print("  looking for a line that pulses LOW on its own (a live HX711).")
    print()
    print(f"  {'line':<7} {'HIGH%':<8} {'LOW pulses':<12} note")
    interesting = []
    for off in range(low, high + 1):
        try:
            g = GPIO(chip, off, "in")
        except Exception:
            continue
        try:
            reads = []
            end = time.time() + duration_per_pin
            while time.time() < end:
                reads.append(1 if g.read() else 0)
                time.sleep(0.002)
            if not reads:
                continue
            highs = sum(reads)
            lows = len(reads) - highs
            pulses = 0
            prev = 1
            for s in reads:
                if s == 0 and prev != 0:
                    pulses += 1
                prev = s
            note = ""
            if lows == len(reads):
                note = "held LOW"
            elif lows == 0:
                note = "idle HIGH"
            else:
                note = "PULSES -> looks like a live HX711 DOUT"
                interesting.append(off)
            print(f"  {off:<7} {100.0 * highs / len(reads):<8.1f} {pulses:<12} {note}")
        finally:
            try:
                g.close()
            except Exception:
                pass

    print()
    if interesting:
        print(f"  candidates: {interesting}")
        print("  re-run with the matching line as --dt.")
    else:
        print("  no line pulsed. Either the HX711 is unpowered, or DOUT is not")
        print("  connected to any of those lines.")
    return 0


def main():
    args = parse_args()

    if args.list:
        list_lines(args.chip)
        return 0

    print("HX711 / load cell wiring check")
    print(f"  chip   : {args.chip}")
    print(f"  DOUT   : {args.dt}")
    print(f"  SCK    : {args.sck}")
    print(f"  samples: {args.samples}")
    print()

    if args.diagnose:
        return diagnose(args.dt, args.sck, args.chip, seconds=args.diagnose)

    if args.scan:
        return scan(args.chip, args.scan, args.scan + 24)

    try:
        from periphery import GPIO  # noqa: F401
    except Exception as exc:
        print(f"  python-periphery is not available: {exc}")
        print("  install it with:  pip install python-periphery")
        return 2

    try:
        scale = HX711(args.dt, args.sck, args.chip)
    except Exception as exc:
        msg = str(exc)
        print(f"  could not open the GPIO lines: {msg}")
        print()
        if "not found by name" in msg:
            print("  The driver was handed a line NAME, not an offset.")
            print("  Run this to see what this chip actually exposes:")
            print("      python3 hx711_probe.py --list")
            print("  The datasheet label (PK3/PK4/GPIO323) is not always the same as")
            print("  the Linux line offset - find the two lines for the header pins")
            print("  you soldered to, then pass those offsets to --dt/--sck.")
        else:
            print("  - is another process holding the pins? stop the gateway first")
            print("  - is the user allowed to access /dev/gpiochip0? (periphery needs")
            print("    either root or membership of the gpio group)")
        return 2

    print("  reading... press or load the cell while this runs.")
    print()

    values = []
    try:
        for i in range(args.samples):
            try:
                v = scale.read()
            except TimeoutError as exc:
                print(f"  sample {i + 1:>4}: {exc}")
                break
            values.append(v)
            bar = "#" * min(40, abs(v) // 250)
            print(f"  sample {i + 1:>4}: raw {v:>10}  {bar}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n  interrupted")
    finally:
        scale.close()

    if not values:
        print("\n  no readings at all - the data line is not producing words.")
        return 1

    uniq = len(set(values))
    spread = max(values) - min(values)
    print()
    print(f"  readings : {len(values)}")
    print(f"  distinct : {uniq}")
    print(f"  min/max  : {min(values)} / {max(values)}")
    print(f"  mean     : {statistics.fmean(values):.1f}")
    print(f"  spread   : {spread}")
    print()

    if uniq == 1 or spread == 0:
        print("  VERDICT: data line is STUCK at a constant value.")
        print("    The gateway will (correctly) refuse to report a grip force.")
        print("    Check, in this order:")
        print("      1. HX711 has 5 V and a shared ground with the load cell")
        print("      2. DOUT and SCK are not swapped, and are the pins above")
        print("      3. the cell is plugged into the amplifier board, not loose")
        print("      4. try the other pin pair if this board numbers them differently")
        return 1

    if spread < 20:
        print("  VERDICT: line moves, but only barely.")
        print("    Wiring is probably right, but there is no load on the cell.")
        print("    Put weight on it and re-run; the numbers should swing.")
        return 0

    print("  VERDICT: healthy - the value responds.")
    print("    If the gateway still says WAITING, restart it so it re-tares.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
