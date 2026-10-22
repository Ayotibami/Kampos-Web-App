import { RetentionManager } from "./RetentionManager";

/**
 * /villagepeople/growth/retention — Day 1/7/30 retention, the weekly cohort
 * table, and the day-of-week x hour-of-day activity heatmap. Any admin
 * (same isIdiot tier as every endpoint it reads).
 */
export default function RetentionPage() {
  return <RetentionManager />;
}
