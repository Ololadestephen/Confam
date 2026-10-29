import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { expect, it } from "vitest";
import { MAX_RECORDING_BYTES, readRecording, validateMp4 } from "./mp4.js";
import { sampleMp4 } from "./fixtures.test-helper.js";
it("reads bounded MP4 video-track and movie durations", () => {
  expect(validateMp4(sampleMp4(3))).toEqual({ durationSeconds: 3, videoTracks: 1 });
});
it("rejects renamed media, unknown duration and clips beyond the limit", () => {
  expect(() => validateMp4(Buffer.from("This is a renamed non-video file with enough bytes."))).toThrow();
  expect(() => validateMp4(sampleMp4(0))).toThrow("duration");
  expect(() => validateMp4(sampleMp4(121))).toThrow("duration");
});
it("rejects corrupt/oversized boxes instead of reading beyond the bounded buffer", () => {
  const bytes = sampleMp4(); bytes.writeUInt32BE(0xffffffff, 0);
  expect(() => validateMp4(bytes)).toThrow("size");
  expect(() => validateMp4(Buffer.alloc(MAX_RECORDING_BYTES + 1))).toThrow("10MiB");
});
it("refuses source symlinks and preserves validated bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "confam-mp4-"));
  try {
    const file = path.join(directory, "clip.mp4"); await writeFile(file, sampleMp4());
    expect((await readRecording(file)).bytes).toEqual(sampleMp4());
    await symlink(file, path.join(directory, "link.mp4"));
    await expect(readRecording(path.join(directory, "link.mp4"))).rejects.toThrow("regular MP4");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("rejects ambiguous movie headers and fragmented containers", () => {
  const bytes = sampleMp4();
  const duplicateMovie = bytes.subarray(20, bytes.length - 12);
  expect(() => validateMp4(Buffer.concat([bytes, duplicateMovie]))).toThrow("Ambiguous");
  const fragment = Buffer.alloc(8); fragment.writeUInt32BE(8); fragment.write("moof", 4, "ascii");
  expect(() => validateMp4(Buffer.concat([bytes, fragment]))).toThrow("fragmented");
});
