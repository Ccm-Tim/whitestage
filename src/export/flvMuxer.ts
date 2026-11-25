/**
 * 极简 FLV H.264 muxer。
 * 只处理单路视频：AVC sequence header + 后续 AVCC NALU。
 * 输入来自 WebCodecs VideoEncoder（avc format）。
 */
interface EncodedVideoChunkLike {
  type: 'key' | 'delta'
  timestamp: number
  byteLength: number
  copyTo: (destination: Uint8Array) => void
}

interface EncoderMetadataLike {
  decoderConfig?: {
    description?: Uint8Array
  }
}

export class FlvMuxer {
  private parts: Uint8Array[] = []
  private sequence = false
  private headerWritten = false

  private write(bytes: Uint8Array) {
    this.parts.push(bytes)
  }

  private writeHeader() {
    if (this.headerWritten) return
    this.headerWritten = true
    this.write(
      new Uint8Array([
        0x46,
        0x4c,
        0x56,
        0x01,
        0x01,
        0x00,
        0x00,
        0x00,
        0x09,
        0x00,
        0x00,
        0x00,
        0x00,
      ]),
    )
  }

  private writeTag(type: number, timestampMs: number, body: Uint8Array) {
    const header = new Uint8Array(11)
    header[0] = type
    const size = body.byteLength
    header[1] = (size >> 16) & 0xff
    header[2] = (size >> 8) & 0xff
    header[3] = size & 0xff
    const ts = Math.max(0, Math.round(timestampMs))
    header[4] = (ts >> 16) & 0xff
    header[5] = (ts >> 8) & 0xff
    header[6] = ts & 0xff
    header[7] = (ts >> 24) & 0xff
    header[8] = 0
    header[9] = 0
    header[10] = 0
    this.write(header)
    this.write(body)
    const previous = 11 + size
    this.write(
      new Uint8Array([
        (previous >> 24) & 0xff,
        (previous >> 16) & 0xff,
        (previous >> 8) & 0xff,
        previous & 0xff,
      ]),
    )
  }

  addVideoChunk(chunk: EncodedVideoChunkLike, meta?: EncoderMetadataLike) {
    this.writeHeader()
    const description = meta?.decoderConfig?.description
    if (!this.sequence && description && description.byteLength > 0) {
      const body = new Uint8Array(5 + description.byteLength)
      body[0] = 0x17
      body[1] = 0x00
      body[2] = 0
      body[3] = 0
      body[4] = 0
      body.set(description, 5)
      this.writeTag(9, 0, body)
      this.sequence = true
    }
    if (!this.sequence) return
    const data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(data)
    const body = new Uint8Array(5 + data.byteLength)
    body[0] = chunk.type === 'key' ? 0x17 : 0x27
    body[1] = 0x01
    body[2] = 0
    body[3] = 0
    body[4] = 0
    body.set(data, 5)
    this.writeTag(9, chunk.timestamp / 1000, body)
  }

  finalize(): Uint8Array {
    const total = this.parts.reduce((sum, part) => sum + part.byteLength, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of this.parts) {
      out.set(part, offset)
      offset += part.byteLength
    }
    return out
  }
}
