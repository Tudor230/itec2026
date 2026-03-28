const DEFAULT_MAX_DOCKER_FRAME_BYTES = 4 * 1024 * 1024

type DockerStreamMode = 'unknown' | 'mux' | 'raw'

function matchesMuxPrefix(buffer: Buffer) {
  if (buffer.length >= 1 && buffer[0] !== 1 && buffer[0] !== 2 && buffer[0] !== 3) {
    return false
  }

  if (buffer.length >= 2 && buffer[1] !== 0) {
    return false
  }

  if (buffer.length >= 3 && buffer[2] !== 0) {
    return false
  }

  if (buffer.length >= 4 && buffer[3] !== 0) {
    return false
  }

  return true
}

function hasMuxHeader(buffer: Buffer, maxFrameBytes: number) {
  if (buffer.length < 8) {
    return false
  }

  const streamType = buffer[0]
  const headerZeros = buffer[1] === 0 && buffer[2] === 0 && buffer[3] === 0
  const frameLength = buffer.readUInt32BE(4)

  if (!headerZeros) {
    return false
  }

  if (streamType !== 1 && streamType !== 2 && streamType !== 3) {
    return false
  }

  if (frameLength > maxFrameBytes) {
    return false
  }

  return true
}

export class DockerTtyOutputParser {
  private mode: DockerStreamMode = 'unknown'

  private pending = Buffer.alloc(0)

  constructor(private readonly maxFrameBytes: number = DEFAULT_MAX_DOCKER_FRAME_BYTES) {}

  consume(chunk: Buffer): Buffer[] {
    if (this.mode === 'raw') {
      return [Buffer.from(chunk)]
    }

    this.pending = this.pending.length === 0
      ? Buffer.from(chunk)
      : Buffer.concat([this.pending, chunk])

    if (this.mode === 'unknown') {
      if (!matchesMuxPrefix(this.pending)) {
        this.mode = 'raw'
        const passthrough = this.pending
        this.pending = Buffer.alloc(0)
        return passthrough.length > 0 ? [passthrough] : []
      }

      if (this.pending.length < 8) {
        return []
      }

      if (!hasMuxHeader(this.pending, this.maxFrameBytes)) {
        this.mode = 'raw'
        const passthrough = this.pending
        this.pending = Buffer.alloc(0)
        return passthrough.length > 0 ? [passthrough] : []
      }

      this.mode = 'mux'
    }

    return this.readMuxFrames()
  }

  flush(): Buffer[] {
    if (this.pending.length === 0) {
      return []
    }

    if (this.mode === 'mux') {
      this.pending = Buffer.alloc(0)
      return []
    }

    const remainder = this.pending
    this.pending = Buffer.alloc(0)
    return [remainder]
  }

  private readMuxFrames(): Buffer[] {
    const payloads: Buffer[] = []

    while (this.pending.length >= 8) {
      if (!hasMuxHeader(this.pending, this.maxFrameBytes)) {
        this.mode = 'raw'
        const passthrough = this.pending
        this.pending = Buffer.alloc(0)
        if (passthrough.length > 0) {
          payloads.push(passthrough)
        }
        return payloads
      }

      const frameLength = this.pending.readUInt32BE(4)
      const totalFrameLength = 8 + frameLength
      if (this.pending.length < totalFrameLength) {
        break
      }

      const payload = this.pending.subarray(8, totalFrameLength)
      payloads.push(payload)
      this.pending = this.pending.subarray(totalFrameLength)
    }

    return payloads
  }
}
