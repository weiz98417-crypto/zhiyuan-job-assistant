// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCoachBar } from "@/components/agent/assistant-ui/VoiceCoachBar";

const fetchMock = vi.fn();
const getUserMediaMock = vi.fn();
const stopTrackMock = vi.fn();
const closeContextMock = vi.fn(async () => undefined);

class TestAudioContext {
  sampleRate = 16_000;
  destination = {};
  close = closeContextMock;
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createScriptProcessor() { return { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null }; }
  createGain() { return { connect: vi.fn(), gain: { value: 0 } }; }
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("AudioContext", TestAudioContext);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: getUserMediaMock } });
  fetchMock.mockResolvedValue({ json: async () => ({ success: true, data: { enabled: true } }) });
  getUserMediaMock.mockResolvedValue({ getTracks: () => [{ stop: stopTrackMock }] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("voice recording lifecycle", () => {
  it("keeps the recording button enabled so pointer release stops the microphone", async () => {
    render(<VoiceCoachBar streaming={false} lastAssistantText="" onSendTranscript={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "按住说话" });
    fireEvent.pointerDown(button);
    await screen.findByRole("button", { name: "松开结束作答" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.pointerUp(button);
    await waitFor(() => expect(stopTrackMock).toHaveBeenCalledOnce());
  });

  it("releases a microphone acquired after the pointer has already been released", async () => {
    let resolveStream!: (stream: { getTracks: () => Array<{ stop: typeof stopTrackMock }> }) => void;
    getUserMediaMock.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    render(<VoiceCoachBar streaming={false} lastAssistantText="" onSendTranscript={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "按住说话" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    await act(async () => { resolveStream({ getTracks: () => [{ stop: stopTrackMock }] }); });
    expect(stopTrackMock).toHaveBeenCalledOnce();
    expect(closeContextMock).not.toHaveBeenCalled();
  });

  it("releases a microphone acquired after unmount without sending a transcript", async () => {
    const onSendTranscript = vi.fn();
    let resolveStream!: (stream: { getTracks: () => Array<{ stop: typeof stopTrackMock }> }) => void;
    getUserMediaMock.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    const view = render(<VoiceCoachBar streaming={false} lastAssistantText="" onSendTranscript={onSendTranscript} />);
    fireEvent.pointerDown(await screen.findByRole("button", { name: "按住说话" }));
    view.unmount();
    await act(async () => { resolveStream({ getTracks: () => [{ stop: stopTrackMock }] }); });
    expect(stopTrackMock).toHaveBeenCalledOnce();
    expect(onSendTranscript).not.toHaveBeenCalled();
  });

  it("handles TTS network failure with visible feedback", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("config")) return { json: async () => ({ success: true, data: { enabled: true } }) };
      throw new Error("Network disconnected");
    });
    render(<VoiceCoachBar streaming={false} lastAssistantText="你好。" onSendTranscript={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /语音模式/ }));
    expect(await screen.findByText(/语音播报失败/)).toBeTruthy();
  });
});
