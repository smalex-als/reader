export function resolveTrappedFocusIndex(
  currentIndex: number,
  itemCount: number,
  moveBackward: boolean
) {
  if (itemCount <= 0) {
    return -1;
  }
  if (currentIndex < 0) {
    return moveBackward ? itemCount - 1 : 0;
  }
  return moveBackward
    ? (currentIndex - 1 + itemCount) % itemCount
    : (currentIndex + 1) % itemCount;
}
