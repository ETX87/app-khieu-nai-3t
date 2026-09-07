export function nowVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}
