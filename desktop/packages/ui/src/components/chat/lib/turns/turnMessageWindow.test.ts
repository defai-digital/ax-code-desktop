import { describe, expect, test } from "vitest"

import {
  FULL_MESSAGE_WINDOW,
  TURN_MESSAGE_WINDOW_SIZE,
  TURN_MESSAGE_WINDOW_THRESHOLD,
  createTurnMessageWindowStore,
  initialMessageWindow,
  messageWindowContaining,
  openedFoldMessageWindow,
  revealNavigatedMessage,
} from "./turnMessageWindow"

describe("message window thresholds", () => {
  test("a turn at the threshold mounts whole, and a longer one keeps its newest steps", () => {
    expect(initialMessageWindow(0)).toEqual(FULL_MESSAGE_WINDOW)
    expect(initialMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD)).toEqual(FULL_MESSAGE_WINDOW)
    const hidden = TURN_MESSAGE_WINDOW_THRESHOLD + 1 - TURN_MESSAGE_WINDOW_SIZE
    expect(initialMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD + 1)).toEqual({ hiddenHead: hidden, hiddenTail: 0 })
    expect(initialMessageWindow(100)).toEqual({ hiddenHead: 100 - TURN_MESSAGE_WINDOW_SIZE, hiddenTail: 0 })
  })

  test("a short fold opens whole from either end", () => {
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD, true)).toEqual(FULL_MESSAGE_WINDOW)
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD, false)).toEqual(FULL_MESSAGE_WINDOW)
  })

  test("a long fold keeps the end that stays on screen", () => {
    const hidden = TURN_MESSAGE_WINDOW_THRESHOLD + 1 - TURN_MESSAGE_WINDOW_SIZE
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD + 1, true)).toEqual({
      hiddenHead: hidden,
      hiddenTail: 0,
    })
    expect(openedFoldMessageWindow(TURN_MESSAGE_WINDOW_THRESHOLD + 1, false)).toEqual({
      hiddenHead: 0,
      hiddenTail: hidden,
    })
    expect(openedFoldMessageWindow(100, true)).toEqual({ hiddenHead: 100 - TURN_MESSAGE_WINDOW_SIZE, hiddenTail: 0 })
    expect(openedFoldMessageWindow(100, false)).toEqual({ hiddenHead: 0, hiddenTail: 100 - TURN_MESSAGE_WINDOW_SIZE })
  })
})

describe("navigation window", () => {
  test("extends a head window down through the requested step", () => {
    expect(messageWindowContaining({ hiddenHead: 80, hiddenTail: 0 }, 100, 10)).toEqual({
      hiddenHead: 10,
      hiddenTail: 0,
    })
  })

  test("extends a tail window through the requested step", () => {
    expect(messageWindowContaining(openedFoldMessageWindow(100, false), 100, 80)).toEqual({
      hiddenHead: 0,
      hiddenTail: 19,
    })
  })

  test("leaves a window that already shows the step", () => {
    const current = openedFoldMessageWindow(100, false)
    expect(messageWindowContaining(current, 100, 5)).toEqual(current)
  })

  test("an index outside the turn mounts the whole turn", () => {
    expect(messageWindowContaining({ hiddenHead: 40, hiddenTail: 10 }, 100, -1)).toEqual(FULL_MESSAGE_WINDOW)
    expect(messageWindowContaining({ hiddenHead: 40, hiddenTail: 10 }, 100, 100)).toEqual(FULL_MESSAGE_WINDOW)
  })

  test("revealNavigatedMessage writes the containing range", () => {
    const store = createTurnMessageWindowStore()
    store.setRange("turn", openedFoldMessageWindow(100, false))
    revealNavigatedMessage(store, "turn", 100, 80)
    expect(store.range("turn")).toEqual({ hiddenHead: 0, hiddenTail: 19 })
  })
})

describe("turn message window store", () => {
  test("setRange notifies subscribers and skips an unchanged range", () => {
    const store = createTurnMessageWindowStore()
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })
    const other = () => {
      notifications += 10
    }
    const unsubscribeOther = store.subscribe(other)

    expect(store.range("turn")).toBeUndefined()
    store.setRange("turn", { hiddenHead: 12, hiddenTail: 3 })
    expect(store.range("turn")).toEqual({ hiddenHead: 12, hiddenTail: 3 })
    expect(store.range("other")).toBeUndefined()
    expect(notifications).toBe(11)

    store.setRange("turn", { hiddenHead: 12, hiddenTail: 3 })
    expect(notifications).toBe(11)

    store.setRange("other", { hiddenHead: 1, hiddenTail: 0 })
    expect(notifications).toBe(22)
    expect(store.range("turn")).toEqual({ hiddenHead: 12, hiddenTail: 3 })

    unsubscribe()
    store.setRange("turn", FULL_MESSAGE_WINDOW)
    expect(notifications).toBe(32)
    expect(store.range("turn")).toEqual(FULL_MESSAGE_WINDOW)

    unsubscribeOther()
    store.setRange("turn", { hiddenHead: 0, hiddenTail: 4 })
    expect(notifications).toBe(32)
    expect(store.range("turn")).toEqual({ hiddenHead: 0, hiddenTail: 4 })
  })
})
