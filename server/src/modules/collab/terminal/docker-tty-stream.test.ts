import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DockerTtyOutputParser } from './docker-tty-stream.js'

function muxFrame(stream: 1 | 2 | 3, payload: Buffer) {
  const header = Buffer.alloc(8)
  header[0] = stream
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

describe('docker tty output parser', () => {
  it('passes raw tty data unchanged', () => {
    const parser = new DockerTtyOutputParser()
    const input = Buffer.from('plain output\n', 'utf8')
    const output = parser.consume(input)

    assert.equal(output.length, 1)
    assert.equal(output[0]?.toString('utf8'), 'plain output\n')
  })

  it('demuxes docker framed output', () => {
    const parser = new DockerTtyOutputParser()
    const framed = muxFrame(1, Buffer.from('file1\nfile2\n', 'utf8'))
    const output = parser.consume(framed)

    assert.equal(output.length, 1)
    assert.equal(output[0]?.toString('utf8'), 'file1\nfile2\n')
  })

  it('handles split mux header and payload chunks', () => {
    const parser = new DockerTtyOutputParser()
    const framed = muxFrame(1, Buffer.from('abc', 'utf8'))

    const first = parser.consume(framed.subarray(0, 3))
    const second = parser.consume(framed.subarray(3, 9))
    const third = parser.consume(framed.subarray(9))

    assert.equal(first.length, 0)
    assert.equal(second.length, 0)
    assert.equal(third.length, 1)
    assert.equal(third[0]?.toString('utf8'), 'abc')
  })
})
