export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number, threshold = 96) {
  return scrollHeight - scrollTop - clientHeight < threshold
}

