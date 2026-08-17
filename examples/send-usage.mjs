const endpoint = process.env.PET_ENDPOINT ?? 'http://127.0.0.1:47832/v1/events'
const tokens = Number(process.argv[2] ?? 1_000_000)

const event = {
  schema: 'deepseek-token-pet/event@1',
  id: `example:${Date.now()}`,
  timestamp: Date.now(),
  source: 'node-example',
  type: 'usage',
  mode: 'delta',
  usage: { inputTokens: tokens, outputTokens: 0 },
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
})
console.log(await response.json())

