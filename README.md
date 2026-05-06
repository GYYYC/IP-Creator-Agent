# IP Creator Agent

IP Creator Agent 是一个面向内容创作者的 AI 工作台，帮助创作者完成从个人画像、内容创作、作品复盘、评论洞察到长期记忆沉淀的完整流程。

当前项目是一个 Next.js App Router 应用，主要服务中文内容场景，适合小红书、短视频、图文笔记、口播视频等内容工作流。系统不再绑定某一个固定人设，页面中的创作建议会尽量基于用户在 Profile 中维护的真实个人画像生成。

## 功能概览

- **Dashboard**：展示当前优先任务、最近作品、创作记录和个人画像摘要。
- **Director**：通过少量对话把一个粗略选题变成完整图文稿或视频口播稿。
- **Doctor**：复盘图文或视频内容，分析掉点、口播时间轴、关键帧和下一版改法。
- **Assistant**：分析作品和评论区，判断评论方向、风险、可回复点和下一条选题机会。
- **Profile**：维护创作者身份、受众、表达风格、平台偏好和长期记忆。
- **History**：保存 Director、Doctor、Assistant 等历史记录，支持回到某一条继续查看。
- **Memory Writeback**：把稳定、有复用价值的洞察写回长期画像，而不是把每次结果都直接变成记忆。

## 当前核心流程

1. 用户先在 `/profile` 维护真实个人画像。
2. `/dashboard` 根据画像和历史记录展示当前工作台。
3. `/director` 根据画像和用户输入生成图文或视频脚本。
4. `/doctor` 上传作品素材，对图文或视频进行复盘。
5. `/assistant` 结合最近复盘作品或上传素材，分析评论区方向和下一步内容机会。
6. `/history` 回看历史创作、复盘和评论分析结果。

## 页面路由

| Route | 用途 |
| --- | --- |
| `/` | 重定向到 `/dashboard`。 |
| `/dashboard` | 主工作台，展示任务、画像、最近记录。 |
| `/director` | 创作导演，用于生成图文稿或视频口播稿。 |
| `/doctor` | 内容复盘，用于诊断图文、视频、口播和掉点。 |
| `/assistant` | 评论助手，用于分析评论区和生成回复策略。 |
| `/history` | 创作记录和复盘记录列表。 |
| `/profile` | 个人画像和长期记忆管理。 |
| `/onboarding` | 初始引导入口。 |

## 核心模块

### Director

Director 用来把一个模糊想法整理成可发布内容。

当前支持：

- 图文笔记：标题、封面文案、正文结构、标签、发布检查项。
- 视频口播：完整口播稿、标题选项、拍摄时间轴、字幕建议、发布检查项。
- 对话式槽位收集：先确认人群、动作、核心承诺，再生成稿件。
- `help_me_decide` 逻辑：当用户说“我不知道你帮我总结一下”“你有什么建议吗”“你帮我选一个”时，系统会主动给推荐答案和候选项，而不是继续反问。

### Doctor

Doctor 用来复盘内容表现，尤其是视频诊断。

当前视频链路：

1. 原视频上传仍走 **Vercel Blob**。
2. 浏览器从视频中提取音频 `wav`。
3. `/api/doctor/transcribe` 把音频上传到 **火山引擎 TOS 私有桶**。
4. 服务端生成短期预签名 GET URL。
5. **豆包 AUC 录音文件识别**读取该 TOS URL 并返回转写文本。
6. 开启 `show_utterances` 后，口播稿会带每句话的时间段。
7. 浏览器抽取视频关键帧并压缩，GPT-5.5 只分析有限数量关键帧。
8. Doctor 结合口播时间轴、关键帧、留存截图、用户 notes 和 stats 生成诊断。

Doctor 输出重点：

- 主要问题。
- 掉点记录：按 `0.2-3.5s` 这类时间段展示原因、证据和建议。
- 行动建议。
- 改前口播和改后口播切换。
- 继续问 Doctor。

为了避免卡死，视觉分析有独立超时和一次重试；失败时返回结构化错误，不阻塞整个流程。

