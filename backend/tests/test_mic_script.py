"""The USB-mic bridge (scripts/mic_button.py): mics found and numbered by USB port, and whose voice is whose."""

import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("mic_button", Path(__file__).resolve().parents[2] / "scripts" / "mic_button.py")
mb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mb)


def test_port_comes_from_the_usb_path():
    pc = "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-1/3-1.2/3-1.2:1.0/sound/card2"
    pi = "/sys/devices/platform/axi/1000120000.pcie/1f00300000.usb/xhci-hcd.1/usb3/3-1/3-1.4/3-1.4:1.0/sound/card1"
    assert mb.usb_port(pc) == "3-1.2"  # port 2 of the hub on bus 3, port 1
    assert mb.usb_port(pi) == "3-1.4"
    assert mb.usb_port("/sys/devices/platform/NVDA2014:00/sound/card0") is None  # built in, not USB


def test_identical_mics_are_numbered_by_port(monkeypatch):
    # two of the same model (same name) on hub ports 2 and 1, plugged in that order
    monkeypatch.setattr(
        mb,
        "list_mics",
        lambda: sorted(
            [{"card": "3", "port": "3-1.2", "name": "USBMIC"}, {"card": "2", "port": "3-1.1", "name": "USBMIC"}],
            key=lambda m: mb._natural(m["port"]),
        ),
    )
    seats = mb.seats_in_port_order()
    assert [(s.button, s.port, s.card) for s in seats] == [("btn-1", "3-1.1", "2"), ("btn-2", "3-1.2", "3")]


def test_with_the_socket_order_the_mic_in_socket_n_is_btn_n(monkeypatch):
    # the Unitek hub's chip numbers its sockets 2, 1, 4, 3; mics in sockets 1 and 3, and one more on another port
    monkeypatch.setattr(
        mb,
        "list_mics",
        lambda: [
            {"card": "1", "port": "1-1.4.2", "name": "USB_MIC"},
            {"card": "2", "port": "1-1.4.4", "name": "USB_MIC"},
            {"card": "3", "port": "1-1.4.5", "name": "USB_MIC"},
        ],
    )
    seats = mb.seats_in_port_order(sockets=mb.parse_sockets("2,1,4,3"))
    assert [(s.button, s.port) for s in seats] == [("btn-1", "1-1.4.2"), ("btn-3", "1-1.4.4"), ("btn-5", "1-1.4.5")]
    assert seats[1].label == "in socket 3 (USB port 1-1.4.4)"


def test_port_order_is_numeric():
    ports = ["3-1.10", "3-1.2", "3-1.4.1", "3-2"]
    assert sorted(ports, key=mb._natural) == ["3-1.2", "3-1.4.1", "3-1.10", "3-2"]


def test_a_voice_belongs_to_the_mic_that_hears_it_loudest():
    a, b = mb.VoiceGate(), mb.VoiceGate()

    def run(frames, level_a, level_b):
        events = []
        for _ in range(frames):
            ea = a.step(level_a, [b.lift] if b.room is not None else [])
            eb = b.step(level_b, [a.lift] if a.room is not None else [])
            events += [f"A {ea}"] if ea else []
            events += [f"B {eb}"] if eb else []
        return events

    assert run(50, -60, -60) == []  # both measure the room
    assert run(100, -20, -30) == ["A press"]  # A's speaker: B hears it too, quieter, and stays down
    assert run(60, -60, -60) == ["A release"]
    assert run(100, -30, -20) == ["B press"]
    assert run(60, -60, -60) == ["B release"]
