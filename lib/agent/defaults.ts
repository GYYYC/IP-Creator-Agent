import { BrainSnapshot, CreatorProfile } from "@/lib/agent/types";

export const DEFAULT_BRAIN_SNAPSHOT: BrainSnapshot = {
  title: "真实经验内容创作者",
  subtitle: "个人经验 / 实用方法 · 图文与视频",
  tags: ["真实经验", "具体方法", "不制造焦虑"],
  notes: [
    {
      title: "目标受众",
      body: "正在被一个具体问题困住、需要可执行建议的用户。",
      category: "audience"
    },
    {
      title: "高表现内容",
      body: "真实经历拆解、避坑提醒、下一步行动建议。",
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
    displayName: "内容创作者",
    identity: {
      role: "有真实经验的内容创作者",
      proof: "擅长把复杂问题拆成普通人能理解、能执行的步骤。"
    },
    audience: {
      target: "正在被一个具体问题困住、需要可靠方法的人。",
      painPoint: "不是完全不知道方向，而是不知道下一步怎么安全地开始。"
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