### Assistant

Assistant 负责作品和评论之间的关系判断。

当前支持：

- 使用最近复盘作品作为分析对象。
- 上传作品素材作为分析对象。
- 支持多张图片素材。
- 评论价值分层。
- 评论区方向判断。
- 高价值回复建议。
- 风险和敏感表达提醒。
- 下一条内容机会。

### Profile And Memory

Profile 是全局画像来源。Dashboard、Director、Doctor、Assistant 都应优先基于这里的真实画像，而不是使用内置固定身份。

Profile 包含：

- 创作者身份。
- 受众画像。
- 表达风格。
- 平台偏好。
- 长期记忆。
- 可复用内容规则。

Memory writeback 保守处理：只有用户确认或足够稳定的洞察才写入长期记忆。

## 技术架构

```text
app/
  api/                         API routes
  assistant/                   评论助手页面
  dashboard/                   主工作台页面
  director/                    创作导演页面
  doctor/                      内容复盘页面
  history/                     历史记录页面
  onboarding/                  引导页面
  profile/                     个人画像页面

components/
  assistant-studio.tsx         Assistant 前端工作台
  director-studio.tsx          Director 前端工作台
  doctor-studio.tsx            Doctor 前端工作台
  memory-widget.tsx            记忆组件
  onboarding-overlay.tsx       引导组件
  site-header.tsx              顶部导航

lib/agent/
  brain.ts                     画像和记忆加载、写回
  dashboard-data.ts            Dashboard 数据构建
  defaults.ts                  默认画像和默认记忆
  history-data.ts              历史记录数据构建
  http.ts                      API JSON 工具
  identity.ts                  匿名身份和 profile 查找
  llm.ts                       OpenAI/Anthropic 兼容模型调用
  module-configs.ts            模块 prompt、fallback、输出归一化
  orchestrator.ts              Session 编排执行
  store.ts                     Postgres/本地 JSON 存储
  tos.ts                       火山 TOS 上传和预签名 URL
  types.ts                     共享类型
```

## API Routes

| Route | Method | 用途 |
| --- | --- | --- |
| `/api/bootstrap` | `GET` | 创建或返回匿名 profile。 |
| `/api/dashboard` | `GET` | 返回 Dashboard 任务、画像和最近记录。 |
| `/api/history` | `GET` | 返回历史记录。 |
| `/api/history/delete` | `POST` | 删除历史记录。 |
| `/api/profile` | `GET` | 返回 profile 和 memory。 |
| `/api/profile` | `PATCH` | 更新 profile 字段和记忆候选。 |
| `/api/sessions` | `POST` | 创建模块 session。 |
| `/api/sessions/[id]` | `GET` | 返回单条 session 和素材。 |
| `/api/sessions/[id]/respond` | `POST` | 添加用户回答或修改要求。 |
| `/api/sessions/[id]/run` | `POST` | 调用 orchestrator 执行当前模块。 |
| `/api/sessions/[id]/writeback` | `POST` | 把确认后的候选记忆写回 profile。 |
| `/api/artifacts/register` | `POST` | 注册上传素材元数据。 |
| `/api/uploads/blob` | `POST` | 给 Vercel Blob 客户端上传生成 token。 |
| `/api/uploads/token` | `POST` | 旧上传 token 接口。 |
| `/api/doctor/transcribe` | `POST` | Doctor 音频转写，内部走 TOS + 豆包 AUC。 |
| `/api/doctor/frame-times` | `POST` | 根据留存图或视频信息生成关键帧时间点。 |
| `/api/doctor/audio-source` | `POST` | Doctor 音频源辅助接口。 |
| `/api/doctor/audio-source/[fileName]` | `GET` | Doctor 音频源读取辅助接口。 |

## 数据存储

核心数据类型：

- `CreatorProfile`：创作者身份、受众、风格、平台、长期脑图。
- `BrainMemoryEntry`：可复用的长期洞察。
- `AgentSession`：一次 Director、Doctor、Assistant 或 Profile 任务。
- `ArtifactRecord`：上传或引用的素材元数据。

