// Minimal container metadata for parser/transport tests. It is not playable footage.
export function sampleMp4(seconds = 2): Buffer {
  const box = (type: string, payload: Buffer) => {
    const header = Buffer.alloc(8); header.writeUInt32BE(payload.length + 8); header.write(type, 4, "ascii");
    return Buffer.concat([header, payload]);
  };
  const header = Buffer.alloc(32); header.writeUInt32BE(1000, 12); header.writeUInt32BE(Math.floor(seconds * 1000), 16);
  const handler = Buffer.alloc(12); handler.write("vide", 8, "ascii");
  const media = box("mdia", Buffer.concat([box("mdhd", header), box("hdlr", handler)]));
  return Buffer.concat([box("ftyp", Buffer.from("isom\0\0\0\0mp42", "ascii")),
  box("moov", Buffer.concat([box("mvhd", header), box("trak", media)])), box("mdat", Buffer.from([1, 2, 3, 4]))]);
}
