function readSyncsafeInt(buffer, offset) {
  if (buffer.length < offset + 4) {
    return null;
  }
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function stripLeadingId3(buffer) {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString('ascii') !== 'ID3') {
    return buffer;
  }
  const tagSize = readSyncsafeInt(buffer, 6);
  if (tagSize === null) {
    return buffer;
  }
  const footerSize = buffer[5] & 0x10 ? 10 : 0;
  const totalSize = 10 + tagSize + footerSize;
  return totalSize < buffer.length ? buffer.subarray(totalSize) : buffer;
}

function stripTrailingId3v1(buffer) {
  if (buffer.length < 128 || buffer.subarray(buffer.length - 128, buffer.length - 125).toString('ascii') !== 'TAG') {
    return buffer;
  }
  return buffer.subarray(0, buffer.length - 128);
}

export function normalizeMp3Chunk(buffer, index, count) {
  let next = buffer;
  if (index > 0) {
    next = stripLeadingId3(next);
  }
  if (index < count - 1) {
    next = stripTrailingId3v1(next);
  }
  return next;
}
