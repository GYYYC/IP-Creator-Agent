# IP Creator Agent — Demo V1 实施计划

一个面向**知识分享型创作者**的 AI 个人 IP 打造 Agent。Demo V1 聚焦于三个阶段：渐进式 Onboarding、Director 脚本优化、Doctor 深度诊断。

目标平台：**小红书 / 抖音知识分享类创作者**
部署方式：**Vercel（Next.js 原生支持）**

---

## User Review Required

> [!IMPORTANT]
> **LLM 选型确认**：本方案默认使用 **GPT-4o**（多模态能力最强，同时支持图片识别 and 视频分析）。如你有其他偏好（如 Gemini Pro、Claude 3.5 Sonnet），请告知，部分模块能力会有差异。

> [!IMPORTANT]
> **竞品分析数据源**：Demo 阶段使用 **Tavily Search API**（专为 AI Agent 设计的搜索 API，有免费额度）。数据为实时 Web 搜索结果，精确度不如蝉妈妈等专业平台，但足以跑通完整流程。

> [!WARNING]
> **视频文件大小限制**：Vercel Blob 免费版单文件上传上限为 **500MB**。Doctor 模块上传视频时需提示用户压缩或剪短视频，或改用视频链接输入方式。建议 Demo 阶段优先支持**视频链接**（YouTube/B站/抖音链接）而非直接上传文件。

---

## 技术栈

| 层级 | 技术选型 | 理由 |
|------|---------|------|
| 框架 | Next.js 14 (App Router) | Vercel 原生支持，SSE 流式输出 |
| UI | Tailwind CSS + shadcn/ui | 快速构建，组件完善 |
| LLM | GPT-4o via OpenAI SDK | 多模态（视频帧+图片+文本） |
| 搜索 | Tavily Search API | 专为 Agent 设计，有结构化输出 |
| 数据库 | Supabase (PostgreSQL) | Profile Engine 持久化 |
| 文件存储 | Supabase Storage | 截图/视频临时存储 |
| 部署 | Vercel | CI/CD 自动化 |

---

## 数据库 Schema（Profile Engine）

```sql
-- 用户表
users (id, email, created_at)

-- 创作者画像（核心状态）
creator_profiles (
  id, user_id,
  -- Identity Layer
  persona_label,        -- "高亲和力学霸种草官"
  core_value,           -- "让考研不孤独"
  style_fingerprint,    -- JSON: {visual, language, rhythm}
  track,                -- "考研生活"
  sub_track,            -- "在职考研"
  affinity_score,       -- 0-10
  expertise_score,      -- 0-10
  -- Performance Layer
  avg_retention,        -- 平均完播率
  avg_engagement,       -- 平均互动率
  total_videos,
  updated_at
)

-- 历史视频档案
video_records (
  id, user_id,
  title, platform,
  plays, retention_rate, engagement_rate,
  diagnosis_report,     -- JSON: 完整诊断报告
  script_version,       -- 使用的脚本版本
  created_at
)

-- 人设进化轨迹
evolution_log (
  id, user_id,
  version,              -- "v1.1"
  change_reason,        -- "学习方法视频数据持续好"
  old_state,            -- JSON
  new_state,            -- JSON
  created_at
)
```

---

## Proposed Changes

### Phase 1 — Onboarding 渐进式入职

#### [NEW] `app/onboarding/page.tsx`
渐进式 Onboarding 主页面，分 3 个步骤：

**Step 1 — Level 0 文本问卷**（所有人必填）
```
Q1: 你是？（一句话介绍自己）
Q2: 你擅长什么？（经历/技能/知识）
Q3: 你想影响谁？（目标受众）
Q4: 你最崇拜哪位创作者？（风格参考）
Q5: 你想在哪个平台发布？（抖音/小红书/B站）
```

**Step 2 — 创作者星盘生成**
- LLM 分析问卷，输出人设标签、核心价值主张、风格光谱（亲和力/专业度/幽默感各 0-10 分）
- UI：雷达图展示人格光谱

**Step 3 — 赛道建议 + 竞品分析**
- Agent 调用 Tavily Search，搜索该赛道 Top 创作者
- 输出 2-3 个赛道建议 + 每个赛道的差异化机会点
- 用户选择赛道 → 写入 Profile Engine → 进入主工作台

#### [NEW] `app/api/onboarding/analyze/route.ts`
- 接收问卷数据
- 调用 GPT-4o 生成创作者星盘
- 调用 Tavily 搜索赛道竞品
- 返回流式输出（SSE）

---

### Phase 2 — Director 脚本优化模块

