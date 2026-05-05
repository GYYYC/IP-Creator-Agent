"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { postJson, patchJson } from "@/lib/client-api";
import { onboardingFlow } from "@/lib/demo-data";

const STORAGE_KEY = "ip-creator-onboarding-dismissed";
const EMPTY_VALUES = Object.fromEntries(
  onboardingFlow.flatMap((step) => step.fields.map((field) => [field.key, ""]))
);

async function patchProfile(body: Record<string, unknown>) {
  await patchJson<unknown>("/api/profile", body);
}

async function registerHistoryWork(file: File) {
  await postJson<unknown>("/api/artifacts/register", {
    kind: "history_work",
    mimeType: file.type || "application/octet-stream",
    fileName: file.name,
    sizeBytes: file.size
  });
}

function fileNames(files: File[]) {
  if (!files.length) {
    return [];
  }

  return files.map((file) => file.name);
}

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(EMPTY_VALUES);
  const [historyFiles, setHistoryFiles] = useState<File[]>([]);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  const step = onboardingFlow[stepIndex];
  const progress = useMemo(
    () => ((stepIndex + 1) / onboardingFlow.length) * 100,
    [stepIndex]
  );

  function closeOverlay() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  }

  async function finishOnboarding() {
    try {
      await patchProfile({
        identity: {
          firstImpression: values["first-impression"],
          storySource: values["story-source"]
        },
        audience: {
          target: values.audience,
          painPoint: values["pain-point"]
        },
        style: {
          tone: values.tone,
          reference: values.reference
        }
      });
      await Promise.all(historyFiles.map(registerHistoryWork));
    } catch {
      // Keep entry smooth; profile details can be completed later.
    }
    closeOverlay();
  }

  function handleHistoryFiles(event: ChangeEvent<HTMLInputElement>) {
    setHistoryFiles(Array.from(event.target.files ?? []));
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="overlay-shell" role="dialog" aria-modal="true">
      <div className="overlay-backdrop" onClick={closeOverlay} />
      <div className="overlay-card">
        {!started ? (
          <div className="overlay-welcome">
            <div className="overlay-header">
              <div>
                <span className="label">首次进入</span>
                <h2>先让我认识你一点点</h2>
                <p>告诉我你想被谁记住、想陪谁往前走，我会把后面的脚本、复盘和回复写得更像你。</p>
              </div>
              <button className="button-secondary" onClick={closeOverlay} type="button">
                稍后再说
              </button>
            </div>

            <div className="overlay-welcome-grid">
              <div className="surface-card glass onboarding-side-card">
                <span className="label">这一轮会先完成</span>
                <div className="action-bullets">
                  <div className="bullet-row">
                    <span className="bullet-dot" />
                    <span>确定最容易被记住的身份和经历</span>
                  </div>
                  <div className="bullet-row">
                    <span className="bullet-dot" />
                    <span>确认最值得先打中的受众和痛点</span>
                  </div>
                  <div className="bullet-row">
                    <span className="bullet-dot" />
                    <span>把脚本、复盘和评论回复调成你的表达</span>
                  </div>
                </div>
              </div>

              <div className="surface-card glass onboarding-side-card">
                <span className="label">你可以这样进入</span>
                <div className="action-list">
                  <div className="action-row">
                    <div>
                      <strong>现在填写</strong>
                      <div>Agent 更懂你的意思。</div>
                    </div>
                  </div>
                  <div className="action-row">
                    <div>
                      <strong>稍后再说</strong>
                      <div>先去工作台也可以，后面能在个人画像里继续补完。</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overlay-footer">
              <div className="page-actions">
                <button className="button-primary" onClick={() => setStarted(true)} type="button">
                  立即填写
                </button>
                <button className="button-secondary" onClick={closeOverlay} type="button">
                  稍后再说
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="overlay-question-shell">
            <div className="overlay-header">
              <div>
                <span className="label">{step.label}</span>
                <h2>{step.title}</h2>
                <p>{step.description}</p>
              </div>
              <button className="button-secondary" onClick={closeOverlay} type="button">
                稍后再说
              </button>
            </div>

            <div className="step-progress">
              {onboardingFlow.map((item, index) => (
                <span
                  className={`step-dot ${index === stepIndex ? "active" : ""}`}
                  key={item.id}
                />
              ))}
            </div>

            <div className="progress-bar" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="overlay-welcome-grid onboarding-question-grid">
              <div className="question-cluster">
                {step.fields.map((field) => (
                  <div className="input-group" key={field.key}>
                    <label htmlFor={field.key}>{field.label}</label>
                    <textarea
                      id={field.key}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: event.target.value
                        }))
                      }
                      placeholder={field.placeholder}
                      rows={4}
                      value={values[field.key]}
                    />
                  </div>
                ))}

                {stepIndex === onboardingFlow.length - 1 ? (
                  <label className="upload-card profile-upload-card onboarding-history-upload">
                    <strong>也可以放几条之前的作品</strong>
                    <span>选填。图文截图、视频、文案文档都可以，后面会用来判断你的稳定风格。</span>
                    <input
                      accept="image/*,video/*,.txt,.md,.pdf"
                      className="file-input"
                      multiple
                      onChange={handleHistoryFiles}
                      type="file"
                    />
                    {historyFiles.length ? (
                      <div className="selected-files">
                        {fileNames(historyFiles).map((name) => (
                          <span key={name}>{name}</span>
                        ))}
                      </div>
                    ) : null}
                  </label>
                ) : null}
              </div>

              <aside className="surface-card glass onboarding-side-card">
                <span className="label">我会先记住</span>
                <div className="action-bullets">
                  {step.preview.map((item) => (
                    <div className="bullet-row" key={item}>
                      <span className="bullet-dot" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <div className="overlay-footer">
              <div className="page-actions">
                <button
                  className="button-secondary"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
                  type="button"
                >
                  上一步
                </button>
                {stepIndex < onboardingFlow.length - 1 ? (
                  <button
                    className="button-primary"
                    onClick={() =>
                      setStepIndex((value) =>
                        Math.min(onboardingFlow.length - 1, value + 1)
                      )
                    }
                    type="button"
                  >
                    下一步
                  </button>
                ) : (
                  <button className="button-primary" onClick={finishOnboarding} type="button">
                    完成并进入工作台
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
