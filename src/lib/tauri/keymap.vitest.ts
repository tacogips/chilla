import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getKeymapConfig, type KeymapConfigResponse } from "./keymap";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("keymap configuration IPC", () => {
  it("invokes the no-argument command and preserves omitted versus empty replacement lists", async () => {
    const response: KeymapConfigResponse = {
      path: "keymap.toml",
      config: {
        mgr: {
          prepend_keymap: [
            {
              on: ["g", "f"],
              run: ["filter", "view.toggle"],
              desc: "Find files",
            },
          ],
        },
        workspace: { keymap: [] },
      },
      error: null,
    };
    vi.mocked(invoke).mockResolvedValue(response);
    const result = await getKeymapConfig();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("get_keymap_config");
    expect(result).toEqual(response);
    expect(result.config.mgr).not.toHaveProperty("keymap");
    expect(result.config.workspace?.keymap).toEqual([]);
  });

  it("preserves nullable path, absent sections and backend diagnostics", async () => {
    const response: KeymapConfigResponse = {
      path: null,
      config: {},
      error: "Unable to read keymap configuration. Using default shortcuts.",
    };
    vi.mocked(invoke).mockResolvedValue(response);
    const result = await getKeymapConfig();
    expect(result).toEqual(response);
    expect(result.config).not.toHaveProperty("mgr");
    expect(result.config).not.toHaveProperty("workspace");
  });

  it("propagates transport rejection for the controller's default fallback", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Transport unavailable"));
    await expect(getKeymapConfig()).rejects.toThrow("Transport unavailable");
  });
});
