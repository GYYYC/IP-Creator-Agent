export const navItems = [
  { href: "/dashboard", label: "工作台" },
  { href: "/director", label: "脚本创作" },
  { href: "/doctor", label: "内容复盘" },
  { href: "/assistant", label: "评论助手" },
  { href: "/history", label: "创作记录" }
];

export const creatorMemory = {
  title: "真实经验内容创作者",
  subtitle: "个人经验 / 实用方法 · 图文与视频",
  tags: ["真实经验", "方法论", "不制造焦虑"],
  notes: [
    {
      title: "目标受众",
      body: "正在被一个具体问题困住、需要可执行建议的用户。"
    },
    {
      title: "高表现内容",
      body: "真实经历拆解、避坑提醒、下一步行动建议。"
    },
    {
      title: "历史风险",
      body: "开场先讲背景时，前 15 秒留存明显变差。"
    },
    {
      title: "下次规则",
      body: "前 10 秒先给结论，再补经历，不要一开始铺陈。"
    }
  ]
};

export const profileAssetInsights = {
  graphic: [
    {
      title: "稳定优势",
      body: "你过往图文里最容易被收藏的是“低门槛可执行步骤”，而不是泛泛安慰。"
    },
    {
      title: "内容风险",
      body: "首图如果先讲背景，读者会在第二屏流失，更适合直接抛出痛点或结论。"
    },
    {
      title: "可复用规则",
      body: "标题先写困境，再补结果，会比单纯写经验分享更容易打中目标受众。"
    },
    {
      title: "写回画像",
      body: "图文内容适合保持“陪伴感 + 方法论”，结尾继续用问题把读者引向评论区。"
    }
  ],
  video: [
    {
      title: "稳定优势",
      body: "你的视频在真实经历切入时更容易建立信任，方法段会明显拉回停留。"
    },
    {
      title: "内容风险",
      body: "一旦开头先交代背景，前 15 秒留存会明显下滑，需要更早给结论。"
    },
    {
      title: "可复用规则",
      body: "先抛一句经历里的关键判断，再切进 2 到 3 个动作，会更适合你的表达。"
    },
    {
      title: "写回画像",
      body: "后续视频脚本可以默认保留“真实经历 + 可执行动作”的节奏，不要长铺垫。"
    }
  ]
};

export const onboardingFlow = [
  {
    id: "origin",
    step: 1,
    label: "认识你",
    title: "先从你最想被记住的一面开始",
    description: "先告诉我最能代表你的那一面，后面的内容会更好写。",
    fields: [
      {
        key: "first-impression",
        label: "如果别人第一次刷到你，你最希望他们先记住什么？",
        placeholder:
          "例如：我是有真实经验的人，擅长把复杂问题拆成普通人能理解、能执行的步骤。"
      },
      {
        key: "story-source",
        label: "哪段经历最值得反复讲给别人听？",
        placeholder: "例如：从崩溃式备考到重新建立节奏，这段经历最能代表我。"
      }
    ],
    preview: [
      "你靠什么让人相信",
      "内容应该保持什么气质",
      "你最适合站在哪个位置"
    ]
  },
  {
    id: "audience",
    step: 2,
    label: "理解受众",
    title: "再告诉我，你最想帮助谁",
    description: "你不需要对所有人说话，只需要先说服最需要你的人。",
    fields: [
      {
        key: "audience",
        label: "你最想影响的是哪类人？",
        placeholder: "例如：正在被一个具体问题困住、需要可靠方法和行动顺序的人。"
      },
      {
        key: "pain-point",
        label: "他们现在最卡住的是什么？",
        placeholder: "例如：不是不知道要学什么，而是不知道怎样稳定地坚持。"
      }
    ],
    preview: [
      "你最该对谁说话",
      "他们正在被什么卡住",
      "下一条内容先打哪里"
    ]
  },
  {
    id: "style",
    step: 3,
    label: "定义表达",
    title: "最后把你的表达方式定下来",
    description: "这一部分会影响图文、视频和后续脚本的整体语气。",
    fields: [
      {
        key: "tone",
        label: "你更希望大家觉得你是有方法、有陪伴感，还是有推动力？",
        placeholder: "例如：我想让人觉得我很稳，有方法，但不会高高在上。"
      },
      {
        key: "reference",
        label: "有没有你喜欢的表达方式或创作者类型？",
        placeholder: "例如：真实经验型创作者、方法论老师、反焦虑成长型博主。"
      }
    ],
    preview: [
      "脚本会贴近你的语气",
      "图文和视频共用这套表达",
      "不适合你的写法会少一点"
    ]
  }
];

