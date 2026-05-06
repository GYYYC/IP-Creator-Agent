from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "deliverables" / "IP_Creator_Agent_说明文档.pdf"

FONT_REGULAR = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"


def register_fonts() -> tuple[str, str]:
    pdfmetrics.registerFont(TTFont("NotoSansSC", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("MicrosoftYaHeiBold", FONT_BOLD))
    return "NotoSansSC", "MicrosoftYaHeiBold"


REGULAR_FONT, BOLD_FONT = register_fonts()

PALETTE = {
    "ink": colors.HexColor("#111827"),
    "muted": colors.HexColor("#4B5563"),
    "blue": colors.HexColor("#2563EB"),
    "teal": colors.HexColor("#0F766E"),
    "orange": colors.HexColor("#EA580C"),
    "soft_blue": colors.HexColor("#EFF6FF"),
    "soft_teal": colors.HexColor("#ECFDF5"),
    "soft_orange": colors.HexColor("#FFF7ED"),
    "border": colors.HexColor("#CBD5E1"),
    "header": colors.HexColor("#DBEAFE"),
}


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Title"],
            fontName=BOLD_FONT,
            fontSize=28,
            leading=36,
            alignment=TA_CENTER,
            textColor=PALETTE["ink"],
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverSub",
            parent=styles["BodyText"],
            fontName=REGULAR_FONT,
            fontSize=12,
            leading=20,
            alignment=TA_CENTER,
            textColor=PALETTE["muted"],
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1CN",
            parent=styles["Heading1"],
            fontName=BOLD_FONT,
            fontSize=19,
            leading=26,
            textColor=PALETTE["blue"],
            spaceBefore=8,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2CN",
            parent=styles["Heading2"],
            fontName=BOLD_FONT,
            fontSize=14,
            leading=21,
            textColor=PALETTE["ink"],
            spaceBefore=10,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCN",
            parent=styles["BodyText"],
            fontName=REGULAR_FONT,
            fontSize=10,
            leading=16,
            textColor=PALETTE["ink"],
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallCN",
            parent=styles["BodyText"],
            fontName=REGULAR_FONT,
            fontSize=8.8,
            leading=13,
            textColor=PALETTE["muted"],
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellCN",
            parent=styles["BodyText"],
            fontName=REGULAR_FONT,
            fontSize=8.7,
            leading=12.4,
            textColor=PALETTE["ink"],
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellBoldCN",
            parent=styles["BodyText"],
            fontName=BOLD_FONT,
            fontSize=8.8,
            leading=12.6,
            textColor=PALETTE["ink"],
        )
    )
    styles.add(
        ParagraphStyle(
            name="QuoteCN",
            parent=styles["BodyText"],
            fontName=REGULAR_FONT,
            fontSize=9.5,
            leading=15,
            leftIndent=8,
            borderColor=PALETTE["teal"],
            borderWidth=1.5,
            borderPadding=6,
            backColor=colors.HexColor("#F8FAFC"),
            textColor=PALETTE["ink"],
            spaceAfter=8,
        )
    )
    return styles


STYLES = make_styles()


def p(text: str, style: str = "BodyCN") -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), STYLES[style])


def bullets(items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontName=REGULAR_FONT,
        bulletFontSize=7,
        spaceAfter=6,
    )


