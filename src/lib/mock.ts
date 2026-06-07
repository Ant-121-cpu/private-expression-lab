import { calculateWeightedScore } from "./scoring";
import type { AnalysisResult, Material } from "./types";

export function mockTopic(materials: Material[]) {
  const first = materials[0];
  return {
    topic: first ? `我为什么会被「${first.title}」触发思考？` : "今天我真正想说明白的一件小事",
    goal: "用一个清晰观点统领三段表达，减少铺垫和重复解释。",
    angles: ["这件事本身发生了什么", "它触发了我的哪个判断", "我准备如何把判断说得更短"]
  };
}

export function mockAnalysis(roughDraft: string): AnalysisResult {
  const fillerWords = ["主要", "然后", "其实", "就是", "可能"];
  const redundantWords = fillerWords
    .map((word) => ({ word, count: roughDraft.split(word).length - 1 }))
    .filter((item) => item.count > 0)
    .map((item) => ({
      text: item.word,
      type: "口头填充词",
      impact: `「${item.word}」反复出现，会让观点显得来得慢，听众需要等待真正的判断。`,
      mechanism: "工作记忆超载时，大脑会用填充词争取组织时间；训练重点是允许停顿。",
      suggestedReplacement: "先停顿半秒，再直接说判断或下一层观点。"
    }));

  const breakdown = {
    brevity: redundantWords.length ? 68 : 82,
    structure: 74,
    viewpoint: 76,
    density: 72,
    cameraPresence: 70
  };

  return {
    title: "把一个想法说短，而不是说满",
    coreMessage: "表达不是把所有想法都倒出来，而是让别人更快抓住你最想说的那一句。",
    draftDiagnosis: {
      logicSummary: "粗稿已经有训练目标，但观点出现偏晚，多个想法挤在一起，缺少先结论后支撑的结构。",
      currentStructure: ["先描述自己表达啰嗦", "再解释想减少冗余词", "最后提出想练视频表达"],
      mainProblems: [
        {
          problem: "核心判断出现太晚",
          evidence: "开头连续铺垫“主要想说、主要以下几点”，但没有马上给出结论。",
          reason: "你在边想边组织，所以先用铺垫给自己争取时间。",
          mechanism: "金字塔表达和工作记忆减负：先说结论，可以降低后续组织压力。",
          fix: "第一句话直接说“我想练的是把想法说短”。"
        },
        {
          problem: "表达块没有分层",
          evidence: "冗余词、总结能力、视频日记目标被连在一起说。",
          reason: "多个训练目标同时出现，听众不容易判断主次。",
          mechanism: "分块表达：每段只承担一个功能，减少认知负荷。",
          fix: "拆成触发点、核心判断、练习方法三个部分。"
        }
      ],
      redundantExpressions: redundantWords
    },
    score: {
      total: calculateWeightedScore(breakdown),
      breakdown,
      comment: "你最值得优先练的是先说结论，再用例子支撑。"
    },
    rewriteStrategy: {
      before: "原稿像是在边想边说，重点被多个铺垫词和并列想法冲淡了。",
      after: "先提炼一个核心判断，再用三个短段落支撑，最后回到个人练习目标。",
      oneThingToPractice: "录制时第一句话就说出核心观点。"
    },
    videoDiaryScript: {
      openingHook: "我发现自己说话时，常常不是没想法，而是想法太多，结果说得不够清楚。",
      coreStatement: "我现在最想练的，是把一个想法说短，而不是把所有背景都说完。",
      partOne: "以前我一开口，就容易先说很多铺垫，比如“主要”“其实”“然后”。这些词看起来没什么，但它们会把真正的观点往后推。",
      partTwo: "这背后其实是我在边想边说。大脑还没分好层，就先用填充词把句子接住。但对听的人来说，重点就会变得模糊。",
      partThree: "所以我想给自己一个练习：每次录视频前，只先写一句核心判断。录的时候，先把这句话说出来，再补充例子。",
      personalReflection: "我不需要一次说得很完整，我更需要让表达有顺序、有停顿，也有一个清楚的重心。",
      closing: "今天的练习目标很简单：少一点铺垫，多一点判断。"
    },
    teleprompterVersion:
      "我发现自己说话时，常常不是没想法，而是想法太多，结果说得不够清楚。我现在最想练的，是把一个想法说短，而不是把所有背景都说完。以前我一开口，就容易先说很多铺垫，比如“主要”“其实”“然后”。这些词看起来没什么，但它们会把真正的观点往后推。这背后其实是我在边想边说。大脑还没分好层，就先用填充词把句子接住。但对听的人来说，重点就会变得模糊。所以我想给自己一个练习：每次录视频前，只先写一句核心判断。录的时候，先把这句话说出来，再补充例子。我不需要一次说得很完整，我更需要让表达有顺序、有停顿，也有一个清楚的重心。今天的练习目标很简单：少一点铺垫，多一点判断。",
    practiceAdvice: ["先写一句核心判断，再开始录制。", "卡住时停顿半秒，不要立刻用填充词补空白。", "每段只承担一个功能：触发点、判断、例子或收束。"]
  };
}
