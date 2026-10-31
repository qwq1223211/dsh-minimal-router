/**
 * 语义打分路由（lib/intent.js）的单元测试。
 *
 * 目标：
 *   1. 说人话但没关键词 → 也能猜对（这是它存在的唯一理由）
 *   2. 猜不准 → 必须返回 null（宁可不动，也不能乱切）
 *   3. auto 永远不被"猜"进来（auto = 不限制，猜进来等于没瘦身）
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createIntentDetector, buildProfiles, tokenize } from '../lib/intent.js'

const STAGES = {
  auto: { title: '自动', allow: [], keywords: [] },
  core: { title: '通用', allow: [], keywords: ['通用', '基础', 'core'] },
  'unity-code': { title: 'Unity 代码', allow: ['unity'], keywords: ['代码', '脚本', '编译', '报错'] },
  'unity-ui': { title: 'Unity UI', allow: ['unity', 'ui'], keywords: ['界面', '按钮', '布局', '面板'] },
  art: { title: '美术', allow: ['art', 'meshy', 'image'], keywords: ['贴图', '模型', '素材', '美术'] },
  audio: { title: '音频', allow: ['audio'], keywords: ['音效', '音乐'] },
}

const detect = createIntentDetector(STAGES)

test('没出现关键词，也能按语义猜到 UI 阶段', () => {
  const r = detect('帮我把那个按钮挪一下')
  assert.ok(r, '应当给出判断')
  assert.equal(r.stage, 'unity-ui')
})

test('编译 / 报错 → unity-code', () => {
  const r = detect('跑一下编译看看哪里报错了')
  assert.equal(r?.stage, 'unity-code')
})

test('背景音乐 → audio', () => {
  const r = detect('给我加个背景音乐')
  assert.equal(r?.stage, 'audio')
})

test('贴图 → art', () => {
  const r = detect('帮我把角色贴图换一下')
  assert.equal(r?.stage, 'art')
})

test('闲聊必须返回 null，不许乱切', () => {
  assert.equal(detect('今天天气怎么样'), null)
  assert.equal(detect('随便聊聊吧'), null)
  assert.equal(detect('你好'), null)
})

test('太短的输入不猜', () => {
  assert.equal(detect('按钮'), null)
  assert.equal(detect(''), null)
  assert.equal(detect('   '), null)
})

test('auto 不进画像（否则会被猜成"不限制"）', () => {
  const profiles = buildProfiles(STAGES)
  assert.equal(profiles.has('auto'), false)
  assert.equal(profiles.size, 5)
})

test('画像里有关键词权重，且 keywords 比 allow 高', () => {
  const profiles = buildProfiles(STAGES)
  const ui = profiles.get('unity-ui')
  assert.ok(ui.weights.get('按钮') > ui.weights.get('ui'))
})

test('tokenize：CJK 出二元组，拉丁出整词', () => {
  const t = tokenize('Unity 界面')
  assert.ok(t.has('unity'))
  assert.ok(t.has('界面'))
})

test('阈值可调：调高之后同一句话就不猜了', () => {
  const strict = createIntentDetector(STAGES, { minScore: 999 })
  assert.equal(strict('帮我把那个按钮挪一下'), null)
})

test('结果结构完整（分数 / 领先幅度 / 第二名）', () => {
  const r = detect('跑一下编译看看哪里报错了')
  assert.ok(r)
  assert.equal(typeof r.score, 'number')
  assert.equal(typeof r.margin, 'number')
  assert.equal(typeof r.second, 'string')
  assert.ok(r.margin >= 0 && r.margin <= 1)
})

test('探针：明确命中时与正式判定一致', () => {
  const strict = detect('跑一下编译看看哪里报错了')
  const soft = detect.probe('跑一下编译看看哪里报错了')
  assert.equal(strict.stage, soft.stage)
})

test('探针：胡话仍然返回 null（不会为了给建议而瞎猜）', () => {
  assert.equal(detect.probe('今天天气怎么样'), null)
})
