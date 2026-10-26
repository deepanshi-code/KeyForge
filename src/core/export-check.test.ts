import { describe, expect, it } from "vitest";
import { checkDotCom, checkGitHub, checkNpm, checksFor, forService } from "./availability.ts";
import { personaColumns, toCsv } from "./csv.ts";

describe("CSV export", () => {
  it("quotes values that contain commas, quotes or line breaks", () => {
    expect(toCsv(["name"], [["a,b"], ['say "hi"'], ["plain"]])).toBe('name\r\n"a,b"\r\n"say ""hi"""\r\nplain\r\n');
  });

  it("neutralises values a spreadsheet would run as formulas", () => {
    expect(toCsv(["v"], [["=HYPERLINK(1)"], ["@user"], ["-1"]])).toBe("v\r\n'=HYPERLINK(1)\r\n'@user\r\n'-1\r\n");
  });

  it("splits a persona into name, username and email", () => {
    expect(personaColumns("Thea Ashford · @hellothea · thea.ashford@example.com"))
      .toEqual(["Thea Ashford", "hellothea", "thea.ashford@example.com"]);
  });
});

/** A fake fetch: maps URL fragments to HTTP status codes or JSON bodies. */
function fakeFetch(routes: Record<string, number | object>) {
  return async (url: string) => {
    const match = Object.entries(routes).find(([fragment]) => url.includes(fragment));
    if (!match) throw new Error("offline");
    const [, reply] = match;
    return typeof reply === "number"
      ? { status: reply, json: async () => ({}) }
      : { status: 200, json: async () => reply };
  };
}

describe("availability checks", () => {
  it("reads GitHub and npm answers from the HTTP status", async () => {
    const fetcher = fakeFetch({ "users/taken-name": 200, "users/free-name": 404, "registry.npmjs.org/free-name": 404 });
    expect((await checkGitHub("taken-name", fetcher)).status).toBe("taken");
    expect((await checkGitHub("free-name", fetcher)).status).toBe("free");
    expect((await checkNpm("free-name", fetcher)).status).toBe("free");
  });

  it("says unknown when rate-limited or offline, never a false 'free'", async () => {
    expect((await checkGitHub("busy", fakeFetch({ "users/busy": 403 }))).status).toBe("unknown");
    expect((await checkGitHub("anything", fakeFetch({}))).status).toBe("unknown");
  });

  it("rejects names a service would never accept", async () => {
    expect((await checkGitHub("has_underscore", fakeFetch({}))).status).toBe("invalid");
    expect((await checkGitHub("-starts-with-hyphen", fakeFetch({}))).status).toBe("invalid");
  });

  it("treats a missing domain (NXDOMAIN) as probably free", async () => {
    expect((await checkDotCom("vesperflux", fakeFetch({ "dns.google": { Status: 3 } }))).status).toBe("free");
    expect((await checkDotCom("google", fakeFetch({ "dns.google": { Status: 0 } }))).status).toBe("taken");
  });

  it("adapts the name to each service", () => {
    expect(forService("Cloud_Data")).toEqual({ github: "cloud_data", npm: "cloud_data", domain: "clouddata" });
  });

  it("only offers checks where they make sense", () => {
    expect(checksFor("username", "vesper_flux", fakeFetch({}))).toHaveLength(1);
    expect(checksFor("project-name", "Cloudata", fakeFetch({}))).toHaveLength(3);
    expect(checksFor("password", "x", fakeFetch({}))).toBeNull();
  });
});
