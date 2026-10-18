"""Meeting storage in SQLite (one row per meeting, the Meeting model stored as JSON).

The data model is still moving, so a document per meeting keeps migrations trivial.
Call save() after every change to a meeting.
"""

import sqlite3
from pathlib import Path

from .config import settings
from .models import Meeting, MeetingStatus, Participant


class Store:
    def __init__(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
        self.db.commit()
        self.meetings: dict[str, Meeting] = {
            row[0]: Meeting.model_validate_json(row[1]) for row in self.db.execute("SELECT id, data FROM meetings")
        }
        for m in self.meetings.values():
            m.report_pending = False  # generation tasks don't survive a restart; the UI offers "generate again"
        # A meeting left live when the hub stopped is still the active one after a restart.
        live = [m for m in self.meetings.values() if m.status == MeetingStatus.live]
        self.active_meeting_id: str | None = live[0].id if live else None

    def add(self, meeting: Meeting) -> Meeting:
        self.meetings[meeting.id] = meeting
        return self.save(meeting)

    def save(self, meeting: Meeting) -> Meeting:
        if meeting.id not in self.meetings:  # deleted meanwhile (e.g. while its minutes were being written)
            return meeting
        self.db.execute(
            "INSERT OR REPLACE INTO meetings (id, data) VALUES (?, ?)", (meeting.id, meeting.model_dump_json())
        )
        self.db.commit()
        return meeting

    def delete(self, meeting_id: str) -> None:
        self.meetings.pop(meeting_id, None)
        self.db.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
        self.db.commit()

    def get(self, meeting_id: str) -> Meeting | None:
        return self.meetings.get(meeting_id)

    @property
    def active(self) -> Meeting | None:
        return self.meetings.get(self.active_meeting_id) if self.active_meeting_id else None

    def participant_for_device(self, device_id: str) -> Participant | None:
        meeting = self.active
        if not meeting:
            return None
        return next((p for p in meeting.participants if p.device_id == device_id), None)


store = Store(settings.db_path)
