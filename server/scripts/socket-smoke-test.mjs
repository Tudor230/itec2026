import { io } from 'socket.io-client'

const serverUrl = process.env.SOCKET_TEST_SERVER_URL ?? 'http://localhost:4000'
const projectId = process.env.SOCKET_TEST_PROJECT_ID ?? 'phase0-smoke-project'
const authToken = process.env.SOCKET_TEST_TOKEN ?? 'Bearer dev-token'
const timeoutMs = Number(process.env.SOCKET_TEST_TIMEOUT_MS ?? 15000)

function makeTimeout(message) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
  })
}

function makeClient(label) {
  return io(serverUrl, {
    transports: ['websocket'],
    auth: { token: authToken },
  })
}

function waitForConnect(client, label) {
  return new Promise((resolve, reject) => {
    const onConnect = () => {
      cleanup()
      resolve(client.id)
    }

    const onError = (error) => {
      cleanup()
      reject(new Error(`${label} connect_error: ${String(error?.message ?? error)}`))
    }

    const cleanup = () => {
      client.off('connect', onConnect)
      client.off('connect_error', onError)
    }

    client.on('connect', onConnect)
    client.on('connect_error', onError)
  })
}

function waitForEvent(client, eventName, predicate, label) {
  return new Promise((resolve, reject) => {
    const handler = (payload) => {
      if (!predicate(payload)) {
        return
      }

      cleanup()
      resolve(payload)
    }

    const onError = (error) => {
      cleanup()
      reject(new Error(`${label} error: ${String(error?.message ?? error)}`))
    }

    const cleanup = () => {
      client.off(eventName, handler)
      client.off('connect_error', onError)
    }

    client.on(eventName, handler)
    client.on('connect_error', onError)
  })
}

async function run() {
  const clientA = makeClient('A')
  const clientB = makeClient('B')

  try {
    const connectA = waitForConnect(clientA, 'A')
    const connectB = waitForConnect(clientB, 'B')

    const [idA, idB] = await Promise.race([
      Promise.all([connectA, connectB]),
      makeTimeout('Timed out waiting for socket connections'),
    ])

    console.log(`A connected: ${idA}`)
    console.log(`B connected: ${idB}`)

    const joinedA = waitForEvent(
      clientA,
      'collab:presence',
      (payload) => payload?.type === 'joined' && payload?.projectId === projectId,
      'A joined listener',
    )
    const joinedB = waitForEvent(
      clientB,
      'collab:presence',
      (payload) => payload?.type === 'joined' && payload?.projectId === projectId,
      'B joined listener',
    )

    clientA.emit('collab:join-project', projectId)
    clientB.emit('collab:join-project', projectId)

    await Promise.race([
      Promise.all([joinedA, joinedB]),
      makeTimeout('Timed out waiting for joined presence events'),
    ])

    console.log('Both clients received joined presence events')

    const leftSeenByA = waitForEvent(
      clientA,
      'collab:presence',
      (payload) => payload?.type === 'left' && payload?.socketId === idB,
      'A left listener',
    )

    clientB.close()

    await Promise.race([
      leftSeenByA,
      makeTimeout('Timed out waiting for left presence event on client A'),
    ])

    console.log('Client A received left presence event for client B')
    console.log('Socket smoke test passed')
  } finally {
    clientA.close()
    clientB.close()
  }
}

void run().catch((error) => {
  console.error('Socket smoke test failed')
  console.error(error)
  process.exit(1)
})
