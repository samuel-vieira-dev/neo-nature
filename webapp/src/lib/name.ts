/** "John Doe Smith" → "John". Used wherever we greet the customer. */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
