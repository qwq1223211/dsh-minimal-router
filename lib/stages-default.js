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
 * ============================================================================
 */

export const DEFAULT_STAGES = {
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
}

/** 关键词匹配顺序：越靠前越优先（更具体的放前面） */
export const STAGE_ORDER = ['unity-ui', 'art', 'audio', 'unity-code', 'core']
