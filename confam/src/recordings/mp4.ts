import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";

export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 120;
const MAX_BOXES = 10000;
interface Box { type: string; start: number; end: number; payload: number; }

function boxes(bytes: Buffer, start: number, end: number, budget: { remaining: number }): Box[] {
  const result: Box[] = [];
  let position = start;
  while (position < end) {
    if (--budget.remaining < 0 || end - position < 8) throw new Error("Unsupported or malformed MP4 box structure.");
    let size = bytes.readUInt32BE(position);
    const type = bytes.toString("ascii", position + 4, position + 8);
    let header = 8;
    if (size === 1) {
      if (end - position < 16) throw new Error("Truncated MP4 extended box.");
      const extended = bytes.readBigUInt64BE(position + 8);
      if (extended > BigInt(MAX_RECORDING_BYTES)) throw new Error("MP4 box exceeds the recording limit.");
      size = Number(extended); header = 16;
    } else if (size === 0) size = end - position;
    if (size < header || size > end - position) throw new Error("Invalid MP4 box size.");
    result.push({ type, start: position, end: position + size, payload: position + header });
    position += size;
  }
  return result;
}
function children(bytes: Buffer, box: Box, budget: { remaining: number }) { return boxes(bytes, box.payload, box.end, budget); }
function duration(bytes: Buffer, box: Box): number {
  const version = bytes[box.payload];
  const timeOffset = version === 0 ? 12 : version === 1 ? 20 : -1;
  const durationBytes = version === 0 ? 4 : 8;
  if (timeOffset < 0 || box.end - box.payload < timeOffset + 4 + durationBytes) throw new Error("Unsupported MP4 duration metadata.");
  const scale = bytes.readUInt32BE(box.payload + timeOffset);
  const ticks = version === 0 ? bytes.readUInt32BE(box.payload + timeOffset + 4) : Number(bytes.readBigUInt64BE(box.payload + timeOffset + 4));
  const seconds = ticks / scale;
  if (!Number.isSafeInteger(ticks) || !scale || !Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_RECORDING_SECONDS) {
    throw new Error("Recording duration must be known and no longer than 120 seconds.");
  }
  return seconds;
}

export function validateMp4(bytes: Buffer): { durationSeconds: number; videoTracks: number; } {
  if (bytes.length > MAX_RECORDING_BYTES || bytes.length < 32) throw new Error("Recording must be an MP4 of at most 10MiB.");
  const budget = { remaining: MAX_BOXES };
  const top = boxes(bytes, 0, bytes.length, budget);
  if (top.filter(({ type }) => type === "ftyp").length !== 1 || top.filter(({ type }) => type === "moov").length !== 1
    || top.some(({ type }) => type === "moof")) throw new Error("Ambiguous or fragmented MP4 containers are unsupported.");
  const format = top.find(({ type }) => type === "ftyp");
  const movie = top.find(({ type }) => type === "moov");
  if (!format || !movie || !top.some(({ type }) => type === "mdat") || format.end - format.payload < 8) throw new Error("Recording is not a supported MP4 video container.");
  if ((format.end - format.payload) % 4 !== 0) throw new Error("Malformed MP4 format brands.");
  const brands = [bytes.toString("ascii", format.payload, format.payload + 4)];
  for (let offset = format.payload + 8;offset < format.end;offset += 4) brands.push(bytes.toString("ascii", offset, offset + 4));
  if (!["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "dash"].some((brand) => brands.includes(brand))) throw new Error("Unsupported MP4 format brand.");
  const movieBoxes = children(bytes, movie, budget);
  if (movieBoxes.filter(({ type }) => type === "mvhd").length !== 1) throw new Error("Ambiguous MP4 movie duration.");
  const header = movieBoxes.find(({ type }) => type === "mvhd");
  if (!header) throw new Error("MP4 has no known movie duration.");
  let seconds = duration(bytes, header);
  let videoTracks = 0;
  for (const track of movieBoxes.filter(({ type }) => type === "trak")) {
    const trackBoxes = children(bytes, track, budget);
    if (trackBoxes.filter(({ type }) => type === "mdia").length > 1) throw new Error("Ambiguous MP4 media track.");
    const media = trackBoxes.find(({ type }) => type === "mdia");
    if (!media) continue;
    const mediaBoxes = children(bytes, media, budget);
    if (mediaBoxes.filter(({ type }) => type === "hdlr").length !== 1 || mediaBoxes.filter(({ type }) => type === "mdhd").length !== 1) throw new Error("Ambiguous MP4 media duration or handler.");
    const handler = mediaBoxes.find(({ type }) => type === "hdlr");
    if (!handler || handler.end - handler.payload < 12 || bytes.toString("ascii", handler.payload + 8, handler.payload + 12) !== "vide") continue;
    const mediaHeader = mediaBoxes.find(({ type }) => type === "mdhd");
    if (!mediaHeader) throw new Error("Video track has no known duration.");
    seconds = Math.max(seconds, duration(bytes, mediaHeader)); videoTracks += 1;
  }
  if (!videoTracks) throw new Error("MP4 contains no supported video track.");
  return { durationSeconds: seconds, videoTracks };
}

export async function readRecording(file: string) {
  if (path.extname(file).toLowerCase() !== ".mp4" || !(await lstat(file)).isFile()) throw new Error("Recording must be a regular MP4 file.");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const entry = await handle.stat();
    if (!entry.isFile() || entry.size > MAX_RECORDING_BYTES) throw new Error("Recording must be a regular MP4 of at most 10MiB.");
    const buffer = Buffer.alloc(MAX_RECORDING_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, size);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > MAX_RECORDING_BYTES) throw new Error("Recording exceeds 10MiB.");
    const bytes = buffer.subarray(0, size);
    return { bytes, ...validateMp4(bytes) };
  } finally { await handle.close(); }
}