export const agentCards = [
  {
    id: "01",
    href: "/director",
    title: "脚本创作",
    subtitle: "把一个想法整理成可发布内容",
    description:
      "从素材、经历、主题出发，生成图文笔记或视频脚本，并通过有限轮追问补齐关键信息。",
    bullets: ["图文与视频双模式", "有限轮追问", "发布时间和引导建议"]
  },
  {
    id: "02",
    href: "/doctor",
    title: "内容复盘",
    subtitle: "看清这条内容哪里出了问题",
    description:
      "围绕图文和视频做诊断，视频模式重点分析内容节点和留存曲线的对齐关系。",
    bullets: ["视频掉点定位", "图文结构诊断", "下一次怎么改"]
  },
  {
    id: "03",
    href: "/assistant",
    title: "评论助手",
    subtitle: "把评论区变成下一轮增长输入",
    description:
      "识别高价值评论、风险评论和适合置顶的讨论点，生成更像创作者本人的回复策略。",
    bullets: ["评论价值分层", "风向控制建议", "回复草稿"]
  }
];

export const directorFollowups = [
  "这条内容里，你最想让人记住的一句话是什么？",
  "你更希望观众先被共鸣打中，还是先得到一套方法？",
  "如果只能保留一个最有说服力的细节，你会留哪一个？"
];

export const directorOutputs = [
  {
    title: "图文模式",
    items: ["标题 5 个", "正文优化版", "封面文案", "标签建议", "发布时间建议"]
  },
  {
    title: "视频模式",
    items: ["3 秒开头", "完整口播脚本", "段落节奏", "结尾引导", "冗余段落标注"]
  }
];

export const directorDrafts = {
  quickStats: [
    { label: "内容形态", value: "视频" },
    { label: "当前风格", value: "陪伴感 + 方法论" },
    { label: "建议时长", value: "60 秒内" }
  ],
  followups: [
    "你最想让人记住的那一句话是什么？",
    "你想先讲自己的经历，还是先把方法讲出来？",
    "这条内容里最能证明你的细节是什么？"
  ],
  outlines: [
    {
      title: "开头",
      content: "先讲一句最关键的判断：真正卡住你的，可能不是意志力，而是第一步太大。"
    },
    {
      title: "中段",
      content: "快速交代真实处境，然后直接切进你怎么把问题拆成能执行的小动作。"
    },
    {
      title: "结尾",
      content: "给出三个可以马上照着做的动作，并引导评论区说出自己最卡的地方。"
    }
  ],
  hooks: [
    "如果你也卡在这一步，先别急着硬扛。",
    "今天不讲大道理，只讲一个能立刻开始的小动作。"
  ]
};

export const doctorModes = [
  {
    title: "图文",
    note: "上传笔记内容、封面和数据截图，这里负责分析结构、首图、标题和互动表现。"
  },
  {
    title: "视频",
    note: "上传视频、留存图和关键数据，这里重点做时间轴对齐分析。"
  }
];

export const videoTimeline = [
  {
    label: "0s - 5s",
    title: "身份建立很快",
    description: "你一开始就让人知道这是来自真实经历的判断，信任建立得不错。",
    variant: "success"
  },
  {
    label: "15s - 22s",
    title: "明显掉点出现",
    description: "进入背景铺陈后，信息密度下降，留存从 72% 掉到 41%。",
    variant: "warning"
  },
  {
    label: "28s - 45s",
    title: "方法段把人拉回来",
    description: "具体方法出现后，评论区开始出现高价值问题和收藏意图。",
    variant: "success"
  }
];

export const assistantItems = [
  {
    type: "高价值评论",
    quote: "能不能出一期更具体的操作方法？",
    action: "优先回复，并进入下一期选题池。"
  },
  {
    type: "需要安抚",
    quote: "你这种方法不适合基础差的人，看着就焦虑。",
    action: "先共情，再说明适用范围，避免直接反驳。"
  },
  {
    type: "适合置顶",
    quote: "这个步骤能不能做成模板？",
    action: "建议置顶，并承接成下一期内容或资料钩子。"
  }
];
