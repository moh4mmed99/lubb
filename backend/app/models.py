from datetime import datetime
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


def new_id() -> str:
    return uuid4().hex[:12]


class Language(str, Enum):
    ar = "ar"
    en = "en"


class FloorMode(str, Enum):
    free = "free"
    one_at_a_time = "one_at_a_time"
    queue = "queue"


class MeetingStatus(str, Enum):
    scheduled = "scheduled"
    live = "live"
    ended = "ended"


class Participant(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    title: str | None = None
    device_id: str | None = None  # the button assigned to this person
    color: str = "#3b82f6"
    is_chair: bool = False


class Utterance(BaseModel):
    id: str = Field(default_factory=new_id)
    participant_id: str
    started_at: datetime
    ended_at: datetime
    text: str
    language: Language | None = None


class Decision(BaseModel):
    id: str = Field(default_factory=new_id)
    text: str


class Task(BaseModel):
    id: str = Field(default_factory=new_id)
    text: str
    owner_id: str | None = None
    due_date: str | None = None
    done: bool = False


class Report(BaseModel):
    summary: list[str] = []
    decisions: list[Decision] = []
    tasks: list[Task] = []
    language: Language = Language.ar
    approved: bool = False


class Meeting(BaseModel):
    id: str = Field(default_factory=new_id)
    title: str
    agenda: list[str] = []
    language: Language = Language.ar
    floor_mode: FloorMode = FloorMode.free
    status: MeetingStatus = MeetingStatus.scheduled
    participants: list[Participant] = []
    utterances: list[Utterance] = []
    report: Report | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None


class MeetingCreate(BaseModel):
    title: str
    agenda: list[str] = []
    language: Language = Language.ar
    floor_mode: FloorMode = FloorMode.free
    participants: list[Participant] = []