def table(rows: list[list[str | Paragraph]], widths: list[float], header: bool = False) -> Table:
    normalized = []
    for row in rows:
        normalized.append([
            cell if isinstance(cell, Paragraph) else p(str(cell), "CellBoldCN" if header and row == rows[0] else "CellCN")
            for cell in row
        ])
    t = Table(normalized, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("FONTNAME", (0, 0), (-1, -1), REGULAR_FONT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, PALETTE["border"]),
        ("BOX", (0, 0), (-1, -1), 0.8, PALETTE["border"]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style.extend([
            ("BACKGROUND", (0, 0), (-1, 0), PALETTE["header"]),
            ("FONTNAME", (0, 0), (-1, 0), BOLD_FONT),
            ("TEXTCOLOR", (0, 0), (-1, 0), PALETTE["ink"]),
        ])
    t.setStyle(TableStyle(style))
    return t


class FlowDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 170 * mm
        self.height = 40 * mm

    def draw(self):
        c = self.canv
        labels = [
            ("Profile", "画像与记忆"),
            ("Director", "脚本生成"),
            ("Doctor", "内容复盘"),
            ("Assistant", "评论运营"),
            ("Memory", "规则写回"),
        ]
        box_w = 30 * mm
        box_h = 17 * mm
        gap = 4 * mm
        x = 0
        y = 12 * mm
        for index, (title, sub) in enumerate(labels):
            c.setStrokeColor(PALETTE["border"])
            c.setFillColor(PALETTE["soft_blue"] if index in (0, 1) else PALETTE["soft_teal"])
            if index == 4:
                c.setFillColor(PALETTE["soft_orange"])
            c.roundRect(x, y, box_w, box_h, 4, stroke=1, fill=1)
            c.setFillColor(PALETTE["ink"])
            c.setFont(BOLD_FONT, 8.5)
            c.drawCentredString(x + box_w / 2, y + 10.5 * mm, title)
            c.setFont(REGULAR_FONT, 7)
            c.setFillColor(PALETTE["muted"])
            c.drawCentredString(x + box_w / 2, y + 5.2 * mm, sub)
            if index < len(labels) - 1:
                c.setStrokeColor(PALETTE["blue"])
                c.line(x + box_w + 1 * mm, y + box_h / 2, x + box_w + gap - 1 * mm, y + box_h / 2)
                c.setFillColor(PALETTE["blue"])
                c.circle(x + box_w + gap - 1 * mm, y + box_h / 2, 1, fill=1, stroke=0)
            x += box_w + gap


def add_page_header(canvas, doc):
    canvas.saveState()
    canvas.setFont(REGULAR_FONT, 8)
    canvas.setFillColor(PALETTE["muted"])
    canvas.drawString(doc.leftMargin, A4[1] - 12 * mm, "IP Creator Agent · 说明文档")
    canvas.drawRightString(A4[0] - doc.rightMargin, A4[1] - 12 * mm, f"第 {doc.page} 页")
    canvas.setStrokeColor(colors.HexColor("#E5E7EB"))
    canvas.line(doc.leftMargin, A4[1] - 15 * mm, A4[0] - doc.rightMargin, A4[1] - 15 * mm)
    canvas.restoreState()


def cover_table() -> Table:
    rows = [
        ["字段", "填写内容"],
        ["作品名称", "IP Creator Agent（个人 IP 打造 AI Agent）"],
        ["参赛赛道", "开放赛道 / AI 原生应用方向（请按最终赛事口径补充具体赛道名称）"],
        ["选手姓名", "待补充"],
        ["Demo 链接", "本地运行地址：http://localhost:3000；部署后替换为 Vercel 线上地址"],
        ["一句话概述", "面向知识分享型 KOC 的 AI 创作工作台，帮助创作者完成画像沉淀、脚本生成、内容复盘、评论运营与长期记忆写回。"],
    ]
    return table(rows, [34 * mm, 128 * mm], header=True)


def build_story() -> list:
    story: list = []
    story.append(Spacer(1, 18 * mm))
    story.append(p("IP Creator Agent", "CoverTitle"))
    story.append(p("面向知识型创作者的 AI 个人 IP 打造工作台", "CoverSub"))
    story.append(cover_table())
    story.append(Spacer(1, 10 * mm))
    story.append(p("本文档根据项目文件夹中的 README、Implementation Plan、核心代码与本地演示数据整理，并按图片中的“说明文档结构模板（PDF）”组织。", "QuoteCN"))
    story.append(PageBreak())

    story.append(p("模块一：用户洞察与问题定义", "H1CN"))
    story.append(p("1.1 目标用户", "H2CN"))
    story.append(p("核心目标用户是小红书、抖音等平台上的知识分享型创作者，尤其是处在成长早期、希望把真实经验沉淀成个人 IP 的 KOC。项目本地数据中的默认画像为“二战上岸的陪伴型学姐”，面向基础一般、容易焦虑、学习节奏反复中断的考研用户。", "BodyCN"))
    story.append(bullets([
        "身份特征：有真实经历和可被验证的经验积累，但缺少稳定的内容生产系统。",
        "内容形态：小红书图文与短视频并重，依赖标题、首图、3 秒开场、评论区反馈来驱动增长。",
        "表达偏好：温和陪伴 + 方法论，不制造焦虑，不高高在上，先给可执行动作。",
    ]))

    story.append(p("1.2 用户痛点", "H2CN"))
    story.append(table([
        ["痛点", "具体表现", "项目中的对应证据"],
        ["定位不稳定", "不同内容之间风格、受众、承诺不一致，难以长期积累“这个人值得关注”的认知。", "Profile 与 brainSnapshot 存储身份、受众、语气边界和长期内容规则。"],
        ["创作启动难", "有经历、有想法，但不知道先打谁、让用户记住哪句话、怎样展开成可发布脚本。", "Director 通过 rootProblem / changeTarget / corePromise 三个判断收敛内容方向。"],
        ["复盘不成体系", "发布后只看播放、点赞等结果，难以定位首图、开场、转折、方法段或结尾的问题。", "Doctor 支持图文/视频素材、留存截图、关键帧、口播稿与数据说明联合诊断。"],
        ["评论区价值流失", "高价值追问、风险评论、下一期选题机会散落在评论区，无法回流到创作计划。", "Assistant 识别评论意图、隐藏需求、回复策略和下一条内容方向。"],
    ], [28 * mm, 66 * mm, 66 * mm], header=True))

    story.append(p("1.3 使用场景", "H2CN"))
    story.append(bullets([
        "发布前：创作者把粗糙选题、经历片段、图文草稿或视频想法交给 Director，生成标题、封面文案、正文/口播稿、时间轴与发布清单。",
        "发布后：上传作品素材、数据截图、留存曲线或视频，Doctor 对首图、开头、掉点、方法进入速度、结尾动作进行复盘。",
        "评论运营：选择一条作品，粘贴评论或上传评论截图，Assistant 把评论区拆成回复草稿、风险提示和下一期选题。",
        "长期成长：把稳定洞察写回 Profile，后续创作和复盘继续引用这些记忆，形成闭环。"
    ]))

    story.append(PageBreak())
    story.append(p("模块二：产品方案设计", "H1CN"))
    story.append(p("2.1 产品概述", "H2CN"))
    story.append(p("IP Creator Agent 不是单次文案生成器，而是一个围绕“个人 IP 成长闭环”的 AI 工作台。它将创作者画像、内容生成、内容诊断、评论运营和记忆写回放进同一套流程里，让每一次发布和复盘都能沉淀成下一次创作的上下文。", "BodyCN"))
    story.append(FlowDiagram())
    story.append(Spacer(1, 6 * mm))

    story.append(p("2.2 核心功能", "H2CN"))
    story.append(table([
        ["功能模块", "解决的问题", "核心能力"],
        ["Dashboard 工作台", "创作者不知道下一步该做什么。", "汇总当前优先级、最近记录、画像信号和下一步行动。"],
        ["Profile 创作者画像", "定位、受众、风格和规则分散。", "保存身份、目标用户、表达边界、平台偏好、长期记忆。"],
        ["Director 脚本创作", "从想法到可发布内容之间缺少结构。", "有限轮追问，生成图文笔记或视频脚本，包含标题、封面、正文/口播、时间轴与发布清单。"],
        ["Doctor 内容复盘", "不知道作品具体哪里掉点。", "支持图文/视频诊断，结合素材、关键数据、留存曲线、关键帧与口播稿定位问题。"],
        ["Assistant 评论助手", "评论区没有转化成选题和关系运营。", "拆解评论意图、情绪阻力、隐藏需求、回复方向、风险与下一期内容。"],
        ["History 创作记录", "每次任务割裂，无法回看。", "保存各模块历史会话，支持从历史复盘作品进入评论分析。"],
        ["Memory Writeback", "洞察无法复用。", "把稳定规则转成候选记忆，经确认后写回创作者画像。"],
    ], [34 * mm, 58 * mm, 68 * mm], header=True))

    story.append(p("2.3 产品架构 / 功能图", "H2CN"))
    story.append(table([
        ["层级", "项目实现"],
        ["前端界面", "Next.js App Router 页面：/dashboard、/director、/doctor、/assistant、/history、/profile、/onboarding。"],
        ["交互组件", "components/*-studio.tsx 承载各模块工作台；site-header、memory-widget、onboarding-overlay 负责导航和记忆展示。"],
        ["Agent 编排层", "lib/agent/orchestrator.ts 调用模块配置、画像记忆、模型适配器和归一化逻辑。"],
        ["模块提示词与回退", "lib/agent/module-configs.ts 定义 Director / Doctor / Assistant / Profile 的系统提示词、追问预算、fallback 输出。"],
        ["模型适配层", "lib/agent/llm.ts 支持 OpenAI-compatible 与 Anthropic-compatible JSON 调用。无 API Key 时提供可演示的确定性回退结果。"],
        ["数据层", "Postgres 优先；本地 Demo 使用 .data/agent-store.json 存储 profiles、memories、sessions、artifacts。"],
        ["上传与素材", "支持 Vercel Blob、图片压缩、视频关键帧提取、口播转写、素材注册为 artifact。"],
    ], [35 * mm, 125 * mm], header=True))

    story.append(p("2.4 交互流程", "H2CN"))
    story.append(bullets([
        "首次或默认进入 Dashboard，查看当前画像、近期任务和下一步建议。",
        "进入 Director，选择图文或视频，填写素材、目标、语气、平台和结构；Agent 先追问关键判断，再输出可发布内容。",
        "作品发布后进入 Doctor，上传图文/视频素材与数据；Agent 生成主要问题、证据、时间轴和修改动作，并可按诊断结论重写脚本。",
        "进入 Assistant，选择作品来源并粘贴评论；Agent 输出评论真实意图、回复草稿、风险提示与下一条内容方向。",
        "对稳定洞察点击写回，Profile 在后续任务中继续作为上下文。"
    ]))

    story.append(p("2.5 创新与差异化", "H2CN"))
    story.append(bullets([
        "从“生成内容”升级为“创作者经营闭环”：生成、复盘、评论运营、画像记忆持续互相喂养。",
        "Director 不直接套模板，而是强制确认“谁会停下、想让他做什么、记住哪句话”三个创作判断。",
        "Doctor 以证据为中心，要求引用关键帧、留存时间点、口播时间段或用户给出的数据，避免空泛评价。",
        "Assistant 把评论区转化成下一轮选题输入，同时保留风险控制和高情商回复策略。",
        "无 API Key 也可跑通 Demo，降低评审和展示时的依赖风险。"
    ]))

    story.append(PageBreak())
    story.append(p("模块三：AI 原生能力说明", "H1CN"))
    story.append(p("3.1 AI 核心能力", "H2CN"))
    story.append(table([
        ["能力", "在产品中的作用"],
        ["大模型对话与结构化输出", "所有模块要求输出 JSON，便于前端稳定展示、写回记忆和保存历史。"],
        ["多轮追问与意图收敛", "Director 使用有限追问预算，按线性规则逐步确认创作判断，减少反复沟通成本。"],
        ["多模态理解", "Doctor 和 Assistant 可接收图片、评论截图、留存曲线、视频关键帧等素材，支持视觉证据参与分析。"],
        ["视频辅助分析", "Doctor 前端具备视频时长读取、关键帧提取、口播转写、脚本字数约束和按诊断结论重写能力。"],
        ["长期记忆", "Profile 与 MemoryCandidate 机制区分单次结论和可复用洞察，防止把偶然反馈直接固化为长期规则。"],
        ["模型兼容", "支持 OpenAI-compatible 与 Anthropic-compatible provider 配置，便于部署时切换模型平台。"],
    ], [42 * mm, 118 * mm], header=True))

    story.append(p("3.2 AI 如何解决痛点", "H2CN"))
    story.append(table([
        ["用户痛点", "AI 解决方式"],
        ["不知道内容应该先打谁", "Director 将受众处境抽成 rootProblem，并用 suggestions 帮用户选择可落地的人群入口。"],
        ["脚本容易铺垫太久", "Profile 记忆中明确“前 10 秒先给结论”，Doctor 也会把背景铺陈与掉点关联起来。"],
        ["复盘缺少证据", "Doctor 输出必须包含 mainIssue、evidence、timeline、actions，并尽量引用具体时间、截图、口播或数据。"],
        ["评论区难以转成增长", "Assistant 区分高价值评论、风险评论、隐藏需求和下一期内容机会。"],
        ["创作经验沉淀不下来", "writebackCandidates 先作为候选，经确认后写入长期画像，成为后续 Agent 的上下文。"],
    ], [48 * mm, 112 * mm], header=True))

    story.append(p("3.3 AI 技术方案", "H2CN"))
    story.append(bullets([
        "模型调用：lib/agent/llm.ts 根据环境变量选择 OpenAI-compatible 或 Anthropic-compatible 接口，统一要求 JSON 输出。",
        "提示词约束：module-configs.ts 为每个模块设定硬性输出规则，避免模型输出 Markdown、泛泛总结或无法解析文本。",
        "结果归一化：normalizeRunResult、normalizeDirectorOutput、normalizeDoctorOutput 对模型输出进行字段补齐和结构保护。",
        "素材进入 Agent：前端把上传文件注册为 ArtifactRecord，图片转 data URL，视频抽关键帧并可转写口播，作为 visualInputs 或 extractedText 提供给模型。",
        "记忆治理：候选记忆包含 category、key、value、reason、confidence、writePolicy，区分 user_confirmed、repeated_signal 与 candidate_only。",
        "回退模式：没有模型密钥时，buildFallbackRun 根据模块生成可演示输出，保证 Demo 链路完整。"
    ]))

    story.append(PageBreak())
    story.append(p("模块四：加分项（可选）", "H1CN"))
    story.append(p("4.1 落地可行性", "H2CN"))
    story.append(bullets([
        "技术路径清晰：Next.js 15 + React 19 + TypeScript，天然适合 Vercel 部署；API routes 覆盖 profile、sessions、artifacts、uploads、dashboard、history。",
        "数据持久化可升级：本地 JSON 便于 Demo，生产环境已预留 Postgres 表 agent_profiles、agent_memories、agent_sessions、agent_artifacts。",
        "上传链路可扩展：已接入 Vercel Blob 客户端上传，并保留大文件超时、关键帧压缩、音频转写等处理逻辑。",
        "评审可演示：即使缺少 API Key，也能以 fallback 模式完整展示创作、复盘和评论分析体验。"
    ]))
    story.append(p("4.2 商业化思考", "H2CN"))
    story.append(table([
        ["方向", "说明"],
        ["盈利模式", "Freemium + 订阅制：免费提供基础画像和少量生成/复盘次数，Pro 版提供多模态复盘、长期记忆、批量评论分析和导出。"],
        ["目标市场", "小红书、抖音、B站等平台上的知识型 KOC、考研/职场/成长类博主、MCN 内容运营团队。"],
        ["竞争优势", "相较通用 ChatGPT 文案工具，本产品围绕创作者完整生命周期设计，能把历史表现和评论反馈写回长期画像。"],
        ["可扩展服务", "垂类模板包、账号诊断报告、团队协作、内容日历、平台数据接口、投放前脚本评估。"],
    ], [35 * mm, 125 * mm], header=True))

    story.append(p("4.3 当前限制与下一步", "H2CN"))
    story.append(bullets([
        "当前文件上传偏“素材注册 + 前端预处理”，生产级深度视频理解仍需要稳定的存储、OCR、视觉模型和音频转写服务。",
        "本地 JSON Store 适合单机 Demo，不适合线上多用户长期使用；正式上线应接 Postgres 并加入账号体系。",
        "可补充测试：session 创建、run 结果归一化、writeback 行为、store mutation、视频/图片上传异常路径。",
        "建议补齐部署链接、参赛人姓名、真实 Demo 截图或二维码后提交。"
    ]))

    story.append(Spacer(1, 8 * mm))
    story.append(p(f"生成日期：{date.today().isoformat()}；资料来源：项目根目录 README.md、Implementation_Plan.md、lib/agent/*、components/*-studio.tsx、.data/agent-store.json。", "SmallCN"))
    return story


def main() -> None:
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="IP Creator Agent 说明文档",
        author="Codex",
    )
    story = build_story()
    doc.build(story, onFirstPage=add_page_header, onLaterPages=add_page_header)
    print(OUTPUT)


if __name__ == "__main__":
    main()
