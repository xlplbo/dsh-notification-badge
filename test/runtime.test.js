import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as plugin from '../index.js'

const runtime = process.env.DSH_RUNTIME_ROOT

test('the installed Cordis runtime activates notifications with or without session titles', { skip: !runtime }, async () => {
  const require = createRequire(import.meta.url)
  const { Context, Inject } = require(`${runtime}/node_modules/@deepseek-ai/cordis/lib/index.js`)
  const { Session } = require(`${runtime}/node_modules/@deepseek-ai/dsh-session/lib/index.js`)
  const { SessionTitleService } = require(`${runtime}/node_modules/@deepseek-ai/dsh-session-title/lib/index.js`)
  assert.deepEqual(Object.keys(Inject.resolve(plugin.inject)), [])
  const originalFetch = globalThis.fetch
  const posts = []
  globalThis.fetch = async (_url, init) => {
    posts.push(JSON.parse(init.body))
    return { ok: true, json: async () => ({ code: 0 }) }
  }
  const ctx = new Context()
  try {
    await ctx.plugin(plugin, {
      desktop: false, minTurnDurationMs: 0,
      webhookUrl: 'https://example.invalid', webhookFormat: 'wps-markdown', webhookLanguage: 'zh-CN',
    })
    const session = Session.create('runtime-smoke')
    session.append('user/message', {
      role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '真实会话接口中的提问' }],
    }, { surfaceOp: 'append' })
    const agent = { id: session.id, session }
    const finish = () => {
      ctx.emit('agent/status', { agent, status: 'running' })
      ctx.emit('agent/status', { agent, status: 'idle' })
    }
    finish()
    assert.equal(posts.length, 1)
    assert.match(posts[0].markdown.text, /runtime-smoke/)
    assert.match(posts[0].markdown.text, /真实会话接口中的提问/)
    ctx.provide('sessionTitle', { get: (current) => SessionTitleService.prototype.get.call(null, current) })
    session.append('session/title', { title: '真实标题服务中的名称', messageSeqs: [], source: { kind: 'user' } })
    finish()
    assert.equal(posts.length, 2)
    assert.match(posts[1].markdown.text, /真实标题服务中的名称/)
  } finally {
    await ctx.fiber.dispose()
    globalThis.fetch = originalFetch
  }
})
