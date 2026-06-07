export type MaterialType = "news" | "idea" | "note";

export type Material = {
  id: number;
  title: string;
  type: MaterialType;
  content: string;
  sourceUrl?: string | null;
  createdAt: string;
};

export type ScoreBreakdown = {
  brevity: number;
  structure: number;
  viewpoint: number;
  density: number;
  cameraPresence: number;
};

export type AnalysisResult = {
  title: string;
  coreMessage: string;
  draftDiagnosis: {
    logicSummary: string;
    currentStructure: string[];
    mainProblems: Array<{
      problem: string;
      evidence: string;
      reason: string;
      mechanism: string;
      fix: string;
    }>;
    redundantExpressions: Array<{
      text: string;
      type: string;
      impact: string;
      mechanism: string;
      suggestedReplacement: string;
    }>;
  };
  score: {
    total: number;
    breakdown: ScoreBreakdown;
    comment: string;
  };
  rewriteStrategy: {
    before: string;
    after: string;
    oneThingToPractice: string;
  };
  videoDiaryScript: {
    openingHook: string;
    coreStatement: string;
    partOne: string;
    partTwo: string;
    partThree: string;
    personalReflection: string;
    closing: string;
  };
  teleprompterVersion: string;
  practiceAdvice: string[];
};

export type TrainingSession = {
  id: number;
  topic: string;
  transcript: string;
  materialIds: number[];
  selfNote?: string | null;
  createdAt: string;
  analysis?: AnalysisResult;
};

export type HistorySummary = {
  sessions: TrainingSession[];
  topRedundantWords: Array<{ word: string; count: number }>;
  averageScore: number;
  scoreTrend: Array<{ date: string; total: number }>;
};
