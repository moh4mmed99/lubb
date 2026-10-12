"""In-memory storage. Replace with PostgreSQL/SQLite once the data model settles."""

from .models import Meeting, Participant


class Store:
    def __init__(self) -> None:
        self.meetings: dict[str, Meeting] = {}
        self.active_meeting_id: str | None = None

    def add(self, meeting: Meeting) -> Meeting:
        self.meetings[meeting.id] = meeting
        return meeting

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


store = Store()
