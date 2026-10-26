/**
 * CSV export for test data. Values are quoted when needed, and anything a
 * spreadsheet would run as a formula (starting with = + - @) gets a leading
 * apostrophe, so a downloaded file can't execute anything when opened
 * ("CSV injection").
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return `${[header, ...rows].map(row => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** Splits a persona ("Thea Ashford · @hellothea · thea.ashford@example.com") into columns. */
export function personaColumns(value: string): string[] {
  const [name = "", username = "", email = ""] = value.split(" · ");
  return [name, username.replace(/^@/, ""), email];
}
