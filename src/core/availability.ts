/**
 * Optional "is this name taken?" checks. They only run when the user clicks
 * Check (the name is then sent to that service), and they use public APIs that
 * allow browser requests, so there's still no KeyForge server.
 *
 *   GitHub  api.github.com/users/<name>   200 = taken, 404 = free (60 checks/hour)
 *   npm     registry.npmjs.org/<name>     200 = taken, 404 = free
 *   .com    dns.google DNS-over-HTTPS     NXDOMAIN = probably free
 *
 * A domain with no DNS records can still be registered, so ".com" says
 * "probably". Everything is a hint, not a guarantee.
 */
export type Availability = "free" | "taken" | "invalid" | "unknown";

export interface CheckResult {
  service: string;
  status: Availability;
  /** Where to look for yourself. */
  url: string;
}

type Fetch = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>;

const GITHUB_NAME = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;
const NPM_NAME = /^[a-z0-9][a-z0-9._-]{0,213}$/;

/** What a name looks like on each service: GitHub and npm are lowercase; domains drop separators. */
export function forService(value: string) {
  const lower = value.toLowerCase();
  return {
    github: lower,
    npm: lower,
    domain: lower.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, ""),
  };
}

async function byStatus(fetcher: Fetch, url: string): Promise<Availability> {
  try {
    const response = await fetcher(url);
    if (response.status === 200) return "taken";
    if (response.status === 404) return "free";
    return "unknown"; // e.g. 403 when GitHub's hourly limit is used up
  } catch {
    return "unknown"; // offline or blocked
  }
}

export async function checkGitHub(name: string, fetcher: Fetch = fetch): Promise<CheckResult> {
  const url = `https://github.com/${name}`;
  if (!GITHUB_NAME.test(name)) return { service: "GitHub", status: "invalid", url };
  return { service: "GitHub", status: await byStatus(fetcher, `https://api.github.com/users/${encodeURIComponent(name)}`), url };
}

export async function checkNpm(name: string, fetcher: Fetch = fetch): Promise<CheckResult> {
  const url = `https://www.npmjs.com/package/${name}`;
  if (!NPM_NAME.test(name)) return { service: "npm", status: "invalid", url };
  return { service: "npm", status: await byStatus(fetcher, `https://registry.npmjs.org/${encodeURIComponent(name)}`), url };
}

export async function checkDotCom(label: string, fetcher: Fetch = fetch): Promise<CheckResult> {
  const domain = `${label}.com`;
  const url = `https://www.whois.com/whois/${domain}`;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return { service: domain, status: "invalid", url };
  try {
    const response = await fetcher(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`);
    const data = (await response.json()) as { Status?: number };
    // DNS status 3 = NXDOMAIN (no such domain); 0 = it exists.
    const status: Availability = data.Status === 3 ? "free" : data.Status === 0 ? "taken" : "unknown";
    return { service: domain, status, url };
  } catch {
    return { service: domain, status: "unknown", url };
  }
}

/** Whether a generator's results can be checked at all. */
export const canCheck = (generatorId: string) => generatorId === "username" || generatorId === "project-name";

/** The checks that make sense for each generator. */
export function checksFor(generatorId: string, value: string, fetcher: Fetch = fetch): Promise<CheckResult>[] | null {
  const names = forService(value);
  if (generatorId === "username") return [checkGitHub(names.github, fetcher)];
  if (generatorId === "project-name") {
    return [checkGitHub(names.github, fetcher), checkNpm(names.npm, fetcher), checkDotCom(names.domain, fetcher)];
  }
  return null;
}
