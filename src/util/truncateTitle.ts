export function truncateTitle(title: string, maxLength = 38): string {
  if (!title) return "";
  return title.length > maxLength
    ? title.substring(0, maxLength) + "..."
    : title;
}

