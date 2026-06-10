/** Stable, dedup-friendly id from a type + name, e.g. "food-deans". */
export function slugId(type: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${type}-${slug}`;
}