存储模式：

- **Postgres 模式**：生产环境推荐，当前已支持 Supabase、Neon 等 Postgres 服务。
- **本地 JSON fallback**：没有数据库时使用 `.data/agent-store.json`，只适合本地演示。

生产环境必须配置数据库，否则 Vercel Serverless 函数之间无法可靠共享本地文件，历史记录和 session 容易丢失。

### Supabase / Postgres

Vercel 生产环境建议配置：

```env
DATABASE_URL=postgresql://...
```

项目也会尝试识别部分常见 Postgres 变量，例如 `POSTGRES_URL`、`SUPABASE_POSTGRES_URL`、`POSTGRES_PRISMA_URL`、`POSTGRES_URL_NON_POOLING` 等。

Supabase pooler 连接如果遇到证书链问题，可以使用项目当前兼容的连接方式；部署后请以 Vercel 日志为准。

## 环境变量

请复制 `.env.example` 为 `.env.local`，本地开发时填写真实值：

```bash
cp .env.example .env.local
```

### AI

| Variable | 用途 |
| --- | --- |
| `AI_PROVIDER` | `openai` 或 `anthropic`。 |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 或中转站地址。 |
| `OPENAI_API_KEY` | OpenAI 兼容 API key。 |
| `OPENAI_MODEL` | 默认模型，例如 `gpt-5.5`。 |
| `AI_BASE_URL` | 通用 fallback base URL。 |
| `AI_API_KEY` | 通用 fallback API key。 |
| `AI_MODEL` | 通用 fallback model。 |
| `ANTHROPIC_BASE_URL` | Anthropic 兼容地址。 |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic API key。 |
| `ANTHROPIC_MODEL` | Anthropic 模型。 |
| `AI_REQUEST_TIMEOUT_MS` | 普通模型请求超时时间。 |
| `AI_VISION_REQUEST_TIMEOUT_MS` | Doctor 视觉分析超时时间。 |
| `AI_IMAGE_DETAIL` | 图片 detail 参数。 |
| `DOCTOR_VISUAL_INPUT_LIMIT` | Doctor 最多传给模型的视觉输入数量。 |
| `DOCTOR_FRAME_TIME_LIMIT` | Doctor 最多抽取的关键帧时间点数量。 |

### Database

| Variable | 用途 |
| --- | --- |
| `DATABASE_URL` | 推荐的生产 Postgres 连接串。 |
| `POSTGRES_URL` | Vercel/Neon 等可能注入的连接串。 |
| `POSTGRES_PRISMA_URL` | Pooled Postgres 连接串。 |
| `POSTGRES_URL_NON_POOLING` | Non-pooling Postgres 连接串。 |
| `SUPABASE_POSTGRES_URL` | Supabase Postgres 连接串。 |
| `AGENT_STORE_DIR` | 本地 JSON fallback 目录。 |

### Vercel Blob

| Variable | 用途 |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 上传 token。 |
| `BLOB_MAX_UPLOAD_BYTES` | Blob 最大上传大小。 |
| `BLOB_SOURCE_SIGNING_SECRET` | Blob 资源签名 secret。 |

Doctor 的原视频仍走 Vercel Blob。Blob 可以是 private；给外部服务读取的音频不走 Blob，而是走 TOS 预签名 URL。

### Doubao AUC

| Variable | 用途 |
| --- | --- |
| `TRANSCRIPTION_PROVIDER` | 当前为 `doubao`。 |
| `AI_TRANSCRIPTION_TIMEOUT_MS` | 转写总超时。 |
| `AI_TRANSCRIPTION_MAX_BYTES` | 服务端直接接收音频上限。 |
| `DOUBAO_ASR_DIRECT_UPLOAD_MAX_BYTES` | 豆包 ASR 直传音频上限。 |
| `DOUBAO_ASR_API_KEY` | 豆包 AUC 新版控制台 API Key。 |
| `DOUBAO_ASR_RESOURCE_ID` | 默认 `volc.seedasr.auc`。 |
| `DOUBAO_ASR_SUBMIT_ENDPOINT` | AUC submit endpoint。 |
| `DOUBAO_ASR_QUERY_ENDPOINT` | AUC query endpoint。 |
| `DOUBAO_ASR_TIMEOUT_MS` | AUC 轮询总超时。 |
| `DOUBAO_ASR_POLL_INTERVAL_MS` | AUC 查询间隔。 |

