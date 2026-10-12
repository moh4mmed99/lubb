// Mirrors backend/app/models.py

export type Language = "ar" | "en";
export type FloorMode = "free" | "one_at_a_time" | "queue";
export type SpeakerState = "ready" | "talking" | "waiting" | "muted";

export interface Participant {
  id: string;
  name: string;
  title?: string | null;
  device_id?: string | null;
  color: string;
  is_chair?: boolean;
}

export interface Utterance {
  id: string;
  participant_id: string;
  started_at: string;
  ended_at: string;
  text: string;
  language?: Language | null;
}

export interface Decision {
  id: string;
  text: string;
}

export interface Task {
  id: string;
  text: string;
  owner_id?: string | null;
  due_date?: string | null;
  done: boolean;
}

export interface Report {
  summary: string[];
  decisions: Decision[];
  tasks: Task[];
  language: Language;
  approved: boolean;
}

export interface Meeting {
  id: string;
  title: string;
  agenda: string[];
  language: Language;
  floor_mode: FloorMode;
  status: "scheduled" | "live" | "ended";
  participants: Participant[];
  utterances: Utterance[];
  report?: Report | null;
  started_at?: string | null;
  ended_at?: string | null;
}

// Events pushed by the hub on /api/meetings/ws
export type HubEvent =
  | { type: "utterance"; utterance: Utterance }
  | { type: "speaker_state"; device_id: string; state: SpeakerState }
  | { type: "device_connected" | "device_disconnected"; device_id: string }
  | { type: "battery"; device_id: string; level: number }
  | { type: "meeting_started" | "meeting_ended"; meeting_id: string };
