/**
 * ============================================================================
 * dsh-minimal-router · lib/stages-default.js
 * ============================================================================
 * 内置阶段表。
 *
 * 拆出来的原因：index.js 有 1200 行守卫线，而这张表是纯数据，
 * 放在入口文件里除了占行数没有别的作用。
 *
 * allow 里写的是「工具名前缀的标签」，例如 'unity' 会罩住 unity_* 全部工具。
 *
 * 【跨领域阶段】python-code / document-write 是刻意加的「非 Unity」阶段：
 *   路由是通用插件，不能只在 Unity 场景下被验证过。
 *   注意 allow 里同时写了「理想标签」和「本机真实标签」：
 *     · python / notebook / pandas 在多数机器上不存在（无害空转，dryRun 会报出来）
 *     · terminal / study 是本机真实存在的组，保证并集在真机上看得见
 * ============================================================================
 */

import { withUnion } from './union.js'

/** 原始阶段表（未装 Proxy） */
const BASE_STAGES = {
  auto: {
    title: '自动',
    allow: [],
    keywords: [],
  },
  core: {
    title: '通用',
    allow: [],
    keywords: ['通用', '基础', 'core'],
  },
  // Unity 代码阶段：把 Unity 的全部子系统都收进来（安全网必须密）
  'unity-code': {
    title: 'Unity 代码',
    allow: [
      'unity',
      'asset',
      'level',
      'perf',
      'save',
      'lighting',
      'player',
      'enemy',
      'l10n',
      'gameplay',
      'dialogue',
      'quest',
      'uikit',
      'uiflow',
    ],
    keywords: ['代码', '脚本', '编译', '报错', 'controller', 'script', 'compile', 'c#', 'csharp', 'unity'],
  },
  // Unity UI 阶段：UI 相关的子系统也一起收进来
  'unity-ui': {
    title: 'Unity UI',
    allow: ['unity', 'ui', 'uikit', 'uiflow', 'dialogue', 'quest'],
    keywords: ['界面', '按钮', '布局', 'canvas', 'hud', 'panel', '面板', 'ui'],
  },
  art: {
    title: '美术',
    allow: ['art', 'meshy', 'image', 'asset'],
    keywords: ['贴图', '模型', '素材', '美术', 'texture', 'model', 'sprite', 'mesh', 'icon'],
  },
  audio: {
    title: '音频',
    allow: ['audio'],
    keywords: ['音效', '音乐', 'audio', 'sfx', 'bgm'],
  },
  // ==========================================================================
  // 跨领域阶段（非 Unity）：写代码 + 写文档
  // ==========================================================================
  'python-code': {
    title: 'Python 编码',
    allow: ['python', 'notebook', 'pandas', 'numpy', 'terminal', 'search', 'github'],
    keywords: ['python', 'py', '脚本', '爬虫', '爬取', 'pandas', 'numpy', '自动化', 'requests', '爬'],
  },
  'document-write': {
    title: '文档写作',
    allow: ['office', 'docx', 'pptx', 'markdown', 'md', 'study', 'review'],
    keywords: ['文档', '报告', '周报', '总结', '整理', '写一份', 'markdown', 'office', '文章'],
  },
}

/**
 * 对外导出的阶段表：**装了并集 Proxy**。
 * 查 `DEFAULT_STAGES['python-code+document-write']` 会现场合成并集定义。
 */
export const DEFAULT_STAGES = withUnion(BASE_STAGES)

/** 关键词匹配顺序：越靠前越优先（更具体的放前面） */
export const STAGE_ORDER = ['unity-ui', 'art', 'audio', 'python-code', 'document-write', 'unity-code', 'core']
