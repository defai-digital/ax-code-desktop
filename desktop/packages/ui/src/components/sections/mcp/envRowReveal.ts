// Which env rows stay revealed when one is removed.
//
// The rows are identified by their position in the list, so removing one moves every row below it
// up by one. Carrying the positions over unchanged printed the next row's secret in plain text and
// masked the row the user had actually revealed.

export const revealedRowsAfterRemoval = (revealed: ReadonlySet<number>, removedIndex: number): Set<number> =>
  new Set(
    [...revealed]
      .filter((index) => index !== removedIndex)
      .map((index) => (index > removedIndex ? index - 1 : index)),
  )
