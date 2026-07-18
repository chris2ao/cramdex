import { createStore } from "./store";
import type { Store } from "./store";

export type TopicStats = { got: number; missed: number; updatedAt: number };
export type MasteryState = { topics: Record<string, TopicStats> };

const INITIAL: MasteryState = { topics: {} };

function isTopicStats(v: unknown): v is TopicStats {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Partial<TopicStats>;
  return typeof t.got === "number" && typeof t.missed === "number" && typeof t.updatedAt === "number";
}

function isMasteryState(v: unknown): v is MasteryState {
  if (typeof v !== "object" || v === null) return false;
  const topics = (v as Partial<MasteryState>).topics;
  if (typeof topics !== "object" || topics === null) return false;
  return Object.values(topics).every(isTopicStats);
}

export const masteryStore: Store<MasteryState> = createStore("cramdex.mastery", isMasteryState, INITIAL);

/** Records a quiz grade for a topic, accumulating got/missed counts. */
export function recordGrade(topic: string, got: boolean): void {
  masteryStore.set((state) => {
    const prev = state.topics[topic] ?? { got: 0, missed: 0, updatedAt: 0 };
    return {
      topics: {
        ...state.topics,
        [topic]: { got: prev.got + (got ? 1 : 0), missed: prev.missed + (got ? 0 : 1), updatedAt: Date.now() },
      },
    };
  });
}

/** Mastery percentage for a topic (0-100), or null if there have been no attempts. */
export function topicMastery(state: MasteryState, topic: string): number | null {
  const t = state.topics[topic];
  const attempts = (t?.got ?? 0) + (t?.missed ?? 0);
  if (!t || attempts === 0) return null;
  return (t.got / attempts) * 100;
}

/** True when a topic has attempts and its mastery is below 50 percent. */
export function isWeak(state: MasteryState, topic: string): boolean {
  const mastery = topicMastery(state, topic);
  return mastery !== null && mastery < 50;
}
