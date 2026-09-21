export function nowVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

export function currentMonthVN(): string {
  return nowVN().slice(0, 7);
}