豆包 AUC 请求使用官方最小协议：submit 带 `X-Api-Key`、`X-Api-Resource-Id`、`X-Api-Request-Id`、`X-Api-Sequence=-1`；query 带认证、resource、request id，body 为 `{}`。

### Volcengine TOS

| Variable | 用途 |
| --- | --- |
| `TOS_ACCESS_KEY_ID` | 火山 TOS Access Key ID。 |
| `TOS_SECRET_ACCESS_KEY` | 火山 TOS Secret Access Key。 |
| `TOS_BUCKET` | TOS bucket。 |
| `TOS_REGION` | 例如 `cn-beijing`。 |
| `TOS_ENDPOINT` | 例如 `tos-cn-beijing.volces.com`。 |
| `TOS_PUBLIC_URL_TTL_SECONDS` | 预签名 GET URL 有效期。 |
| `TOS_SOURCE_VERIFY_TIMEOUT_MS` | 服务端自检 URL 超时。 |

TOS bucket 可以是私有桶。服务端会上传音频后生成短期预签名 GET URL，并先做 URL 自检；自检失败时不会提交豆包，而是返回可读错误。

## 本地开发

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
```

生产构建：

```bash
npm run build
```

生产启动：

```bash
npm run start
```

## Vercel 部署要点

1. 在 Vercel 配置数据库连接串，推荐 Supabase 或其他 Postgres。
2. 配置 AI Provider 环境变量。
3. 配置 Vercel Blob token。
4. 配置 TOS 环境变量。
5. 配置豆包 AUC 环境变量。
6. 部署后先用短视频测试 Doctor：
   - Blob token request 成功。
   - TOS upload 成功。
   - TOS signed URL self-check 成功。
   - Doubao AUC submit/query 成功。
   - GPT-5.5 关键帧分析完成。
   - 页面显示口播稿、掉点记录和改后口播。

## 常见日志说明

### `[DEP0169] url.parse()`

这是 Node 的弃用警告，通常来自依赖内部使用旧 `url.parse()`。它不是功能失败的直接原因，可以先忽略。

### `status=502 provider=openai`

表示模型中转站或上游模型请求失败。项目会尽量返回结构化错误，但 API 用量后台可能仍显示调用，因为请求已经打到中转站。

### `Doubao ASR TOS source failed`

表示音频上传到 TOS 或预签名 URL 自检失败。优先检查 TOS bucket、region、endpoint、权限和预签名 URL 是否能被公网访问。

### `Unexpected end of JSON input`

通常表示前端期待 JSON，但服务端返回了空响应或函数崩溃。需要看对应 Vercel Function 日志里的真实错误。

### 数据库 `data transfer quota`

如果使用 Neon 免费额度，超过 monthly public network transfer 后，查询、插入、更新都可能失败。可以升级、等待下月重置，或迁移到 Supabase / 其他数据库。

## 当前限制

- 目前没有正式账号系统，仍以匿名 cookie 和 profile 为主。
- Doctor 的大音频超过服务端直接接收限制时，会明确跳过转写；后续可做客户端直传 TOS 或分片上传。
- Doctor 视频理解基于关键帧和口播稿，不是完整逐帧视频理解。
- AI 中转站不稳定时，可能出现 502 或空响应，需要更换可用 provider 或增加重试策略。
- Memory writeback 仍偏保守，需要用户确认后再沉淀长期记忆。

## 技术栈

- Next.js 15
- React 19
- TypeScript 5
- App Router
- Postgres / Supabase / Neon
- Vercel Blob
- Volcengine TOS
- Doubao AUC ASR
- OpenAI-compatible / Anthropic-compatible model adapters