#### [NEW] `app/director/page.tsx`
脚本输入 → 优化结果展示的完整 UI。

**输入区**
- 多行文本框：粘贴粗糙脚本想法
- 平台选择（影响风格偏好）
- 读取 Profile Engine 中的用户人设（自动加载，无需重复填写）

**输出区**（三栏并列展示）
```
┌─────────────────┬─────────────────┬─────────────────┐
│  版本 A         │  版本 B         │  版本 C         │
│  悬念式开头     │  共鸣式开头     │  数据式开头     │
│  [3秒脚本文案]  │  [3秒脚本文案]  │  [3秒脚本文案]  │
└─────────────────┴─────────────────┴─────────────────┘

脚本结构评分:
Hook ████████░░ 8/10
Conflict ██████░░░░ 6/10  
Resolution █████████░ 9/10
CTA ████░░░░░░ 4/10  ← 需要改进

⚠️ 低价值冗余区标注:
第23-35秒 [划线标注]: "然后我就...其实就是..."  → 建议删除，直接跳到结论
```

#### [NEW] `app/api/director/optimize/route.ts`
- 读取用户 Profile（人设 + 历史诊断教训）
- 调用 GPT-4o 做风格迁移，生成 3 套开头
- 输出脚本结构评分 + 冗余区标注

---

### Phase 3 — Doctor 深度诊断模块

#### [NEW] `app/doctor/page.tsx`
三步上传 UI + 诊断报告展示。

**上传流程设计**
```
Step 1: 上传视频
  └── 支持: 直接上传文件（<500MB）或 粘贴视频链接

Step 2: 上传留存曲线截图
  └── 拖拽上传 / 粘贴截图
  └── 旁边显示操作引导图："如何在抖音后台截图留存曲线"

Step 3: 上传评论截图（可选，最多5张）
  └── 支持多张截图，自动拼接分析
```

**诊断报告 UI**
```
时间轴对齐分析:
  0s ──●── 5s ──●── 15s ──▼── 30s ──●── 60s
                       ↑
                [留存骤降: 72% → 41%]
                对应内容: "开始念广告词"
                建议: 改用场景化植入，自然带出产品

评论区分析:
  正向评论 45条 / 建设性批评 12条 / 情绪宣泄 23条

  ✅ 高价值反馈:
     "能不能出一期在职考研时间管理的内容？" (18个赞)
  
  ⚠️ 心理防护盾（负面评论占比 > 40%）:
     "这期数据实际上是你近8期最高播放量..."
     建议置顶回复: [AI 生成高情商回复模板]

下一期改进框架:
  └── Director 已根据本期诊断自动生成改进脚本框架 →
```

#### [NEW] `app/api/doctor/diagnose/route.ts`
- 接收视频 + 截图文件
- 调用 GPT-4o Vision 识别留存曲线数据点
- 调用 GPT-4o 分析视频内容，生成时间轴摘要
- 执行时间轴对齐分析（核心逻辑）
- 调用 GPT-4o Vision 识别并分类评论截图
- 返回完整诊断报告 JSON

---

### 共享组件

#### [NEW] `components/profile-sidebar.tsx`
- 所有页面左侧固定侧边栏
- 展示：创作者星盘（人设标签、赛道）、能力雷达图（历史表现趋势）

#### [NEW] `lib/profile-engine.ts`
- `getProfile(userId)` — 读取完整画像
- `updatePerformance(userId, videoRecord)` — 更新历史表现
- `checkEvolution(userId)` — 检查是否需要人设微调（每 5 期触发）

---

## 页面路由结构

```
/                    → 落地页（介绍 + CTA）
/onboarding          → 渐进式入职（首次登录）
/dashboard           → 主工作台（展示 Profile + 快捷入口）
/director            → 脚本优化模块
/doctor              → 深度诊断模块
/profile             → 创作者画像详情 + 进化历史
```

---

## Verification Plan

### 端到端流程测试
1. 完整走一遍 Onboarding 流程，验证创作者星盘生成质量
2. 粘贴一段真实脚本到 Director，验证 3 套开头的差异化程度
3. 上传一张真实的抖音留存曲线截图，验证 Vision 识别准确率
4. 上传一段真实视频，验证时间轴摘要生成逻辑
5. 上传评论截图，验证情绪分类准确率

### Vercel 部署验证
- 确认环境变量正确注入（OpenAI Key、Supabase URL、Tavily Key）
- 确认文件上传在 Vercel Serverless 环境下正常工作
- 确认 SSE 流式输出在 Vercel Edge Runtime 下正常工作
