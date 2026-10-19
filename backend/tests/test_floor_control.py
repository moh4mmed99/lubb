from app.floor_control import MUTED, READY, TALKING, WAITING, FloorController
from app.models import FloorMode


def test_free_mode_allows_up_to_max_concurrent():
    fc = FloorController(mode=FloorMode.free, max_concurrent=2)
    assert fc.request("a") == {"a": TALKING}
    assert fc.request("b") == {"b": TALKING}
    assert fc.request("c") == {"c": MUTED}


def test_one_at_a_time_mutes_others_then_frees_everyone():
    fc = FloorController(mode=FloorMode.one_at_a_time)
    assert fc.request("a") == {"a": TALKING, "*": MUTED}
    assert fc.request("b") == {"b": MUTED}
    assert fc.release("a") == {"*": READY}
    assert fc.request("b") == {"b": TALKING, "*": MUTED}


def test_queue_passes_floor_in_order():
    fc = FloorController(mode=FloorMode.queue)
    fc.request("a")
    assert fc.request("b") == {"b": WAITING}
    assert fc.request("c") == {"c": WAITING}
    assert fc.release("a") == {"a": READY, "b": TALKING}
    assert fc.release("c") == {"c": READY}  # left the queue
    assert fc.release("b") == {"b": READY}
    assert fc.talking == []


def test_chairman_mode_queues_requests_and_chair_grants():
    fc = FloorController(mode=FloorMode.chairman, chairs={"chair"})
    assert fc.request("a") == {"a": WAITING}
    assert fc.request("b") == {"b": WAITING}
    assert fc.release("a") == {}  # letting go of the button keeps the raised hand
    assert fc.grant("b") == {"b": TALKING}
    assert fc.queue == ["a"]
    assert fc.release("b") == {} and fc.is_talking("b")  # floor stays between presses
    assert fc.grant("a") == {"b": READY, "a": TALKING}
    assert fc.revoke() == {"a": READY}
    assert fc.talking == [] and fc.queue == []


def test_chairman_mode_chair_speaks_when_floor_is_free():
    fc = FloorController(mode=FloorMode.chairman, chairs={"chair"})
    assert fc.request("chair") == {"chair": TALKING}
    fc.revoke()
    fc.grant("x")
    assert fc.request("chair") == {"chair": WAITING}  # someone has the floor: the chair asks too
    assert fc.drop("x") == {"x": READY}
