export function filterAdminItemsBySearch<TItem>(items: TItem[], search: string, toSearchText: (item: TItem) => string): TItem[] {
  const query = search.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => toSearchText(item).toLowerCase().includes(query));
}
