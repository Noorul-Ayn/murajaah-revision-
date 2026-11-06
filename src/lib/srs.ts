import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from 'ts-fsrs'
import type { ItemId, Mode } from './items'

/**
 * Spaced repetition (FSRS).
 *
 * The review log is the source of truth: an item's memory state is always
 * recomputed by replaying its reviews in time order. That makes syncing
 * between devices conflict-free — devices only exchange reviews, and every
 * device arrives at the same state from the same set of reviews.
 */

export type Grade3 = 'missed' | 'hesitated' | 'perfect'
export const GRADES: readonly Grade3[] = ['missed', 'hesitated', 'perfect']

export interface Review {
  /** UUID, unique across devices. */
  id: string
  itemId: ItemId
  grade: Grade3
  mode: Mode
  /** Time of the review, ms since epoch. */
  at: number
  /** 1 once the review is stored on the server. */
  synced: 0 | 1
}

/** A Card with dates stored as ms numbers, safe for IndexedDB and JSON. */
export interface StoredCard {
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: State
  lastReview: number | null
}

export interface ItemState {
  itemId: ItemId
  card: StoredCard
  reviewCount: number
  lastGrade: Grade3
  lastAt: number
}

const scheduler = fsrs(
  generatorParameters({
    // Deterministic, so every device replays the same log to the same state.
    enable_fuzz: false,
    enable_short_term: true,
    request_retention: 0.9,
    maximum_interval: 365,
  }),
)

const RATING: Record<Grade3, Grade> = {
  missed: Rating.Again,
  hesitated: Rating.Hard,
  perfect: Rating.Good,
}

function toStored(card: Card): StoredCard {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  }
}

function fromStored(c: StoredCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: 0,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview === null ? undefined : new Date(c.lastReview),
  }
}

export function compareReviews(a: Pick<Review, 'at' | 'id'>, b: Pick<Review, 'at' | 'id'>): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Replays all reviews of one item. Returns null when there are none. */
export function replay(itemId: ItemId, reviews: readonly Review[]): ItemState | null {
  const sorted = reviews.filter((r) => r.itemId === itemId).sort(compareReviews)
  const first = sorted[0]
  if (!first) return null
  let card = createEmptyCard(new Date(first.at))
  for (const r of sorted) {
    card = scheduler.next(card, new Date(r.at), RATING[r.grade]).card
  }
  const last = sorted[sorted.length - 1]!
  return {
    itemId,
    card: toStored(card),
    reviewCount: sorted.length,
    lastGrade: last.grade,
    lastAt: last.at,
  }
}

/** Probability (0–1) of recalling the item now, per FSRS. */
export function recall(state: ItemState, now: number): number {
  if (state.card.state === State.New) return 0
  return scheduler.get_retrievability(fromStored(state.card), new Date(now), false)
}

/**
 * How well an item is held: the chance of recalling it a week from now.
 * Recall right after a review is close to 1 whatever the answer was, so a
 * look-ahead is what tells a just-missed ayah apart from a well-known one.
 */
export const STRENGTH_HORIZON_MS = 7 * 24 * 60 * 60 * 1000

export function strength(state: ItemState, now: number): number {
  return recall(state, now + STRENGTH_HORIZON_MS)
}

export function isDue(state: ItemState, now: number): boolean {
  return state.card.due <= now
}

/** Strength buckets used for colours and labels. */
export type Strength = 'none' | 'weak' | 'shaky' | 'good' | 'strong'

export function strengthOf(r: number | null): Strength {
  if (r === null) return 'none'
  if (r < 0.6) return 'weak'
  if (r < 0.8) return 'shaky'
  if (r < 0.93) return 'good'
  return 'strong'
}
