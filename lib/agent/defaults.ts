import { BrainSnapshot, CreatorProfile } from "@/lib/agent/types";

export const DEFAULT_BRAIN_SNAPSHOT: BrainSnapshot = {
  title: "陪伴型二战上岸学姐",
  subtitle: "考研 / 学习方法 · 小红书图文与视频",
  tags: ["陪伴感", "方法论", "不制造焦虑"],
  notes: [
    {
      title: "目标受众",
      body: "基础一般、节奏不稳、容易怀疑自己的考研用户。",
      category: "audience"
    },
    {
      title: "高表现内容",
      body: "在职考研时间管理、二战如何重启状态。",
      category: "topic_opportunity"
    },
    {
      title: "历史风险",
      body: "开场先讲背景时，前 15 秒留存明显变差。",
      category: "risk"
    },
    {
      title: "下次规则",
      body: "前 10 秒先给结论，再补经历，不要一开始铺陈。",
      category: "content_rule"
    }
  ]
};

export function createDefaultProfile(id: string, anonId: string): CreatorProfile {
  const now = new Date().toISOString();

  return {
    id,
    anonId,
    displayName: "考研方法创作者",
    identity: {
      role: "二战上岸的陪伴型学姐",
      proof: "有真实备考重启经历，擅长把复杂备考拆成普通人能执行的步骤。"
    },
    audience: {
      target: "基础一般、容易焦虑、节奏总是断掉的考研人。",
      painPoint: "不是不知道要学什么，而是不知道怎样稳定地坚持。"
    },
    style: {
      tone: "温和陪伴 + 方法论",
      boundaries: ["不制造焦虑", "不高高在上", "先给可执行动作"]
    },
    platform: {
      primary: ["小红书", "抖音"],
      formats: ["图文", "视频"]
    },
    brainSnapshot: DEFAULT_BRAIN_SNAPSHOT,
    createdAt: now,
    updatedAt: now
  };
}
