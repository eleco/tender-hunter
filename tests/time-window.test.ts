import test from "node:test";
import assert from "node:assert/strict";
import { isOnOrAfter, maxTimestamp, startOfUtcDay } from "@/lib/time-window";

test("maxTimestamp returns the latest valid timestamp", () => {
  assert.equal(
    maxTimestamp(
      "2026-04-01T10:00:00.000Z",
      null,
      "2026-04-02T09:00:00.000Z",
      "2026-04-01T23:59:59.000Z",
    ),
    "2026-04-02T09:00:00.000Z",
  );
});

test("isOnOrAfter applies an exact rolling cutoff", () => {
  assert.equal(isOnOrAfter("2026-04-02T10:00:00.000Z", "2026-04-02T10:00:00.000Z"), true);
  assert.equal(isOnOrAfter("2026-04-02T09:59:59.000Z", "2026-04-02T10:00:00.000Z"), false);
});

test("startOfUtcDay normalizes timestamps to midnight UTC", () => {
  assert.equal(startOfUtcDay("2026-04-02T18:45:12.000Z"), "2026-04-02T00:00:00.000Z");
});
