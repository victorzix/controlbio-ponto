import { describe, it, expect, afterEach } from "vitest";
import { isSyncEnabled, initialSyncStatus } from "./enabled";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("isSyncEnabled", () => {
  it("desligada sem token de serviço", () => {
    delete process.env.CLICKUP_API_TOKEN;
    expect(isSyncEnabled()).toBe(false);
  });

  it("desligada quando CLICKUP_SYNC_ENABLED=false", () => {
    process.env.CLICKUP_API_TOKEN = "pk_x";
    process.env.CLICKUP_TEAM_ID = "1";
    process.env.CLICKUP_SYNC_ENABLED = "false";
    expect(isSyncEnabled()).toBe(false);
  });

  it("ligada com token e team id", () => {
    process.env.CLICKUP_API_TOKEN = "pk_x";
    process.env.CLICKUP_TEAM_ID = "1";
    delete process.env.CLICKUP_SYNC_ENABLED;
    expect(isSyncEnabled()).toBe(true);
  });

  it("registro nasce 'off' com a integração desligada", () => {
    delete process.env.CLICKUP_API_TOKEN;
    expect(initialSyncStatus()).toBe("off");
  });
});
