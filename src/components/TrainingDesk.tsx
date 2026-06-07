"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  Brain,
  ClipboardList,
  Gauge,
  Loader2,
  Mic,
  MessageSquareText,
  Mic2,
  PenLine,
  Sparkles,
  Square,
  Target,
  Video
} from "lucide-react";
import type { AnalysisResult, HistorySummary } from "@/lib/types";
import { SCORE_LABELS } from "@/lib/scoring";

const emptyHistory: HistorySummary = {
  sessions: [],
  topRedundantWords: [],
  averageScore: 0,
  scoreTrend: []
};

type TabId = "draft" | "diagnosis" | "script" | "history";

const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "draft", label: "粗稿", icon: <PenLine size={18} /> },
  { id: "diagnosis", label: "诊断", icon: <Brain size={18} /> },
  { id: "script", label: "脚本", icon: <Video size={18} /> },
  { id: "history", label: "复盘", icon: <BookOpenCheck size={18} /> }
];

const scriptLabels: Record<keyof AnalysisResult["videoDiaryScript"], string> = {
  openingHook: "开场钩子",
  coreStatement: "核心观点",
  partOne: "第一段",
  partTwo: "第二段",
  partThree: "第三段",
  personalReflection: "个人反思",
  closing: "收束句"
};

export function TrainingDesk() {
  const [activeTab, setActiveTab] = useState<TabId>("draft");
  const [roughDraft, setRoughDraft] = useState("");
  const [selfNote, setSelfNote] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistorySummary>(emptyHistory);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("豆包语音输入：点击开始录音，停止后自动转写到粗稿。");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speechSocketRef = useRef<WebSocket | null>(null);
  const streamBaseTextRef = useRef("");

  async function loadHistory() {
    const response = await fetch("/api/history");
    setHistory((await response.json()) as HistorySummary);
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function analyzeDraft() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roughDraft, selfNote })
      });
      const data = (await response.json()) as { analysis?: AnalysisResult; error?: string };
      if (!response.ok || !data.analysis) throw new Error(data.error || "分析失败。");
      setAnalysis(data.analysis);
      setActiveTab("diagnosis");
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "分析失败。");
    } finally {
      setLoading(false);
    }
  }

  async function startVoiceInput() {
    setError("");
    setVoiceStatus("正在连接豆包流式语音模型...");
    try {
      setRecording(true);
      streamBaseTextRef.current = roughDraft.trim();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/asr/stream`);
      socket.binaryType = "arraybuffer";
      speechSocketRef.current = socket;

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as {
          type: "ready" | "result" | "error" | "done" | "closed";
          text?: string;
          error?: string;
        };

        if (message.type === "ready") {
          void beginMicrophoneStream(socket).catch((caught) => {
            setError(caught instanceof Error ? caught.message : "无法启动麦克风。");
            stopVoiceInput();
          });
        }

        if (message.type === "result" && message.text) {
          const prefix = streamBaseTextRef.current ? `${streamBaseTextRef.current}\n\n` : "";
          setRoughDraft(`${prefix}${message.text}`.trim());
        }

        if (message.type === "error") {
          setError(message.error || "豆包流式识别失败。");
          setVoiceStatus("语音识别失败。");
          stopVoiceInput();
        }

        if (message.type === "done") {
          setVoiceStatus("语音输入完成，已写入粗稿。");
        }

        if (message.type === "closed") {
          setRecording(false);
          setVoiceStatus("语音输入已结束。");
        }
      };

      socket.onerror = () => {
        setError("无法连接本地语音流代理。");
        setVoiceStatus("语音输入未启动。");
        stopVoiceInput();
      };
    } catch (caught) {
      setRecording(false);
      setVoiceStatus("语音输入未启动。");
      setError(caught instanceof Error ? caught.message : "无法启动麦克风。");
    }
  }

  function stopVoiceInput() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    void audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (speechSocketRef.current?.readyState === WebSocket.OPEN) {
      speechSocketRef.current.send(JSON.stringify({ type: "stop" }));
      setTimeout(() => speechSocketRef.current?.close(), 800);
    }
    setRecording(false);
    setVoiceStatus("正在收尾识别结果...");
    processorRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    speechSocketRef.current = null;
  }

  async function beginMicrophoneStream(socket: WebSocket) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风录音。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error("当前浏览器不支持音频采集。");
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    sourceRef.current = source;
    processorRef.current = processor;

    processor.onaudioprocess = (event) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleTo16kPcm(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      if (pcm.byteLength) socket.send(pcm);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setVoiceStatus("流式识别中。直接把粗稿说出来，文字会实时写入。");
  }

  const scoreItems = analysis
    ? (Object.entries(analysis.score.breakdown) as Array<[keyof AnalysisResult["score"]["breakdown"], number]>)
    : [];

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Video diary expression lab</p>
          <h1>表达训练台</h1>
        </div>
        <div className="status-strip" aria-label="训练概览">
          <span>
            <Mic2 size={16} /> {history.sessions.length} 次练习
          </span>
          <span>
            <Gauge size={16} /> 平均 {history.averageScore || "-"}
          </span>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="tab-stage">
        {activeTab === "draft" ? (
        <section className="panel draft-panel">
          <div className="panel-heading">
            <PenLine size={20} />
            <div>
              <h2>表达粗稿</h2>
              <p>直接粘贴未经结构化的想法。它可以啰嗦、跳跃、重复，AI 会先诊断再重构。</p>
            </div>
          </div>

          <label className="field-label" htmlFor="rough-draft">
            原始表达
          </label>
          <textarea
            id="rough-draft"
            className="rough-draft-input"
            value={roughDraft}
            onChange={(event) => setRoughDraft(event.target.value)}
            placeholder="例如：我今天主要想说的是，主要以下几点……其实我发现自己表达的时候会有很多重复的词，然后观点又出现得比较慢……"
            rows={16}
          />

          <div className="voice-panel">
            <button
              className={recording ? "danger-action" : "secondary-action"}
              onClick={recording ? stopVoiceInput : startVoiceInput}
              type="button"
            >
              {recording ? <Square size={18} /> : <Mic size={18} />}
              {recording ? "停止录音并转写" : "语音输入粗稿"}
            </button>
            <p>{voiceStatus}</p>
          </div>

          <label className="field-label" htmlFor="practice-note">
            本次练习备注
          </label>
          <input
            id="practice-note"
            value={selfNote}
            onChange={(event) => setSelfNote(event.target.value)}
            placeholder="比如：想练开场更短、减少“主要”、增强镜头感"
          />

          <button className="analyze-action" onClick={analyzeDraft} disabled={loading || !roughDraft.trim()}>
            {loading ? <Loader2 className="spin" size={18} /> : <ClipboardList size={18} />}
            分析粗稿并生成视频日记脚本
          </button>
        </section>
        ) : null}

        {activeTab === "diagnosis" ? (
        <section className="panel diagnosis-panel">
          <div className="panel-heading">
            <Brain size={20} />
            <div>
              <h2>表达诊断</h2>
              <p>先看逻辑和表达习惯，再看背后的训练机制。</p>
            </div>
          </div>

          {analysis ? (
            <div className="analysis-stack">
              <div className="score-hero">
                <span>{analysis.score.total}</span>
                <div>
                  <p>综合评分</p>
                  <strong>{analysis.score.comment}</strong>
                </div>
              </div>

              <div className="score-grid">
                {scoreItems.map(([key, value]) => (
                  <div key={key} className="score-card">
                    <span>{SCORE_LABELS[key]}</span>
                    <strong>{value}</strong>
                    <div className="meter">
                      <i style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <ArticleBlock icon={<Target size={18} />} title="核心观点">
                <strong className="core-message">{analysis.coreMessage}</strong>
                <p>{analysis.draftDiagnosis.logicSummary}</p>
              </ArticleBlock>

              <ArticleBlock icon={<BarChart3 size={18} />} title="当前结构">
                <div className="structure-list">
                  {analysis.draftDiagnosis.currentStructure.map((item, index) => (
                    <span key={`${item}-${index}`}>{item}</span>
                  ))}
                </div>
              </ArticleBlock>

              <ArticleBlock icon={<Brain size={18} />} title="主要问题与机制">
                <div className="problem-list">
                  {analysis.draftDiagnosis.mainProblems.map((item) => (
                    <article key={item.problem}>
                      <strong>{item.problem}</strong>
                      <p>{item.evidence}</p>
                      <em>{item.reason}</em>
                      <small>{item.mechanism}</small>
                      <b>{item.fix}</b>
                    </article>
                  ))}
                </div>
              </ArticleBlock>

              <ArticleBlock icon={<MessageSquareText size={18} />} title="冗余表达">
                {analysis.draftDiagnosis.redundantExpressions.length ? (
                  <div className="redundant-list">
                    {analysis.draftDiagnosis.redundantExpressions.map((item) => (
                      <div key={`${item.text}-${item.type}`} className="redundant-item">
                        <span>{item.text}</span>
                        <strong>{item.type}</strong>
                        <p>{item.impact}</p>
                        <small>{item.mechanism}</small>
                        <em>{item.suggestedReplacement}</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>这段粗稿没有明显高频冗余表达。</p>
                )}
              </ArticleBlock>
            </div>
          ) : (
            <EmptyPanel icon={<Brain size={36} />} text="提交粗稿后，这里会出现逻辑诊断、冗余表达和训练机制。" />
          )}
        </section>
        ) : null}

        {activeTab === "script" ? (
        <section className="panel script-panel">
          <div className="panel-heading">
            <Video size={20} />
            <div>
              <h2>视频日记脚本</h2>
              <p>不是书面润色稿，而是你可以面对镜头自然说出来的练习稿。</p>
            </div>
          </div>

          {analysis ? (
            <div className="analysis-stack">
              <ArticleBlock icon={<Sparkles size={18} />} title={analysis.title}>
                <div className="rewrite-box">
                  <p>
                    <span>重构前</span>
                    {analysis.rewriteStrategy.before}
                  </p>
                  <p>
                    <span>重构后</span>
                    {analysis.rewriteStrategy.after}
                  </p>
                  <strong>{analysis.rewriteStrategy.oneThingToPractice}</strong>
                </div>
              </ArticleBlock>

              <ArticleBlock icon={<Video size={18} />} title="分段脚本">
                <div className="script-grid">
                  {Object.entries(analysis.videoDiaryScript).map(([key, value]) => (
                    <div key={key}>
                      <span>{scriptLabels[key as keyof AnalysisResult["videoDiaryScript"]]}</span>
                      <p>{value}</p>
                    </div>
                  ))}
                </div>
              </ArticleBlock>

              <ArticleBlock icon={<Mic2 size={18} />} title="提词器版本">
                <p className="teleprompter">{analysis.teleprompterVersion}</p>
              </ArticleBlock>

              <ArticleBlock icon={<BookOpenCheck size={18} />} title="本次练习动作">
                <ul>
                  {analysis.practiceAdvice.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </ArticleBlock>
            </div>
          ) : (
            <EmptyPanel icon={<Video size={36} />} text="AI 会把诊断结果转成一份 1 到 3 分钟的视频日记脚本。" />
          )}
        </section>
        ) : null}

        {activeTab === "history" ? (
        <section className="panel history-panel">
          <div className="panel-heading">
            <BarChart3 size={20} />
            <div>
              <h2>复盘历史</h2>
              <p>关注长期变化：冗余表达是否减少，核心观点是否更早出现。</p>
            </div>
          </div>

          <div className="history-grid">
            <div>
              <span className="muted-label">常见冗余表达</span>
              <div className="word-cloud">
                {history.topRedundantWords.map((item) => (
                  <span key={item.word}>
                    {item.word} <b>{item.count}</b>
                  </span>
                ))}
                {!history.topRedundantWords.length ? <p className="empty-copy">暂无冗余表达趋势。</p> : null}
              </div>
            </div>
            <div>
              <span className="muted-label">最近练习</span>
              <div className="session-list">
                {history.sessions.slice(0, 6).map((session) => (
                  <article key={session.id}>
                    <strong>{session.analysis?.title || session.topic}</strong>
                    <p>{session.analysis?.coreMessage || session.transcript}</p>
                    <span>{new Date(session.createdAt).toLocaleString("zh-CN")}</span>
                  </article>
                ))}
                {!history.sessions.length ? <p className="empty-copy">还没有练习记录。</p> : null}
              </div>
            </div>
          </div>
        </section>
        ) : null}
      </div>

      <nav className="bottom-tabs" aria-label="主功能切换">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

function ArticleBlock({
  icon,
  title,
  children
}: Readonly<{ icon: React.ReactNode; title: string; children: React.ReactNode }>) {
  return (
    <article className="article-block">
      <h3>
        {icon}
        {title}
      </h3>
      {children}
    </article>
  );
}

function downsampleTo16kPcm(input: Float32Array, sampleRate: number) {
  const targetRate = 16000;
  const ratio = sampleRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const buffer = new ArrayBuffer(outputLength * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < outputLength; index += 1) {
    const sampleIndex = Math.floor(index * ratio);
    const sample = Math.max(-1, Math.min(1, input[sampleIndex]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return buffer;
}

function EmptyPanel({ icon, text }: Readonly<{ icon: React.ReactNode; text: string }>) {
  return (
    <div className="empty-state">
      {icon}
      <p>{text}</p>
    </div>
  );
}
